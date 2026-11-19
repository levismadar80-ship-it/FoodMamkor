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
  4 — anonymization failed, or real emails / push endpoints survived it

Personal details (MEH-3406):
  After pg_restore, scripts/anonymize_restored_db.sql replaces every
  email, phone, name and address with a fake value and deletes codes,
  push endpoints and raw WhatsApp traffic, in ONE transaction. Then a
  check counts what survived (emails off @example.com, push endpoints)
  and exits 4 if anything did. `--keep-pii` skips both — explicit only,
  never the default, and logged as a warning.

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
import re
import subprocess
import sys
import tempfile
from pathlib import Path

EXIT_OK = 0
EXIT_RESTORE_FAILED = 1
EXIT_DOWNLOAD_FAILED = 2
EXIT_CONFIG_ERROR = 3
EXIT_ANONYMIZE_FAILED = 4

# MEH-3406: the SQL lives next to this script; tests/test_restore_anonymize.py
# guards that it covers every PII-shaped column in the models.
ANONYMIZE_SQL = Path(__file__).resolve().parent / "anonymize_restored_db.sql"
ANONYMIZE_TIMEOUT_SEC = 600

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


_UPDATE_RE = re.compile(r"^UPDATE (\w+) SET\s*$")
_DELETE_RE = re.compile(r"^DELETE FROM (\w+);\s*$")
_ASSIGN_RE = re.compile(r"^    (\w+) = (.+?)[,;]?\s*$")


def effective_sql(sql: str, existing: set[tuple[str, str]]) -> tuple[str, list[str]]:
    """MEH-3406: the anonymization SQL minus what the restored schema lacks.

    A dump older than a migration has no column that migration added, and a
    plain UPDATE naming it would fail the whole transaction. The PII in a
    column that does not exist is not in the dump either, so the assignment
    is dropped and reported. Relies on the file's format contract (one
    statement per table, one assignment per line), which
    tests/test_restore_anonymize.py checks against the real file.
    Returns (sql, skipped) — skipped as "table.column" / "table".
    """
    tables = {t for t, _ in existing}
    out: list[str] = []
    skipped: list[str] = []
    lines = sql.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if m := _DELETE_RE.match(line):
            if m.group(1) in tables:
                out.append(line)
            else:
                skipped.append(m.group(1))
            i += 1
            continue
        if not (m := _UPDATE_RE.match(line)):
            out.append(line)
            i += 1
            continue
        table = m.group(1)
        i += 1
        kept: list[str] = []
        where: str | None = None
        while i < len(lines):
            body = lines[i]
            if a := _ASSIGN_RE.match(body):
                col = a.group(1)
                if (table, col) in existing:
                    kept.append(f"    {col} = {a.group(2)}")
                else:
                    skipped.append(f"{table}.{col}")
                i += 1
                if body.rstrip().endswith(";"):
                    break
                continue
            if body.startswith("WHERE"):
                where = body.rstrip().rstrip(";")
                i += 1
            break
        if table not in tables:
            skipped.append(table)
            continue
        if not kept:
            continue
        out.append(f"UPDATE {table} SET")
        out.append(",\n".join(kept) + ("" if where else ";"))
        if where:
            out.append(where + ";")
    return "\n".join(out) + "\n", skipped


