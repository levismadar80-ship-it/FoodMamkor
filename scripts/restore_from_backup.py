#!/usr/bin/env python3
"""MEH-408 Phase 2 — restore from R2 backup (DR-drill helper).

Downloads a `.dump` file from Cloudflare R2 and runs `pg_restore` against
the target database. Designed for the periodic DR drill (Phase 4) and
for local restore experiments — NOT for emergency production restore
(that's a manual procedure under supervision).

Usage:
  python scripts/restore_from_backup.py <filename> <target_database_url>
  python scripts/restore_from_backup.py --latest <target_database_url>

Examples:
  # Specific file
  python scripts/restore_from_backup.py mehamakor_production_20260507T230000Z.dump \\
      postgresql://localhost/mehamakor_dr_test

  # Latest in the bucket
  python scripts/restore_from_backup.py --latest \\
      postgresql://localhost/mehamakor_dr_test

Required env (same as backup_production_db.py):
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME, R2_ENDPOINT

Exit codes:
  0 — download + pg_restore succeeded
  1 — pg_restore failed
  2 — R2 download failed (or `--latest` found no objects)
  3 — config error / safety guard refused / target unreachable

Safety guard:
  Refuses if target_database_url contains 'production' (case-insensitive)
  OR matches $DATABASE_URL_PRODUCTION when that env var is defined.
  Production restore is a manual operation, not a script invocation.

Skeptic flags:
  - pg_restore must be on $PATH; provided by postgresql-client.
  - --clean --if-exists drops existing objects before restoring; safe on
    empty DBs (the intended use case) and idempotent on re-runs.
  - Row-count verification is best-effort: if psql is missing or the
    target schema lacks expected tables, we log a warning but still
    return 0 (the restore itself succeeded).
"""
from __future__ import annotations

import argparse
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

EXIT_OK = 0
EXIT_RESTORE_FAILED = 1
EXIT_DOWNLOAD_FAILED = 2
EXIT_CONFIG_ERROR = 3

PG_RESTORE_TIMEOUT_SEC = 1800  # 30 min — restore can be slower than dump

REQUIRED_ENV_VARS = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_ENDPOINT",
)

# Tables we expect every restore to populate. Used only for the
# best-effort row-count summary at the end of a successful restore.
ROW_COUNT_TABLES = ("producers", "users", "categories", "cities")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%SZ",
    stream=sys.stdout,
)
log = logging.getLogger("meh408.restore")


def load_config() -> dict[str, str] | None:
    missing = [v for v in REQUIRED_ENV_VARS if not os.environ.get(v)]
    if missing:
        log.error("Missing required env vars: %s", ", ".join(missing))
        return None
    return {v: os.environ[v] for v in REQUIRED_ENV_VARS}


def is_production_target(target_url: str) -> bool:
    """Best-effort check: would this URL hit the production DB?"""
    if "production" in target_url.lower():
        return True
    prod_url = os.environ.get("DATABASE_URL_PRODUCTION")
    if prod_url and target_url.strip() == prod_url.strip():
        return True
    return False


def find_latest_backup(cfg: dict[str, str]) -> str | None:
    """Return the filename of the most recently uploaded R2 object."""
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=cfg["R2_ENDPOINT"],
            aws_access_key_id=cfg["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=cfg["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        resp = s3.list_objects_v2(Bucket=cfg["R2_BUCKET_NAME"])
    except (BotoCoreError, ClientError) as exc:
        log.error("R2 list failed: %s", exc)
        return None

    contents = resp.get("Contents") or []
    if not contents:
        log.error("Bucket %s is empty — no backups to restore", cfg["R2_BUCKET_NAME"])
        return None

    # LastModified is a tz-aware datetime; sort desc.
    latest = max(contents, key=lambda obj: obj["LastModified"])
    return latest["Key"]


def download_from_r2(filename: str, local_path: Path, cfg: dict[str, str]) -> bool:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    log.info("Downloading r2://%s/%s → %s", cfg["R2_BUCKET_NAME"], filename, local_path)
    try:
        s3 = boto3.client(
            "s3",
            endpoint_url=cfg["R2_ENDPOINT"],
            aws_access_key_id=cfg["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=cfg["R2_SECRET_ACCESS_KEY"],
            region_name="auto",
        )
        s3.download_file(cfg["R2_BUCKET_NAME"], filename, str(local_path))
    except (BotoCoreError, ClientError) as exc:
        log.error("R2 download failed: %s", exc)
        return False
    return True


def verify_dump_integrity(local_path: Path) -> bool:
    """`pg_restore --list` parses the file's TOC. Detects corruption early."""
    try:
        subprocess.run(
            ["pg_restore", "--list", str(local_path)],
            check=True,
            capture_output=True,
            timeout=60,
        )
    except subprocess.CalledProcessError as exc:
        log.error("Dump file failed pg_restore --list: %s", exc.stderr)
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        log.error("pg_restore --list error: %s", exc)
        return False
    return True


def run_pg_restore(local_path: Path, target_url: str) -> bool:
    cmd = [
        "pg_restore",
        "--no-owner",
        "--no-privileges",
        "--clean",          # drop existing objects first
        "--if-exists",      # don't error if they don't exist (fresh DB)
        "--dbname", target_url,
        str(local_path),
    ]
    log.info("Running pg_restore → %s", target_url)
    try:
        subprocess.run(cmd, check=True, timeout=PG_RESTORE_TIMEOUT_SEC)
    except subprocess.CalledProcessError as exc:
        log.error("pg_restore exited %d", exc.returncode)
        return False
    except subprocess.TimeoutExpired:
        log.error("pg_restore timed out after %ds", PG_RESTORE_TIMEOUT_SEC)
        return False
    except FileNotFoundError:
        log.error("pg_restore not found on PATH")
        return False
    return True


def print_row_counts(target_url: str) -> None:
    """Best-effort row-count summary. Logs warning if psql/tables missing."""
    for table in ROW_COUNT_TABLES:
        try:
            result = subprocess.run(
                ["psql", target_url, "-tAc", f"SELECT count(*) FROM {table};"],
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            log.info("  %s: %s rows", table, result.stdout.strip())
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
            log.warning("  %s: row count unavailable (%s)", table, exc)


def parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Restore from R2 backup (DR drill).")
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--latest", action="store_true", help="Use most recent backup")
    group.add_argument("filename", nargs="?", help="Specific backup filename")
    p.add_argument("target_database_url", help="Restore destination")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv if argv is not None else sys.argv[1:])

    if is_production_target(args.target_database_url):
        log.error("Refusing to restore to a production-like URL — manual operation only")
        return EXIT_CONFIG_ERROR

    cfg = load_config()
    if cfg is None:
        return EXIT_CONFIG_ERROR

    filename = args.filename
    if args.latest:
        filename = find_latest_backup(cfg)
        if filename is None:
            return EXIT_DOWNLOAD_FAILED
        log.info("Latest backup: %s", filename)

    with tempfile.TemporaryDirectory(prefix="meh408_restore_") as tmpdir:
        local_path = Path(tmpdir) / filename

        if not download_from_r2(filename, local_path, cfg):
            return EXIT_DOWNLOAD_FAILED

        if not verify_dump_integrity(local_path):
            return EXIT_RESTORE_FAILED

        if not run_pg_restore(local_path, args.target_database_url):
            return EXIT_RESTORE_FAILED

        log.info("Restore OK — verifying row counts:")
        print_row_counts(args.target_database_url)
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
