"""Apply Alembic migrations on boot, except when the database is AHEAD of this image.

MEH-2903 (backend rollback, option ב — Sapir 10/11). Replaces the bare
`alembic upgrade head` in the Dockerfile CMD (chunk 2; not wired yet).

Why: the image boots with `alembic upgrade head`. An OLDER image (a rollback)
has no file for a revision a newer release already applied, so `upgrade head`
stops with "Can't locate revision", uvicorn never starts, the Railway
healthcheck fails and the newer deployment stays live: the rollback silently
does not happen (docs/release/ROLLBACK.md §2b).

What this does, in order:

  1. Read the database's current Alembic head(s).
  2. If any of them is a revision this image does not know → the database is
     ahead of the code (a rollback). Log it loudly at ERROR and DO NOT run
     `upgrade head`. Exit 0 so uvicorn starts. Expand-only revisions (ADR-007)
     are what make the older code safe on the newer schema; this script does
     not change that rule, it relies on it.
  3. Otherwise run `alembic upgrade head` exactly as before. ANY error —
     connection, a failing migration, a graph problem — propagates, the process
     exits non-zero and the boot fails, as it does today.

Usage (from backend/, the container's /app):

    python scripts/migrate_on_boot.py
    python scripts/migrate_on_boot.py --alembic-ini path/to/alembic.ini   # tests

The database URL comes from `settings.database_url`, the same place
alembic/env.py reads it. No new env var.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
# `python scripts/migrate_on_boot.py` puts scripts/ on sys.path, not backend/.
sys.path.insert(0, str(BACKEND))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.runtime.migration import MigrationContext  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402

log = logging.getLogger("migrate_on_boot")

ROLLBACK_MARKER = "ROLLBACK MODE"


def _config(ini_path: Path) -> Config:
    """An Alembic Config whose script_location is resolved against the ini's
    own folder, so the result does not depend on the working directory."""
    cfg = Config(str(ini_path))
    location = cfg.get_main_option("script_location") or "alembic"
    if not os.path.isabs(location):
        cfg.set_main_option("script_location", str(ini_path.parent / location))
    return cfg


def database_heads(url: str) -> tuple[str, ...]:
    """The revision(s) in the database's alembic_version table. Empty for a
    database that has never been migrated."""
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return tuple(MigrationContext.configure(conn).get_current_heads())
    finally:
        engine.dispose()


def unknown_heads(db_heads: tuple[str, ...], script: ScriptDirectory) -> list[str]:
    """Database heads this image has no revision file for."""
    known = {rev.revision for rev in script.walk_revisions()}
    return [head for head in db_heads if head not in known]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--alembic-ini", type=Path, default=BACKEND / "alembic.ini")
    args = parser.parse_args(argv)

    from app.config import settings  # after sys.path; same source as env.py

    cfg = _config(args.alembic_ini.resolve())
    script = ScriptDirectory.from_config(cfg)

    # MEH-2903 risk 1: with no revision files every database head looks
    # "unknown", which would read as a rollback and start the app on a schema
    # nobody checked. A wrong script_location or a broken image build looks
    # exactly like this. Fail the boot instead.
    if script.get_current_head() is None:
        log.error(
            "NO MIGRATIONS: this image has no Alembic revision files under %s. "
            "Refusing to start: without them it cannot tell a rollback from a "
            "broken image.",
            cfg.get_main_option("script_location"),
        )
        return 2

    db_heads = database_heads(settings.database_url)
    ahead = unknown_heads(db_heads, script)
    if ahead:
        log.error(
            "%s: the database is at %s, a revision this image does not know "
            "(this image's head is %s). Skipping `alembic upgrade head` and "
            "starting anyway: expand-only revisions (ADR-007) keep this code "
            "safe on the newer schema. If this is not a deliberate rollback, "
            "deploy the newer image (docs/release/ROLLBACK.md).",
            ROLLBACK_MARKER,
            ", ".join(ahead),
            script.get_current_head(),
        )
        return 0

    log.info(
        "database at %s; running `alembic upgrade head` (image head %s)",
        ", ".join(db_heads) or "<empty>",
        script.get_current_head(),
    )
    command.upgrade(cfg, "head")
    return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    sys.exit(main())