def existing_columns(target_url: str) -> set[tuple[str, str]] | None:
    """Every (table, column) in the target's public schema; None if unreadable."""
    sql = (
        "SELECT table_name || '.' || column_name FROM information_schema.columns "
        "WHERE table_schema = 'public'"
    )
    try:
        result = subprocess.run(
            ["psql", target_url, "-X", "-tAc", sql],
            check=True, capture_output=True, text=True, timeout=60,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.error("could not read the restored schema: %s", exc)
        return None
    pairs = set()
    for row in result.stdout.split():
        table, _, col = row.partition(".")
        pairs.add((table, col))
    return pairs


def run_anonymize(target_url: str) -> bool:
    """MEH-3406: run the anonymization SQL in a single transaction."""
    existing = existing_columns(target_url)
    if not existing:
        log.error("anonymization did not run: the restored schema is empty or unreadable")
        return False
    try:
        sql, skipped = effective_sql(ANONYMIZE_SQL.read_text(encoding="utf-8"), existing)
    except (OSError, UnicodeDecodeError) as exc:
        log.error("anonymization did not run: cannot read %s: %s", ANONYMIZE_SQL.name, exc)
        return False
    for name in skipped:
        log.warning("  not in this dump's schema, skipped: %s", name)
    if skipped:
        log.warning("Skipped %d item(s) the dump predates; check them by hand.", len(skipped))
    cmd = ["psql", target_url, "-X", "--single-transaction", "-v", "ON_ERROR_STOP=1", "-q", "-f", "-"]
    # The SQL carries Hebrew literals. Send UTF-8 bytes and say so to psql,
    # never the locale codec: Git Bash on Windows is cp1255 / cp1252.
    env = {**os.environ, "PGCLIENTENCODING": "UTF8"}
    log.info("Anonymizing personal details (%s)", ANONYMIZE_SQL.name)
    try:
        subprocess.run(cmd, check=True, timeout=ANONYMIZE_TIMEOUT_SEC, input=sql.encode("utf-8"), env=env)
    except subprocess.CalledProcessError as exc:
        log.error("anonymization exited %d — nothing was changed (one transaction)", exc.returncode)
        return False
    except (subprocess.TimeoutExpired, FileNotFoundError) as exc:
        log.error("anonymization did not run: %s", exc)
        return False
    log.info("Anonymized — checking nothing real survived:")
    return True


# Each query must return 0 after a successful anonymization.
SURVIVOR_QUERIES = (
    ("users off @example.com", "SELECT count(*) FROM users WHERE email NOT ILIKE '%@example.com'"),
    ("contact_messages off @example.com", "SELECT count(*) FROM contact_messages WHERE email NOT ILIKE '%@example.com'"),
    ("newsletter off @example.com", "SELECT count(*) FROM newsletter_subscribers WHERE email NOT ILIKE '%@example.com'"),
    ("users with a real phone", "SELECT count(*) FROM users WHERE phone IS NOT NULL AND phone NOT LIKE '+97250000%'"),
    ("registrations off @example.com", "SELECT count(*) FROM registrations WHERE email NOT ILIKE '%@example.com'"),
    ("producers' contact email", "SELECT count(*) FROM producers WHERE contact_email IS NOT NULL AND contact_email NOT ILIKE '%@example.com'"),
    ("push endpoints", "SELECT count(*) FROM favorite_alerts WHERE push_subscription IS NOT NULL"),
    ("inbound WhatsApp", "SELECT count(*) FROM inbound_messages"),
)


def verify_anonymized(target_url: str) -> bool:
    """MEH-3406: fail closed — a count we cannot read is a failure."""
    ok = True
    for label, sql in SURVIVOR_QUERIES:
        try:
            result = subprocess.run(
                ["psql", target_url, "-X", "-tAc", sql],
                check=True, capture_output=True, text=True, timeout=60,
            )
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
            log.error("  %s: check could not run (%s)", label, exc)
            ok = False
            continue
        count = result.stdout.strip()
        if count != "0":
            log.error("  %s: %s rows survived", label, count)
            ok = False
        else:
            log.info("  %s: 0", label)
    return ok


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
    # MEH-3406: never the default. A restore keeps real people's details
    # only when someone types this.
    p.add_argument(
        "--keep-pii", action="store_true",
        help="Skip anonymization and keep real personal details (explicit only)",
    )
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

        restored = run_pg_restore(local_path, args.target_database_url)

        if args.keep_pii:
            log.warning("--keep-pii: real personal details were restored and kept")
        # MEH-3406: a failed pg_restore usually leaves most tables loaded (it
        # runs without --exit-on-error), so it is anonymized too.
        elif not (
            run_anonymize(args.target_database_url)
            and verify_anonymized(args.target_database_url)
        ):
            log.error(
                "The target now holds REAL personal details. Drop that "
                "database before anyone uses it."
            )
            return EXIT_RESTORE_FAILED if not restored else EXIT_ANONYMIZE_FAILED

        if not restored:
            return EXIT_RESTORE_FAILED

        log.info("Restore OK — verifying row counts:")
        print_row_counts(args.target_database_url)
        return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
