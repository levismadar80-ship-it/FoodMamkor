"""MEH-2893 (anchor releases, MEH-2892 §A.3) — every revision since the previous
release can be undone and redone.

Revisions are expand-only (ADR-007), so the previous backend's CODE would run on
the newer schema — but its IMAGE would not boot: the Dockerfile CMD runs
`alembic upgrade head` first, and the older image has no file for the newer
revision ("Can't locate revision"). So rolling back a release that added a
revision means downgrading the schema first (docs/release/ROLLBACK.md §2).
Until now no test anywhere ran a downgrade (`git grep "alembic downgrade"` over tests/,
.github/workflows/ and scripts/ found only `upgrade head`). An untested
emergency path is not a path.

On a scratch database, with the real alembic CLI (the same `env.py`):

    upgrade PREVIOUS_RELEASE_HEAD   → snapshot A
    upgrade head                    → snapshot H
    downgrade PREVIOUS_RELEASE_HEAD → must equal A   (the downgrade undoes it)
    upgrade head                    → must equal H   (and it can be redone)

A snapshot is the public schema as Postgres reports it: every column (type with
length / precision / scale / udt, nullability, default), every index, every
constraint, every enum type and label, every sequence / view / materialized
view, every non-internal trigger and every function. A revision with no
downgrade() or with a downgrade that leaves something behind turns this red.

What it does NOT prove: that the downgrade succeeds on production DATA (the
scratch db is empty — a re-added NOT NULL / UNIQUE / CHECK can still fail on
rows written since the release), or that a data-only revision restores the data
it changed. ROLLBACK.md §2 requires a dry run against a restored dump for that.

PREVIOUS_RELEASE_HEAD is the alembic head of the release currently on
production — read from /api/health on 10/11/2026 (`version.alembic_head`,
v1.4.0). Move it to the new release's head when that release is recorded in
docs/release/anchors/, so the test always covers exactly the revisions a
rollback of the NEXT release would cross.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

PREVIOUS_RELEASE_HEAD = "f2b8d4c61a07"  # v1.4.0, production (/api/health, 10/11)

BACKEND = Path(__file__).resolve().parents[1] / "backend"

# `serial` here is not about wall-clock timing (the marker's registered reason):
# it creates and drops a whole database and runs alembic in a subprocess, which
# must not race the xdist workers' own per-worker databases on the same server.
pytestmark = pytest.mark.serial


def _base_url() -> str:
    # The database conftest pointed the app at (per-worker or not); only its
    # server and credentials are reused — the scratch db is our own.
    return os.environ["DATABASE_URL"]


def _alembic(url: str, *args: str) -> str:
    env = {**os.environ, "DATABASE_URL": url, "ENV": "test"}
    for key in ("DATABASE_URL_STAGING", "DATABASE_URL_PRODUCTION"):
        env.pop(key, None)
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", str(BACKEND / "alembic.ini"), *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )
    assert proc.returncode == 0, (
        f"alembic {' '.join(args)} failed (exit {proc.returncode}):\n"
        f"{proc.stdout[-3000:]}\n{proc.stderr[-3000:]}"
    )
    return proc.stdout


def _snapshot(url: str) -> dict[str, list[tuple]]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            columns = conn.execute(
                text(
                    """
                    SELECT table_name, column_name, data_type, udt_name,
                           coalesce(character_maximum_length, -1),
                           coalesce(numeric_precision, -1),
                           coalesce(numeric_scale, -1),
                           is_nullable, coalesce(column_default, '')
                    FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name <> 'alembic_version'
                    ORDER BY table_name, column_name
                    """
                )
            ).all()
            indexes = conn.execute(
                text(
                    """
                    SELECT tablename, indexname, indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public' AND tablename <> 'alembic_version'
                    ORDER BY tablename, indexname
                    """
                )
            ).all()
            constraints = conn.execute(
                text(
                    """
                    SELECT rel.relname, con.conname, pg_get_constraintdef(con.oid)
                    FROM pg_constraint con
                    JOIN pg_class rel ON rel.oid = con.conrelid
                    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
                    WHERE nsp.nspname = 'public' AND rel.relname <> 'alembic_version'
                    ORDER BY rel.relname, con.conname
                    """
                )
            ).all()
            enums = conn.execute(
                text(
                    """
                    SELECT t.typname, e.enumlabel, e.enumsortorder
                    FROM pg_type t
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    WHERE n.nspname = 'public'
                    ORDER BY t.typname, e.enumsortorder
                    """
                )
            ).all()
            # S = sequence, v = view, m = materialized view.
            relations = conn.execute(
                text(
                    """
                    SELECT c.relkind::text, c.relname
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public' AND c.relkind IN ('S', 'v', 'm')
                    ORDER BY c.relkind, c.relname
                    """
                )
            ).all()
            triggers = conn.execute(
                text(
                    """
                    SELECT rel.relname, tg.tgname, pg_get_triggerdef(tg.oid)
                    FROM pg_trigger tg
                    JOIN pg_class rel ON rel.oid = tg.tgrelid
                    JOIN pg_namespace n ON n.oid = rel.relnamespace
                    WHERE n.nspname = 'public' AND NOT tg.tgisinternal
                    ORDER BY rel.relname, tg.tgname
                    """
                )
            ).all()
            functions = conn.execute(
                text(
                    """
                    SELECT p.proname, pg_get_function_identity_arguments(p.oid)
                    FROM pg_proc p
                    JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public'
                    ORDER BY p.proname, 2
                    """
                )
            ).all()
            version = conn.execute(
                text("SELECT version_num FROM alembic_version")
            ).scalar()
    finally:
        engine.dispose()
    return {
        "columns": [tuple(r) for r in columns],
        "indexes": [tuple(r) for r in indexes],
        "constraints": [tuple(r) for r in constraints],
        "enums": [tuple(r) for r in enums],
        "relations": [tuple(r) for r in relations],
        "triggers": [tuple(r) for r in triggers],
        "functions": [tuple(r) for r in functions],
        "version": [(version,)],
    }


def _diff(a: dict, b: dict) -> str:
    lines = []
    for key in a:
        only_a = sorted(set(a[key]) - set(b[key]))
        only_b = sorted(set(b[key]) - set(a[key]))
        if only_a or only_b:
            lines.append(f"[{key}] only before: {only_a[:10]}")
            lines.append(f"[{key}] only after:  {only_b[:10]}")
    return "\n".join(lines)


@pytest.fixture
def scratch_db():
    base = make_url(_base_url())
    name = f"{base.database}_roundtrip_{uuid.uuid4().hex[:8]}"
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        yield base.set(database=name).render_as_string(hide_password=False)
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_previous_release_head_is_an_ancestor_of_head(scratch_db):
    """A stale constant (a head that is not in the chain) would make the round
    trip below vacuous or crash for the wrong reason — say so plainly."""
    history = _alembic(scratch_db, "history", "-r", f"{PREVIOUS_RELEASE_HEAD}:head")
    assert PREVIOUS_RELEASE_HEAD in history, history


def test_every_revision_since_the_previous_release_downgrades_and_redoes(scratch_db):
    _alembic(scratch_db, "upgrade", PREVIOUS_RELEASE_HEAD)
    at_release = _snapshot(scratch_db)
    assert at_release["version"] == [(PREVIOUS_RELEASE_HEAD,)]

    _alembic(scratch_db, "upgrade", "head")
    at_head = _snapshot(scratch_db)
    # Discriminating: if head == the previous release there is nothing to
    # round-trip, and the equalities below would pass without testing anything.
    assert at_head != at_release, (
        "head equals the previous release head — bump PREVIOUS_RELEASE_HEAD "
        "only when a release is recorded, never to head"
    )

    _alembic(scratch_db, "downgrade", PREVIOUS_RELEASE_HEAD)
    back = _snapshot(scratch_db)
    assert back == at_release, "downgrade left the schema different:\n" + _diff(
        at_release, back
    )

    _alembic(scratch_db, "upgrade", "head")
    again = _snapshot(scratch_db)
    assert again == at_head, "re-upgrade differs from the first upgrade:\n" + _diff(
        at_head, again
    )
