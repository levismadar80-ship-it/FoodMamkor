"""Apply Alembic migrations on boot, except when the database is AHEAD of this image.

MEH-2903 (backend rollback, option ב — Sapir 10/11). Replaces the bare
`alembic upgrade head` in the Dockerfile CMD (chunk 2, wired 11/11).

Why: the image boots with `alembic upgrade head`. An OLDER image (a rollback)
has no file for a revision a newer release already applied, so `upgrade head`
stops with "Can't locate revision", uvicorn never starts, the Railway
healthcheck fails and the newer deployment stays live: the rollback silently
does not happen (docs/release/ROLLBACK.md §2b).

What this does, in order:

  1. If this image has no revision files at all → NO MIGRATIONS, exit 2. A
     wrong script_location or a broken build would otherwise make every
     database head look "unknown", i.e. like a rollback.
  2. Read the database's current Alembic head(s).
  3. If any of them is a revision this image does not know → the database is
     ahead of the code. That is a rollback only if THIS image's own head is
     recorded in `alembic_lineage` (the database once ran it):
       - recorded → ROLLBACK MODE: log loudly at ERROR, do NOT run
         `upgrade head`, exit 0 so uvicorn starts. Expand-only revisions
         (ADR-007) are what make the older code safe on the newer schema;
         this script relies on that rule, it does not change it.
       - not recorded, or no `alembic_lineage` table → SPLIT HISTORY, exit 3.
         This image carries a revision the database never ran.
  4. Otherwise run `alembic upgrade head` exactly as before. ANY error —
     connection, a failing migration, a graph problem — propagates, the process
     exits 1 and the boot fails, as it does today. After a successful upgrade,
     every revision of this image's chain is recorded in `alembic_lineage`.

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
from sqlalchemy import create_engine, text  # noqa: E402

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


LINEAGE_TABLE = "alembic_lineage"


def head_was_applied(url: str, head: str) -> bool | None:
    """Whether `head` is recorded in alembic_lineage, i.e. this database ran
    an image whose chain contained it. None when the table does not exist
    (a database no lineage-recording image has booted on yet)."""
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            exists = conn.execute(
                text("SELECT to_regclass(:t) IS NOT NULL"), {"t": LINEAGE_TABLE}
            ).scalar()
            if not exists:
                return None
            return bool(
                conn.execute(
                    text(f"SELECT 1 FROM {LINEAGE_TABLE} WHERE revision = :r"),
                    {"r": head},
                ).first()
            )
    finally:
        engine.dispose()


def record_lineage(url: str, script: ScriptDirectory) -> int:
    """Record every revision of this image's chain as applied. Called only
    after a successful `upgrade head`, so the whole chain IS applied. Returns
    the number of revisions in the chain."""
    chain = [rev.revision for rev in script.walk_revisions()]
    engine = create_engine(url)
    try:
        with engine.begin() as conn:
            for revision in chain:
                conn.execute(
                    text(
                        f"INSERT INTO {LINEAGE_TABLE} (revision) VALUES (:r) "
                        "ON CONFLICT (revision) DO NOTHING"
                    ),
                    {"r": revision},
                )
    finally:
        engine.dispose()
    return len(chain)


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
    image_head = script.get_current_head()
    if ahead:
        # MEH-2903 risk 2: "the database is ahead" is a rollback only if this
        # image's own head was applied to it. Otherwise this image carries a
        # revision that never ran (a split history), and starting it would
        # serve code whose migration is missing. alembic_version holds only
        # the current head, so the applied chain is read from alembic_lineage.
        applied = head_was_applied(settings.database_url, image_head)
        if not applied:
            log.error(
                "SPLIT HISTORY: the database is at %s, a revision this image "
                "does not know, and this image's own head %s %s. This is not a "
                "rollback to an earlier release. Refusing to start; deploy the "
                "image that matches the database (docs/release/ROLLBACK.md).",
                ", ".join(ahead),
                image_head,
                "has never been recorded as applied to it"
                if applied is False
                else "cannot be confirmed as applied (no alembic_lineage table)",
            )
            return 3
        log.error(
            "%s: the database is at %s, a revision this image does not know "
            "(this image's head is %s). Skipping `alembic upgrade head` and "
            "starting anyway: expand-only revisions (ADR-007) keep this code "
            "safe on the newer schema. If this is not a deliberate rollback, "
            "deploy the newer image (docs/release/ROLLBACK.md).",
            ROLLBACK_MARKER,
            ", ".join(ahead),
            image_head,
        )
        return 0

    log.info(
        "database at %s; running `alembic upgrade head` (image head %s)",
        ", ".join(db_heads) or "<empty>",
        image_head,
    )
    command.upgrade(cfg, "head")
    # alembic/env.py runs logging.config.fileConfig(alembic.ini), which disables
    # every logger that already exists (this one included) and sets the root to
    # WARN. Without this the line below never reaches the boot log, and it is the
    # only evidence that this image's head was recorded (ROLLBACK.md §2d).
    log.disabled = False
    log.setLevel(logging.INFO)
    n = record_lineage(settings.database_url, script)
    log.info("recorded %d applied revisions in %s", n, LINEAGE_TABLE)
    return 0


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    sys.exit(main())
