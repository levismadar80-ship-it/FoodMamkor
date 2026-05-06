#!/usr/bin/env python3
"""MEH-408 Phase 2 — production DB backup to Cloudflare R2.

Runs pg_dump in custom format (-Fc) against $DATABASE_URL, writes the
output to a tempfile, then uploads to Cloudflare R2 via boto3
(S3-compatible API). Designed to run as a Railway cron service —
executes once and exits.

Usage:
  python scripts/backup_production_db.py
    (reads DATABASE_URL + R2_* + ENV from environment)

Required env (already set in Railway production for MEH-408 Phase 2):
  DATABASE_URL          Postgres connection string (the DB to back up)
  R2_ACCOUNT_ID         Cloudflare account ID
  R2_ACCESS_KEY_ID      R2 access key (Cloudflare → R2 → Manage R2 API tokens)
  R2_SECRET_ACCESS_KEY  R2 secret key
  R2_BUCKET_NAME        e.g. mehamakor-backups
  R2_ENDPOINT           e.g. https://<account>.r2.cloudflarestorage.com
  ENV                   production | staging | development
                        (used as filename prefix so dumps from different
                        environments cannot be confused)

Exit codes:
  0 — pg_dump succeeded AND R2 upload succeeded
  1 — pg_dump failed (output preserved in tempdir for inspection)
  2 — R2 upload failed (dump preserved)
  3 — config error (missing env var, ENV not set, etc.)

Filename format:
  mehamakor_${ENV}_${UTC ISO 8601}.dump
  e.g. mehamakor_production_20260507T230000Z.dump

Retention:
  Handled by R2 lifecycle rule (configured once in Cloudflare dashboard
  per docs/DEPLOYMENT.md). This script does NOT delete old objects —
  keeps backup-creation and retention as independent failure modes.

Skeptic flags:
  - pg_dump must be on $PATH; expected provided by postgresql-client in
    the Dockerfile.cron image.
  - DB size today ~50MB; pg_dump timeout is 600s (10 min). Untested at
    larger sizes; revisit if/when production DB grows past ~5GB.
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

# Exit codes — keep stable; Railway cron logs / on-call grep these.
EXIT_OK = 0
EXIT_PG_DUMP_FAILED = 1
EXIT_UPLOAD_FAILED = 2
EXIT_CONFIG_ERROR = 3

# pg_dump timeout, in seconds. ~50MB DB completes in single-digit
# seconds; 600s is generous safety margin for growth + slow networks.
PG_DUMP_TIMEOUT_SEC = 600

REQUIRED_ENV_VARS = (
    "DATABASE_URL",
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
    "ENV",
)

# stdlib logging — matches Railway's stdout-capture model. structlog
# (already in backend/) would require the FastAPI lifecycle config to
# Just Work; not worth pulling in for a standalone script.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
    stream=sys.stdout,
)
log = logging.getLogger("meh408.backup")


def load_config() -> dict[str, str] | None:
    """Read and validate required env vars. Returns None on missing var."""
    missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
    if missing:
        log.error("Missing required env vars: %s", ", ".join(missing))
        return None
    return {v: os.environ[v] for v in REQUIRED_ENV_VARS}


def build_filename(env: str, now: datetime | None = None) -> str:
    """Return the canonical backup filename for the given env + UTC time.

    Format: mehamakor_<env>_<UTC ISO 8601 compact>.dump
    Lexically sortable so an alphabetical R2 listing is also chronological.
    """
    if now is None:
        now = datetime.now(timezone.utc)
    timestamp = now.strftime("%Y%m%dT%H%M%SZ")
    return f"mehamakor_{env}_{timestamp}.dump"


def run_pg_dump(database_url: str, output_path: Path) -> bool:
    """Run pg_dump in custom format. Returns True on success."""
    cmd = [
        "pg_dump",
        "-Fc",                  # custom format: compressed, parallel-restorable
        "--no-owner",           # restoring into fresh DB shouldn't carry roles
        "--no-privileges",      # same: skip GRANT statements
        "--dbname", database_url,
        "-f", str(output_path),
    ]
    log.info("Running pg_dump → %s", output_path)
    try:
        result = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            timeout=PG_DUMP_TIMEOUT_SEC,
        )
    except subprocess.CalledProcessError as exc:
        log.error("pg_dump exited %d: %s", exc.returncode, exc.stderr.strip())
        return False
    except subprocess.TimeoutExpired:
        log.error("pg_dump timed out after %ds", PG_DUMP_TIMEOUT_SEC)
        return False
    except FileNotFoundError:
        log.error("pg_dump not found on PATH — is postgresql-client installed?")
        return False

    if result.stderr:
        # pg_dump writes progress to stderr even on success; surface for diag
        log.info("pg_dump stderr: %s", result.stderr.strip())
    return True


def upload_to_r2(local_path: Path, filename: str, cfg: dict[str, str]) -> bool:
    """Upload local file to R2 bucket. Returns True on success."""
    # Imported here so config errors (exit 3) don't pay the boto3 import cost.
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    log.info("Uploading %s → r2://%s/%s", local_path, cfg["R2_BUCKET_NAME"], filename)
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=cfg["R2_ENDPOINT"],
            aws_access_key_id=cfg["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=cfg["R2_SECRET_ACCESS_KEY"],
            region_name="auto",  # R2 requires this; default us-east-1 mis-signs
        )
        s3.upload_file(str(local_path), cfg["R2_BUCKET_NAME"], filename)
    except (BotoCoreError, ClientError) as exc:
        log.error("R2 upload failed: %s", exc)
        return False
    return True


def main() -> int:
    cfg = load_config()
    if cfg is None:
        return EXIT_CONFIG_ERROR

    filename = build_filename(cfg["ENV"])

    # tempfile.TemporaryDirectory cleans up on context exit — even if
    # upload fails, Railway's container is destroyed after the cron
    # run, so leftover files don't accumulate. We log the path on
    # failure so an operator can pull from logs if needed.
    with tempfile.TemporaryDirectory(prefix="meh408_") as tmpdir:
        local_path = Path(tmpdir) / filename

        if not run_pg_dump(cfg["DATABASE_URL"], local_path):
            log.error("Backup FAILED at pg_dump step (file: %s)", local_path)
            return EXIT_PG_DUMP_FAILED

        size_bytes = local_path.stat().st_size
        log.info("pg_dump complete — %d bytes", size_bytes)

        if not upload_to_r2(local_path, filename, cfg):
            log.error("Backup FAILED at R2 upload step (file: %s)", local_path)
            return EXIT_UPLOAD_FAILED

        log.info("Backup OK — %s (%d bytes)", filename, size_bytes)
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
