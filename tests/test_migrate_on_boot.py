"""MEH-2903 chunk 1 — the boot migration step, case by case.

1. The database is AHEAD of the image and this image's head is recorded in
   alembic_lineage (a backend rollback): ROLLBACK MODE at ERROR, no
   `upgrade head`, exit 0 so uvicorn can start.
2. A real migration error: exit 1, exactly as `alembic upgrade head` fails the
   boot today. The normal upgrade before it records the image's chain.
3. An image with no revision files: NO MIGRATIONS, exit 2.
4. A split history (the database is ahead, but this image's own head was never
   applied): SPLIT HISTORY, exit 3.
5. The database is ahead and has no alembic_lineage table: exit 3 too, because
   nothing can confirm this image's head was applied.

All run the real script as a subprocess, against a scratch database, with the
real alembic/env.py. A "newer image" is built the honest way: a copy of this
repo's alembic/ folder with ONE extra revision on top of head. That keeps the
tests true whatever the head revision is on the day they run.

`serial`: creates and drops a whole database and runs Alembic in a subprocess,
which must not race the xdist workers' per-worker databases on the same server.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

BACKEND = Path(__file__).resolve().parents[1] / "backend"
SCRIPT = BACKEND / "scripts" / "migrate_on_boot.py"
EXTRA_REV = "meh2903extra"

pytestmark = pytest.mark.serial


def _run(url: str, *args: str) -> subprocess.CompletedProcess:
    env = {**os.environ, "DATABASE_URL": url, "ENV": "test", "PYTHONPATH": str(BACKEND)}
    for key in ("DATABASE_URL_STAGING", "DATABASE_URL_PRODUCTION"):
        env.pop(key, None)
    return subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )


def _show(capsys, title: str, proc: subprocess.CompletedProcess) -> None:
    """Put the script's own output in the CI log, so the evidence is readable
    there and not only as a pass/fail line."""
    with capsys.disabled():
        print(f"\n----- {title}: exit {proc.returncode} -----")
        for line in (proc.stdout + proc.stderr).splitlines():
            if "migrate_on_boot" in line or "Error" in line or "error" in line:
                print("  " + line[-400:])


def _version(url: str) -> list[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return [
                r[0]
                for r in conn.execute(text("SELECT version_num FROM alembic_version"))
            ]
    finally:
        engine.dispose()


def _lineage(url: str) -> set[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return {
                r[0] for r in conn.execute(text("SELECT revision FROM alembic_lineage"))
            }
    finally:
        engine.dispose()


def _image_head() -> str:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return ScriptDirectory.from_config(cfg).get_current_head()


def _newer_image(
    tmp_path: Path, upgrade_body: str, rev: str = EXTRA_REV, folder: str = "newer_image"
) -> Path:
    """A copy of alembic/ + alembic.ini with one extra revision on top of head.
    Returns the copied ini path."""
    root = tmp_path / folder
    shutil.copytree(
        BACKEND / "alembic",
        root / "alembic",
        ignore=shutil.ignore_patterns("__pycache__"),
    )
    shutil.copy(BACKEND / "alembic.ini", root / "alembic.ini")
    (
        root / "alembic" / "versions" / f"29990101_0000_{rev}_meh2903_extra.py"
    ).write_text(
        f'''"""meh2903 test-only revision"""
from alembic import op

revision = "{rev}"
down_revision = "{_image_head()}"
branch_labels = None
depends_on = None


def upgrade() -> None:
    {upgrade_body}


def downgrade() -> None:
    pass
''',
        encoding="utf-8",
    )
    return root / "alembic.ini"


@pytest.fixture
def scratch_db():
    base = make_url(os.environ["DATABASE_URL"])
    name = f"{base.database}_boot_{uuid.uuid4().hex[:8]}"
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        yield base.set(database=name).render_as_string(hide_password=False)
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def test_database_ahead_of_the_image_boots_and_logs_rollback_mode(
    scratch_db, tmp_path, capsys
):
    # A newer image migrated the database one revision past this image's head.
    newer = _newer_image(tmp_path, 'op.execute("SELECT 1")')
    first = _run(scratch_db, "--alembic-ini", str(newer))
    assert first.returncode == 0, first.stderr[-3000:]
    assert _version(scratch_db) == [EXTRA_REV]

    # Now THIS image boots on that database (the rollback).
    proc = _run(scratch_db)
    _show(capsys, "case 1 · database ahead of the image", proc)

    assert proc.returncode == 0, (
        "the older image must still boot on a newer database:\n" + proc.stderr[-3000:]
    )
    assert "ERROR" in proc.stderr and "ROLLBACK MODE" in proc.stderr, proc.stderr[
        -3000:
    ]
    assert EXTRA_REV in proc.stderr, "the log must name the unknown revision"


def test_a_real_migration_error_fails_the_boot(scratch_db, tmp_path, capsys):
    # Normal path first: an empty database is migrated to this image's head.
    ok = _run(scratch_db)
    assert ok.returncode == 0, ok.stderr[-3000:]
    assert _version(scratch_db) == [_image_head()]
    assert "ROLLBACK MODE" not in ok.stderr
    # The normal path records the whole chain, and says so in the boot log:
    # that line is the only boot-log evidence ROLLBACK.md §2d relies on.
    assert _image_head() in _lineage(scratch_db)
    assert "recorded" in ok.stderr and "alembic_lineage" in ok.stderr, ok.stderr[-3000:]

    # A newer image whose new revision fails: a real error from Postgres.
    broken = _newer_image(tmp_path, 'op.execute("SELECT * FROM meh2903_no_such_table")')
    proc = _run(scratch_db, "--alembic-ini", str(broken))
    _show(capsys, "case 2 · a real migration error", proc)

    assert proc.returncode == 1, (
        "a failing migration must fail the boot:\n" + proc.stderr[-3000:]
    )
    assert "meh2903_no_such_table" in proc.stderr, proc.stderr[-3000:]
    assert "ROLLBACK MODE" not in proc.stderr, (
        "a real error must never be read as a rollback"
    )
    # The failed revision was not recorded; the database is still at the image head.
    assert _version(scratch_db) == [_image_head()]


def _empty_image(tmp_path: Path) -> Path:
    """A copy of alembic/ + alembic.ini whose versions/ folder holds no revision
    files: what a wrong script_location or a broken image build looks like."""
    root = tmp_path / "empty_image"
    shutil.copytree(
        BACKEND / "alembic",
        root / "alembic",
        ignore=shutil.ignore_patterns("__pycache__", "*.py"),
    )
    # env.py and script.py.mako are needed to load the environment at all.
    shutil.copy(BACKEND / "alembic" / "env.py", root / "alembic" / "env.py")
    (root / "alembic" / "versions").mkdir(exist_ok=True)
    shutil.copy(BACKEND / "alembic.ini", root / "alembic.ini")
    return root / "alembic.ini"


def test_an_image_with_no_migration_files_fails_the_boot(scratch_db, tmp_path, capsys):
    # MEH-2903 risk 1. With no revision files every database head looks
    # "unknown", which must NOT be read as a rollback: that would start the app
    # on a schema nobody checked. The boot fails, naming the cause.
    ok = _run(scratch_db)
    assert ok.returncode == 0, ok.stderr[-3000:]
    assert _version(scratch_db) == [_image_head()]

    empty = _empty_image(tmp_path)
    assert not list((empty.parent / "alembic" / "versions").glob("*.py"))
    proc = _run(scratch_db, "--alembic-ini", str(empty))
    _show(capsys, "case 3 · an image with no migration files", proc)

    assert proc.returncode == 2, (
        "an image with no migration files must fail the boot:\n" + proc.stderr[-3000:]
    )
    assert "ROLLBACK MODE" not in proc.stderr, proc.stderr[-3000:]
    assert "NO MIGRATIONS" in proc.stderr, proc.stderr[-3000:]


OTHER_REV = "meh2903other"


def test_a_split_history_fails_the_boot_and_names_both_revisions(
    scratch_db, tmp_path, capsys
):
    # MEH-2903 risk 2. Image A applied revision EXTRA on top of head. Image B is
    # NOT older than A: it carries its own revision OTHER on the same parent,
    # never applied. To B the database looks "ahead", exactly like a rollback,
    # but taking rollback mode would start B with its own migration unapplied.
    # Rollback mode is only for an image whose head the database has applied.
    newer = _newer_image(tmp_path, 'op.execute("SELECT 1")')
    first = _run(scratch_db, "--alembic-ini", str(newer))
    assert first.returncode == 0, first.stderr[-3000:]
    assert _version(scratch_db) == [EXTRA_REV]

    split = _newer_image(
        tmp_path, 'op.execute("SELECT 1")', rev=OTHER_REV, folder="split_image"
    )
    proc = _run(scratch_db, "--alembic-ini", str(split))
    _show(capsys, "case 4 · a split history (not a rollback)", proc)

    assert proc.returncode == 3, (
        "an image whose own head was never applied must not boot:\n"
        + proc.stderr[-3000:]
    )
    assert "ROLLBACK MODE" not in proc.stderr, proc.stderr[-3000:]
    assert "SPLIT HISTORY" in proc.stderr, proc.stderr[-3000:]
    assert "never been recorded" in proc.stderr, proc.stderr[-3000:]
    # Both revision ids are in the log, so the cause is visible at a glance.
    assert EXTRA_REV in proc.stderr and OTHER_REV in proc.stderr, proc.stderr[-3000:]


def test_database_ahead_without_a_lineage_table_fails_the_boot(
    scratch_db, tmp_path, capsys
):
    # The database is ahead of this image, but it has no alembic_lineage table
    # (a database no lineage-recording image has booted on, or one whose table
    # was lost). Nothing can confirm this image's head was applied, so this is
    # not taken as a rollback either.
    newer = _newer_image(tmp_path, 'op.execute("SELECT 1")')
    first = _run(scratch_db, "--alembic-ini", str(newer))
    assert first.returncode == 0, first.stderr[-3000:]
    engine = create_engine(scratch_db)
    try:
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE alembic_lineage"))
    finally:
        engine.dispose()

    proc = _run(scratch_db)
    _show(capsys, "case 5 · database ahead, no lineage table", proc)

    assert proc.returncode == 3, proc.stderr[-3000:]
    assert "SPLIT HISTORY" in proc.stderr, proc.stderr[-3000:]
    assert "cannot be confirmed" in proc.stderr, proc.stderr[-3000:]
    assert "ROLLBACK MODE" not in proc.stderr, proc.stderr[-3000:]
