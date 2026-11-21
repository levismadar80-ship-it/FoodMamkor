"""MEH-3631: backend/scripts/reset_staging.py — staging data reset.

Runs the REAL script module (loaded by path, never a copy) against the test
database: the guard, the dry run, and one full wipe + seed-chain run.
"""

import importlib.util
import os
from pathlib import Path

import pytest
from sqlalchemy import text

from app.database import engine
from app.models import Producer
from app.models.models import StaticPage, User

SCRIPT = (
    Path(__file__).resolve().parents[1] / "backend" / "scripts" / "reset_staging.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("reset_staging", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


reset_staging = _load()

STAGING_URL = "postgresql://u:p@postgres.railway.internal:5432/railway"
LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/mehamakor_test"


# ------------------------------------------------------------------ guard


@pytest.mark.parametrize(
    "url, env, railway_env",
    [
        (LOCAL_URL, "production", ""),  # ENV=production beats a local host
        (STAGING_URL, "development", "production"),
        (STAGING_URL, "Production", "staging"),  # case-insensitive, prod wins
        (STAGING_URL, "development", ""),  # remote host, no staging signal
        (STAGING_URL, "development", "pr-123"),
        ("postgresql://u:p@localhost/x?host=prod.example", "development", ""),
        ("postgresql://u:p@localhost/x?hostaddr=10.0.0.1", "development", "staging"),
    ],
)
def test_guard_refuses(url, env, railway_env):
    assert reset_staging.reset_refusal(url, env, railway_env) is not None


@pytest.mark.parametrize(
    "url, railway_env",
    [
        (LOCAL_URL, ""),
        ("postgresql+psycopg2://postgres@127.0.0.1/x", ""),
        (STAGING_URL, "staging"),
        (STAGING_URL, " Staging "),
    ],
)
def test_guard_allows(url, railway_env):
    assert reset_staging.reset_refusal(url, "development", railway_env) is None


def test_main_refuses_production_and_writes_nothing(db, monkeypatch):
    from app.config import settings

    db.add(User(email="keep-me@example.com", name="x", role="consumer"))
    db.commit()
    monkeypatch.setattr(settings, "env", "production")

    assert reset_staging.main(["--confirm"]) == 2
    assert db.query(User).count() == 1


# ------------------------------------------------------------- keep list


def test_keep_tables_exist_in_models():
    """A renamed reference table would silently move to the wipe list."""
    from app.database import Base

    model_tables = set(Base.metadata.tables)
    alembic_only = {"alembic_version"}
    assert reset_staging.KEEP_TABLES - alembic_only <= model_tables


def test_no_kept_table_points_at_a_wiped_one():
    """TRUNCATE without CASCADE fails on such a key; catch it here, not on staging."""
    from app.database import Base

    for name in reset_staging.KEEP_TABLES & set(Base.metadata.tables):
        for fk in Base.metadata.tables[name].foreign_keys:
            assert fk.column.table.name in reset_staging.KEEP_TABLES, (
                name,
                fk.target_fullname,
            )


def test_seed_chain_matches_the_e2e_backend():
    """One recipe for staging and the PR E2E backend (start-local-backend.sh)."""
    sh = (
        Path(__file__).resolve().parents[1]
        / "scripts"
        / "e2e"
        / "start-local-backend.sh"
    ).read_text()
    # Reads a shell script as text: nothing runs it in pytest (testing.md MEH-3531).
    sh_steps = [
        tuple(line.split('"$PY" ', 1)[1].split())
        for line in sh.splitlines()
        if line.startswith('"$PY" ') and "alembic" not in line
    ]
    assert sh_steps == list(reset_staging.SEED_CHAIN)


# ------------------------------------------------------------ dry run / run


def _seed_old_state(db):
    db.add(StaticPage(slug="about", title="אודות", body="טקסט שנערך בידי האדמין"))
    db.add(User(email="ok+mwq1@example.com", name="e2e leftover", role="consumer"))
    db.add(
        Producer(
            name="בדיקת מטמון", slug="old-cache-test", city="חיפה", status="approved"
        )
    )
    db.commit()


def test_dry_run_changes_nothing(db, capsys):
    _seed_old_state(db)

    assert reset_staging.main([]) == 0

    assert db.query(User).count() == 1
    assert db.query(Producer).count() == 1
    out = capsys.readouterr().out
    assert "dry run" in out
    assert "users" in out and "producers" in out


def test_confirm_wipes_then_reseeds(db, monkeypatch):
    for var in ("DEMO_OWNER_PASSWORD", "DEMO_CONSUMER_PASSWORD", "DEMO_ADMIN_PASSWORD"):
        monkeypatch.setenv(var, os.environ.get(var) or "Reset-Test-Pass-9!")
    monkeypatch.setenv("ENV", "development")
    _seed_old_state(db)

    assert reset_staging.main(["--confirm"]) == 0
    db.expire_all()

    # wiped
    assert db.query(User).filter(User.email == "ok+mwq1@example.com").count() == 0
    assert db.query(Producer).filter(Producer.slug == "old-cache-test").count() == 0
    # kept, untouched
    page = db.query(StaticPage).filter(StaticPage.slug == "about").one()
    assert page.body == "טקסט שנערך בידי האדמין"
    # re-seeded by the chain
    assert db.query(Producer).filter(Producer.slug == "ruach-hasadeh").count() == 1
    emails = {e for (e,) in db.query(User.email)}
    assert {
        "demo-owner@example.com",
        "demo-consumer@example.com",
        "demo-admin@example.com",
    } <= emails
    with engine.connect() as conn:
        golden = conn.execute(
            text("SELECT count(*) FROM producers WHERE slug LIKE 'golden-%'")
        ).scalar_one()
    assert golden >= 5
