"""MEH-2219 chunk 1 — `Base.metadata.create_all` must not run on the boot path of
a deployed environment.

Ruling (card, 01/09 — Sapir via the orchestrator, ADR-003): do not delete the
MEH-352 safety net, GATE it by environment. `create_all(checkfirst=True)` is
not a no-op on staging/production: a model table with no revision would be
created at boot — the second schema writer MEH-267 removed (`_migrate_columns`)
in a quieter form. Alembic is the sole schema authority there
(`alembic upgrade head` in the container entrypoint).

Discrimination (MEH-1619): `test_production_boot_never_calls_create_all` and
its staging twin FAIL against the pre-gate `_run_db_init_sync` (create_all was
called unconditionally) and pass after. The development/test cases are the
CONTROL — they pass in both worlds and guard that the safety net is still
there where it belongs (tests/test_lifespan_init.py relies on it).

Everything is monkeypatched: no lifespan, no real DDL, `seed()` stubbed — the
subject is the branch, not the database.
"""

from unittest.mock import MagicMock

import pytest

import seed_data
from app import startup
from app.database import Base


@pytest.fixture
def boot(monkeypatch):
    """Run `_run_db_init_sync` under a given ENV with create_all + seed stubbed."""
    create_all = MagicMock(name="create_all")
    monkeypatch.setattr(Base.metadata, "create_all", create_all)
    monkeypatch.setattr(seed_data, "seed", lambda: None)

    def _run(env: str):
        monkeypatch.setattr(startup.settings, "env", env)
        startup._run_db_init_sync()
        return create_all

    return _run


# ── the defect ──────────────────────────────────────────────────────────────
@pytest.mark.parametrize("env", ["production", "staging"])
def test_deployed_boot_never_calls_create_all(boot, env):
    """FAILS before the gate: create_all ran in every environment."""
    create_all = boot(env)
    create_all.assert_not_called()


# ── controls — pass before AND after; not evidence for the change ──────────
@pytest.mark.parametrize("env", ["development", "test", ""])
def test_control_safety_net_still_runs_outside_deployed_envs(boot, env):
    """CONTROL: MEH-352's dev/CI net is gated, not deleted (MEH-352 / ADR-003)."""
    create_all = boot(env)
    create_all.assert_called_once()


def test_helper_is_case_insensitive_and_fails_open_on_unknown():
    """The pure helper behind the branch: deployed names in any case → owned;
    an unrecognized value (a typo like `stage`) stays on the safety-net side —
    _check_frontend_url_consistency already warns about the typo itself."""
    from app.startup import _schema_is_alembic_owned

    assert _schema_is_alembic_owned("production") is True
    assert _schema_is_alembic_owned("Staging") is True
    assert _schema_is_alembic_owned("development") is False
    assert _schema_is_alembic_owned("stage") is False
    assert _schema_is_alembic_owned(None) is False
