"""MEH-3307 — the app runs as a role that cannot change the schema.

1. The boot migration step connects with MIGRATION_DATABASE_URL when it is set,
   not with the app's DATABASE_URL. Shown by pointing DATABASE_URL at a
   database that does not exist: the old code fails the boot, the new code
   migrates the scratch database named by MIGRATION_DATABASE_URL.
2. The role that scripts/app_runtime_role.py creates, on a database migrated
   to head by the real chain: it reads and writes rows, can switch to
   `mcp_reader` as the chat tools do, and every kind of DDL is refused. A
   table a later migration creates is writable for it with no new grant.

`serial`: creates a database and a cluster-wide role, and runs Alembic in a
subprocess.
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
from sqlalchemy.exc import ProgrammingError

BACKEND = Path(__file__).resolve().parents[1] / "backend"
SCRIPT = BACKEND / "scripts" / "migrate_on_boot.py"
sys.path.insert(0, str(BACKEND / "scripts"))

from app_runtime_role import role_sql, with_secret  # noqa: E402

pytestmark = pytest.mark.serial


@pytest.fixture
def scratch_db():
    base = make_url(os.environ["DATABASE_URL"])
    name = f"{base.database}_role_{uuid.uuid4().hex[:8]}"
    admin = create_engine(base.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{name}"'))
    try:
        yield base.set(database=name)
    finally:
        with admin.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
        admin.dispose()


def _boot(app_url: str, migration_url: str | None) -> subprocess.CompletedProcess:
    env = {
        **os.environ,
        "DATABASE_URL": app_url,
        "ENV": "test",
        "PYTHONPATH": str(BACKEND),
    }
    for key in (
        "DATABASE_URL_STAGING",
        "DATABASE_URL_PRODUCTION",
        "MIGRATION_DATABASE_URL",
    ):
        env.pop(key, None)
    if migration_url is not None:
        env["MIGRATION_DATABASE_URL"] = migration_url
    return subprocess.run(
        [sys.executable, str(SCRIPT)],
        cwd=BACKEND,
        env=env,
        capture_output=True,
        text=True,
        timeout=600,
    )


def _render(url) -> str:
    return url.render_as_string(hide_password=False)


def _head_version(url: str) -> list[str]:
    engine = create_engine(url)
    try:
        with engine.connect() as conn:
            return [
                r[0]
                for r in conn.execute(text("SELECT version_num FROM alembic_version"))
            ]
    finally:
        engine.dispose()


def test_boot_migrates_with_the_migration_url_not_the_app_url(scratch_db):
    missing = _render(scratch_db.set(database=f"{scratch_db.database}_missing"))
    owner = _render(scratch_db)

    proc = _boot(app_url=missing, migration_url=owner)

    assert proc.returncode == 0, proc.stderr[-3000:]
    assert len(_head_version(owner)) == 1, "the scratch database must be at head"


def test_without_the_migration_url_the_app_url_is_used_as_before(scratch_db):
    owner = _render(scratch_db)

    proc = _boot(app_url=owner, migration_url=None)

    assert proc.returncode == 0, proc.stderr[-3000:]
    assert len(_head_version(owner)) == 1


@pytest.fixture
def runtime_role(scratch_db):
    """The scratch database at head, the role created by the runbook SQL, and
    an engine that logs in as that role."""
    owner = _render(scratch_db)
    proc = _boot(app_url=owner, migration_url=None)
    assert proc.returncode == 0, proc.stderr[-3000:]

    role = f"app_runtime_t{uuid.uuid4().hex[:8]}"
    password = uuid.uuid4().hex
    owner_engine = create_engine(owner, isolation_level="AUTOCOMMIT")
    with owner_engine.connect() as conn:
        for statement in role_sql(role=role):
            conn.execute(text(with_secret(statement, password)))
    as_role = create_engine(
        scratch_db.set(username=role, password=password), isolation_level="AUTOCOMMIT"
    )
    try:
        yield owner_engine, as_role
    finally:
        as_role.dispose()
        with owner_engine.connect() as conn:
            conn.execute(text(f"DROP OWNED BY {role}"))
        owner_engine.dispose()
        admin = create_engine(
            scratch_db.set(database="postgres"), isolation_level="AUTOCOMMIT"
        )
        with admin.connect() as conn:
            conn.execute(
                text(f'DROP DATABASE IF EXISTS "{scratch_db.database}" WITH (FORCE)')
            )
            conn.execute(text(f"DROP ROLE IF EXISTS {role}"))
        admin.dispose()


def test_the_runtime_role_reads_and_writes_rows(runtime_role):
    _, as_role = runtime_role
    with as_role.connect() as conn:
        conn.execute(text("SELECT count(*) FROM producers")).scalar_one()
        conn.execute(
            text(
                "INSERT INTO newsletter_subscribers (id, email) VALUES (gen_random_uuid(), :e)"
            ),
            {"e": f"{uuid.uuid4().hex[:8]}@example.com"},
        )
        conn.execute(text("UPDATE newsletter_subscribers SET email = email"))
        conn.execute(text("DELETE FROM newsletter_subscribers"))


def test_the_runtime_role_can_switch_to_the_chat_reader(runtime_role):
    _, as_role = runtime_role
    # A real transaction, as chat_db_tools.reader_transaction opens: SET LOCAL
    # is a no-op under AUTOCOMMIT.
    with as_role.connect() as raw:
        conn = raw.execution_options(isolation_level="READ COMMITTED")
        conn.begin()
        conn.execute(text("SET TRANSACTION READ ONLY"))
        conn.execute(text("SET LOCAL ROLE mcp_reader"))
        assert conn.execute(text("SELECT current_user")).scalar_one() == "mcp_reader"


@pytest.mark.parametrize(
    "ddl",
    [
        "CREATE TABLE meh3307_probe (id int)",
        "ALTER TABLE producers ADD COLUMN meh3307_probe int",
        "DROP TABLE newsletter_subscribers",
        "TRUNCATE newsletter_subscribers",
        "CREATE INDEX meh3307_probe ON producers (id)",
        "CREATE VIEW meh3307_probe AS SELECT 1",
        "CREATE FUNCTION meh3307_probe() RETURNS int LANGUAGE sql AS 'SELECT 1'",
        "COMMENT ON TABLE producers IS 'meh3307'",
    ],
)
def test_the_runtime_role_cannot_change_the_schema(runtime_role, ddl):
    _, as_role = runtime_role
    with as_role.connect() as conn:
        with pytest.raises(ProgrammingError) as caught:
            conn.execute(text(ddl))
    assert "permission denied" in str(caught.value) or "must be owner" in str(
        caught.value
    )


def test_a_table_a_later_migration_creates_is_writable(runtime_role):
    owner_engine, as_role = runtime_role
    with owner_engine.connect() as conn:
        conn.execute(text("CREATE TABLE meh3307_later (id serial PRIMARY KEY, v int)"))
    with as_role.connect() as conn:
        conn.execute(text("INSERT INTO meh3307_later (v) VALUES (1)"))
        assert (
            conn.execute(text("SELECT count(*) FROM meh3307_later")).scalar_one() == 1
        )
