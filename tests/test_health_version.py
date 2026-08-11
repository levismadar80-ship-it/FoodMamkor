"""MEH-1596 — GET /health publishes the boot facts the process already holds.

Before this, `/health` returned `{"status":"ok","db_init":"..."}` and nothing
else: no way to tell which commit was live, which alembic revision the DB was
on, or whether `db_init` reflected this boot or one from two months ago. Every
such question cost a manual Railway lookup, even though Railway already injects
`RAILWAY_GIT_COMMIT_SHA` / `RAILWAY_GIT_BRANCH` into every container.

Three properties are load-bearing and each has a test here:

1. The block has EXACTLY four fields. Not five — no uptime, no hostname, no
   env name. `/health` is unauthenticated, so every field is public and the
   set is deliberately closed.
2. A completely unset environment still returns 200 with "unknown" everywhere.
   A health endpoint that 500s is worse than one that admits it does not know,
   and this endpoint is what Railway's healthcheck polls (`railway.json:8`).
3. The pre-existing `status` / `db_init` keys are unchanged in name AND type.
   The change is additive; `tests/test_lifespan_init.py:29` polls `db_init`.

`booted_at` and `alembic_head` come from `app.state` (written once in
`app/startup.py` lifespan). Because conftest's `client` fixture is a bare
`TestClient(app)` — which does NOT fire startup events — these tests set and
clear `app.state` explicitly rather than relying on a lifespan that never runs.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app

VERSION_FIELDS = {"git_sha", "git_branch", "alembic_head", "booted_at"}
ENV_VARS = ("GIT_SHA", "RAILWAY_GIT_COMMIT_SHA", "GIT_BRANCH", "RAILWAY_GIT_BRANCH")

SHA = "9f3c1a77e4b2d05c8a61fe3390bb27d4c5e0a118"
REVISION = "b9d3f1a7c2e4"
BOOTED = "2026-07-26T21:11:53.004076+00:00"


@pytest.fixture
def clean_state():
    """Save/restore the app.state keys these tests write.

    `app` is module-level, so a leaked attribute would bleed into every later
    test in the session (the same reason the existing health tests restore
    `db_init_status`).
    """
    sentinel = object()
    saved = {k: getattr(app.state, k, sentinel) for k in ("alembic_head", "booted_at")}
    yield
    for key, value in saved.items():
        if value is sentinel:
            if hasattr(app.state, key):
                delattr(app.state, key)
        else:
            setattr(app.state, key, value)


def test_version_block_has_exactly_four_fields(
    client: TestClient, monkeypatch, clean_state
):
    """The four fields exist, carry the cached/env values, and are the ONLY four."""
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", SHA)
    monkeypatch.setenv("RAILWAY_GIT_BRANCH", "staging")
    monkeypatch.delenv("GIT_SHA", raising=False)
    monkeypatch.delenv("GIT_BRANCH", raising=False)
    app.state.alembic_head = REVISION
    app.state.booted_at = BOOTED

    r = client.get("/health")

    assert r.status_code == 200, r.text
    version = r.json()["version"]
    assert set(version) == VERSION_FIELDS, f"unexpected field set: {sorted(version)}"
    assert len(version) == 4, (
        f"version must carry exactly 4 fields, got {len(version)}: {sorted(version)}"
    )
    assert version["git_sha"] == SHA
    assert version["git_branch"] == "staging"
    assert version["alembic_head"] == REVISION
    assert version["booted_at"] == BOOTED


def test_explicit_git_env_wins_over_railway(
    client: TestClient, monkeypatch, clean_state
):
    """GIT_SHA / GIT_BRANCH take precedence over the Railway-injected pair."""
    monkeypatch.setenv("GIT_SHA", "explicit-sha")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", SHA)
    monkeypatch.setenv("GIT_BRANCH", "explicit-branch")
    monkeypatch.setenv("RAILWAY_GIT_BRANCH", "staging")

    version = client.get("/health").json()["version"]

    assert version["git_sha"] == "explicit-sha"
    assert version["git_branch"] == "explicit-branch"


def test_totally_unset_environment_still_returns_200_with_unknown(
    client: TestClient, monkeypatch, clean_state
):
    """No env vars, no cached state → 200 and "unknown" everywhere, never a 500.

    This is the case Railway's healthcheck hits during the window before the
    background init task settles. A raise here would fail the deploy.
    """
    for name in ENV_VARS:
        monkeypatch.delenv(name, raising=False)
    for key in ("alembic_head", "booted_at"):
        if hasattr(app.state, key):
            delattr(app.state, key)

    r = client.get("/health")

    assert r.status_code == 200, r.text
    version = r.json()["version"]
    assert set(version) == VERSION_FIELDS
    assert all(v == "unknown" for v in version.values()), version


def test_empty_string_env_var_is_treated_as_unset(
    client: TestClient, monkeypatch, clean_state
):
    """Railway injects an empty string for an unset build arg — not a valid SHA."""
    monkeypatch.setenv("GIT_SHA", "")
    monkeypatch.setenv("RAILWAY_GIT_COMMIT_SHA", "")
    monkeypatch.setenv("GIT_BRANCH", "")
    monkeypatch.setenv("RAILWAY_GIT_BRANCH", "")

    version = client.get("/health").json()["version"]

    assert version["git_sha"] == "unknown"
    assert version["git_branch"] == "unknown"


def test_preexisting_keys_unchanged_in_name_and_type(client: TestClient, clean_state):
    """Additive only: `status` and `db_init` keep their names, values and types.

    Guards the Railway healthcheck (`railway.json:8` points at `/health`) and
    `tests/test_lifespan_init.py:29`, which polls `body["db_init"]` as a string.
    """
    app.state.db_init_status = "ready"
    try:
        body = client.get("/health").json()

        assert body["status"] == "ok"
        assert isinstance(body["status"], str)
        assert body["db_init"] == "ready"
        assert isinstance(body["db_init"], str)
        # The only addition is `version`; nothing else appeared or vanished.
        assert set(body) == {"status", "db_init", "version"}
        assert isinstance(body["version"], dict)
    finally:
        app.state.db_init_status = "ready"


def test_readiness_is_untouched(client: TestClient, clean_state):
    """MEH-1596 changed /health only. /health/readiness keeps its exact shape
    and status codes — no `version` block, same keys as before."""
    app.state.db_init_status = "ready"
    r = client.get("/health/readiness")

    assert r.status_code == 200, r.text
    body = r.json()
    assert set(body) == {"status", "migrations", "db_init"}
    assert "version" not in body
