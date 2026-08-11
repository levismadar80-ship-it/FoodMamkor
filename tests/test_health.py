"""MEH-483: /health/{liveness,readiness} + X-Request-ID round-trip."""
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


def test_liveness_returns_200_alive(client: TestClient):
    r = client.get("/health/liveness")
    assert r.status_code == 200
    assert r.json() == {"status": "alive"}


def test_liveness_head_returns_200(client: TestClient):
    r = client.head("/health/liveness")
    assert r.status_code == 200


def test_readiness_returns_200_when_db_ok(client: TestClient):
    """Conftest's session-scope schema bootstrap means the test DB is reachable."""
    # Force db_init_status = ready for this assertion (lifespan only runs
    # under TestClient context-manager, which conftest does not use).
    app.state.db_init_status = "ready"
    r = client.get("/health/readiness")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ready"
    # alembic_version table doesn't exist under create_all bootstrap →
    # migrations field falls back to "unknown". This is by design.
    assert "migrations" in body
    assert body["db_init"] == "ready"


def test_readiness_returns_503_when_db_init_failed(client: TestClient):
    app.state.db_init_status = "failed"
    try:
        r = client.get("/health/readiness")
        assert r.status_code == 503
        body = r.json()
        assert body["status"] == "not_ready"
        assert body["reason"] == "db_init_failed"
    finally:
        app.state.db_init_status = "ready"


def test_readiness_returns_503_when_db_init_pending(client: TestClient):
    app.state.db_init_status = "initializing"
    try:
        r = client.get("/health/readiness")
        assert r.status_code == 503
        body = r.json()
        assert body["status"] == "not_ready"
        assert body["reason"] == "db_init_pending"
    finally:
        app.state.db_init_status = "ready"


def test_readiness_returns_503_when_select_1_raises(client: TestClient):
    app.state.db_init_status = "ready"
    # Patch the engine.connect used inside the health router to raise.
    with patch("app.routers.health.engine") as mock_engine:
        mock_engine.connect.side_effect = RuntimeError("connection refused")
        r = client.get("/health/readiness")
    assert r.status_code == 503
    body = r.json()
    assert body["status"] == "not_ready"
    assert body["reason"].startswith("db_unreachable:")


def test_health_alias_preserves_pre_meh483_shape(client: TestClient):
    """Backwards-compat: tests/test_lifespan_init.py:29 polls this field."""
    app.state.db_init_status = "ready"
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "db_init" in body


def test_x_request_id_round_trip(client: TestClient):
    # asgi-correlation-id default validator is `is_valid_uuid4` — non-UUID
    # values get rewritten with a fresh UUID and a WARNING log line. We
    # keep the validator as-is (secure default; prevents header injection
    # of arbitrary strings into log/Sentry tags). Clients that want to
    # propagate their own request ID must send a UUID4.
    rid = "5f9b9c3e-7c0e-4c9a-8a1f-0123456789ab"
    r = client.get("/health/liveness", headers={"X-Request-ID": rid})
    assert r.status_code == 200
    assert r.headers.get("X-Request-ID") == rid


def test_x_request_id_non_uuid_gets_rewritten(client: TestClient):
    """Validator-rejection path — documents the secure default."""
    r = client.get("/health/liveness", headers={"X-Request-ID": "not-a-uuid"})
    assert r.status_code == 200
    rid = r.headers.get("X-Request-ID")
    assert rid is not None
    assert rid != "not-a-uuid"


def test_x_request_id_auto_generated_when_absent(client: TestClient):
    r = client.get("/health/liveness")
    assert r.status_code == 200
    rid = r.headers.get("X-Request-ID")
    assert rid is not None
    # asgi-correlation-id default is uuid4 hex; non-empty string is enough
    # to assert the middleware is wiring something.
    assert len(rid) >= 8
