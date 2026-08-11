"""MEH-352 regression test — fresh empty DB → lifespan must populate tables → /producers 200.

Reproduces the bug where _run_db_init_sync() imported models but never called
Base.metadata.create_all(). On any environment with a clean DB (fresh local
clone, ephemeral CI without a seeded volume), seed_data.seed() queried tables
that did not exist, the background init task caught the exception and set
db_init_status="failed", and every DB-backed route returned 500 until an
operator manually ran `alembic upgrade head`.

The test drops every app-owned table, starts the lifespan via the TestClient
context manager (a bare `TestClient(app)` does not fire startup events; the
`with` block does), polls /health until db_init transitions out of
"initializing", then asserts /producers returns 200.
"""
import time

import pytest
from fastapi.testclient import TestClient

from app.database import Base, engine
from app.main import app


def _wait_for_db_ready(client: TestClient, timeout_sec: float = 15.0) -> str:
    """Poll /health until the background init task settles (ready or failed)."""
    deadline = time.monotonic() + timeout_sec
    last_status = "unknown"
    while time.monotonic() < deadline:
        last_status = client.get("/health").json().get("db_init", "unknown")
        if last_status in ("ready", "failed"):
            return last_status
        time.sleep(0.1)
    return last_status


@pytest.fixture
def empty_database():
    """Drop every app-owned table to simulate a first-boot empty database.

    No teardown drop: the lifespan inside the test recreates the tables, and
    the autouse `_clean_tables` fixture in conftest handles isolation for
    subsequent tests by truncating.
    """
    Base.metadata.drop_all(bind=engine)
    yield


def test_empty_db_lifespan_creates_tables_and_serves_producers(empty_database):
    """MEH-352: empty DB + lifespan startup → /producers 200, db_init=ready."""
    with TestClient(app) as client:
        status = _wait_for_db_ready(client)
        assert status == "ready", f"db_init never reached 'ready' (last={status!r})"

        resp = client.get("/producers", params={"lat": 32.0, "lng": 35.0})
        assert resp.status_code == 200, (
            f"/producers returned {resp.status_code}: {resp.text[:300]}"
        )
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0, "seed_data.seed() should have inserted producers"
