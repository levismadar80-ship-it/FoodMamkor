"""
Module:   reset_staging
Purpose:  Put the STAGING database back to exactly what the seed scripts
          create: empty every table that is not reference data, then run the
          same seed chain a PR's E2E backend runs. staging stops accumulating
          months of E2E users and hand-made test rows (MEH-3630: 17,968 users
          and 61 businesses measured on 21/11/2026).
Touches:  Every table in the `public` schema except KEEP_TABLES (one TRUNCATE
          in one transaction), then whatever the seed scripts write
          (producers, users, products, events, Cloudinary demo/ uploads …).
Does NOT: run anywhere but a local database or Railway staging — see
          `reset_refusal()`. Does NOT change schema: Alembic owns it (MEH-267),
          and `alembic_version` is kept, so the revision stays where it was.
          Does NOT delete Cloudinary images (`cleanup_cloudinary_orphans.py`).
          Does NOT write anything without --confirm.
Related:  scripts/e2e/start-local-backend.sh:52-58 (SEED_CHAIN is that list) ·
          backend/scripts/seed_demo_business.py:163 (the guard this tightens) ·
          docs/DEPLOYMENT.md «Resetting staging data».
History:  MEH-3631 (creation, part of MEH-3630).

Run on staging (Railway → backend service → Console, cwd=/app):
    /app/.venv/bin/python scripts/reset_staging.py            # dry run
    /app/.venv/bin/python scripts/reset_staging.py --confirm  # wipe + seed
"""

import argparse
import os
import subprocess
import sys
from urllib.parse import parse_qs, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from sqlalchemy import text  # noqa: E402  # imports follow sys.path.insert (script shim)

from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402

# Reference data: what the product needs to run and no test ever writes.
# DO NOT add a table that holds users' or businesses' rows here — MEH-3630.
KEEP_TABLES = frozenset(
    {
        "alembic_version",  # the schema revision; Alembic owns it
        "alembic_lineage",  # migration history (admin_ops.py)
        "categories",  # seed_data.py inserts them, admins rename them
        "cities",  # seed_cities.py from data.gov.il
        "admin_checklist_items",  # inserted by revision d4a9c31e6f82
        "admin_settings",  # site switches set by hand in /admin
        "static_pages",  # page text edited by hand in /admin
    }
)

# Same order as scripts/e2e/start-local-backend.sh:53-58, so staging and every
# PR's E2E backend are built from one recipe.
SEED_CHAIN = (
    ("seed_data.py",),
    ("scripts/seed_demo_producers.py", "--confirm"),
    ("scripts/seed_demo_business.py",),
    ("scripts/seed_demo_business.py", "--sync-users"),
    ("scripts/seed_demo_business.py", "--golden"),
    ("scripts/seed_organizer_demo.py",),
)

LOCAL_HOSTS = ("localhost", "127.0.0.1")


def reset_refusal(db_url: str, env: str, railway_env: str) -> str | None:
    """Why this run must not touch the database, or None when it may.

    Production is refused on either signal before anything else, so a
    staging-looking host cannot talk its way past ENV=production.
    """
    if (
        env.strip().lower() == "production"
        or railway_env.strip().lower() == "production"
    ):
        return "ENV or RAILWAY_ENVIRONMENT is production"
    parts = urlsplit(db_url.replace("postgresql+psycopg2", "postgresql"))
    # libpq's host= / hostaddr= query parameter overrides the URL host.
    if {"host", "hostaddr"} & parse_qs(parts.query).keys():
        return "DATABASE_URL carries a host= override"
    if (parts.hostname or "").lower() in LOCAL_HOSTS:
        return None
    if railway_env.strip().lower() == "staging":
        return None
    return f"DB host '{parts.hostname}' is not local and RAILWAY_ENVIRONMENT is not staging"


def tables_to_wipe(conn) -> list[str]:
    """Every base table in `public` that is not reference data, sorted."""
    rows = conn.execute(
        text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
        )
    )
    return sorted(r[0] for r in rows if r[0] not in KEEP_TABLES)


def row_counts(conn, tables: list[str]) -> dict[str, int]:
    return {
        t: conn.execute(text(f'SELECT count(*) FROM "{t}"')).scalar_one()
        for t in tables
    }


def wipe(tables: list[str]) -> None:
    """Empty `tables` in one statement, one transaction.

    No CASCADE on purpose: if a kept table ever points at a wiped one,
    Postgres refuses the whole statement instead of silently emptying the
    kept table too.
    """
    if not tables:
        return
    names = ", ".join(f'"{t}"' for t in tables)
    with engine.begin() as conn:
        conn.execute(text(f"TRUNCATE {names} RESTART IDENTITY"))


def run_seed_chain() -> None:
    for step in SEED_CHAIN:
        print(f"seed: {' '.join(step)}", flush=True)
        subprocess.run([sys.executable, *step], cwd=ROOT, check=True)


def _print_counts(title: str, counts: dict[str, int]) -> None:
    print(title)
    for name, n in counts.items():
        if n:
            print(f"  {name:40} {n:>8}")
    print(f"  {'total rows':40} {sum(counts.values()):>8}  ({len(counts)} tables)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--confirm", action="store_true", help="wipe and re-seed (default: dry run)"
    )
    args = parser.parse_args(argv)

    refusal = reset_refusal(
        str(engine.url.render_as_string(hide_password=False)),
        settings.env,
        os.getenv("RAILWAY_ENVIRONMENT", ""),
    )
    if refusal:
        print(f"REFUSING to reset: {refusal}.", file=sys.stderr)
        return 2

    with engine.connect() as conn:
        tables = tables_to_wipe(conn)
        before = row_counts(conn, tables)
    _print_counts("rows that will be deleted:", before)
    print(f"kept as they are: {', '.join(sorted(KEEP_TABLES))}")

    if not args.confirm:
        print("dry run — nothing changed. Re-run with --confirm to wipe and re-seed.")
        return 0

    wipe(tables)
    print("wiped. seeding…", flush=True)
    run_seed_chain()
    with engine.connect() as conn:
        _print_counts("rows after the seed:", row_counts(conn, tables))
    return 0


if __name__ == "__main__":
    sys.exit(main())
