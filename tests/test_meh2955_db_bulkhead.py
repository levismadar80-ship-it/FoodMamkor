"""MEH-2955 — the server must not deadlock when more requests arrive at once
than the anyio threadpool has tokens.

The deadlock (measured 11/11 in a local load test, one uvicorn process as on
Railway): every sync endpoint runs in the default 40-token threadpool, and so
does its response validation (``fastapi/routing.py:338``). Under a burst, all
40 tokens are held by threads blocked in ``Pool.connect``, while the requests
that already hold a connection wait for a token to validate their response —
which they must do before ``get_db`` gives the connection back. Nothing moves
until ``DB_POOL_TIMEOUT``; with traffic still arriving it never recovers.

How this file reproduces it in ~2 s instead of 30: a throwaway app with its
own engine (pool 2 + 0 overflow, ``pool_timeout`` 2 s), a sync endpoint with a
``response_model`` (so validation goes through the threadpool) that holds a
connection from a yield dependency, and the default thread limiter shrunk to
4 tokens. 20 concurrent requests > 4 tokens > 2 connections, the same shape
as 60 > 40 > 15 in production.

- ``test_control_burst_without_gate_deadlocks`` — the control. Without the
  gate the burst MUST produce failures; if it ever goes green the
  reproduction is dead and the gated test proves nothing.
- ``test_burst_with_gate_all_succeed`` — same app wrapped in the gate.
"""

import asyncio
import time

import anyio.to_thread
import httpx
import pytest
from fastapi import Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from app.database import engine as _app_engine
from app.db_bulkhead import DbBulkheadMiddleware, gate_limit

BURST = 20
POOL = 2
TOKENS = 4


class _Out(BaseModel):
    n: int


def _make_app():
    engine = create_engine(
        _app_engine.url, pool_size=POOL, max_overflow=0, pool_timeout=2
    )
    session_factory = sessionmaker(bind=engine)

    def get_session():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app = FastAPI()

    @app.get("/q", response_model=_Out)
    def q(db: Session = Depends(get_session)):
        time.sleep(0.05)  # a real query's worth of time with the connection held
        return {"n": db.execute(text("SELECT 1")).scalar()}

    @app.get("/health/liveness")
    def ping():
        return {"ok": True}

    return app, engine


async def _burst(asgi_app):
    transport = httpx.ASGITransport(app=asgi_app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:

        async def one():
            try:
                r = await client.get("/q", timeout=20)
                return r.status_code
            except Exception as exc:  # noqa: BLE001 — any failure counts
                return type(exc).__name__

        return await asyncio.gather(*[one() for _ in range(BURST)])


def _run_with_small_threadpool(asgi_app):
    async def main():
        limiter = anyio.to_thread.current_default_thread_limiter()
        limiter.total_tokens = TOKENS
        try:
            return await _burst(asgi_app)
        finally:
            limiter.total_tokens = 40

    return anyio.run(main)


def test_control_burst_without_gate_deadlocks():
    app, engine = _make_app()
    try:
        codes = _run_with_small_threadpool(app)
    finally:
        engine.dispose()
    failures = [c for c in codes if c != 200]
    assert failures, (
        "Control is dead: the ungated burst all succeeded, so the reproduction "
        f"no longer reproduces the deadlock and the gated test proves nothing. {codes}"
    )


def test_burst_with_gate_all_succeed():
    app, engine = _make_app()
    gated = DbBulkheadMiddleware(app, limit=POOL, wait_seconds=15)
    try:
        codes = _run_with_small_threadpool(gated)
    finally:
        engine.dispose()
    assert codes == [200] * BURST, codes


def test_gate_sheds_with_503_and_retry_after_when_wait_runs_out():
    app, engine = _make_app()
    gated = DbBulkheadMiddleware(app, limit=1, wait_seconds=0.01)
    try:
        codes = []

        async def main():
            transport = httpx.ASGITransport(app=gated)
            async with httpx.AsyncClient(
                transport=transport, base_url="http://t"
            ) as client:
                rs = await asyncio.gather(*[client.get("/q") for _ in range(6)])
                codes.extend(r.status_code for r in rs)
                shed = [r for r in rs if r.status_code == 503]
                assert shed, codes
                assert shed[0].headers["retry-after"] == "2"
                assert shed[0].json()["detail"]

        anyio.run(main)
    finally:
        engine.dispose()
    assert 200 in codes, codes


def test_health_bypasses_a_full_gate():
    app, engine = _make_app()
    gated = DbBulkheadMiddleware(app, limit=1, wait_seconds=0.01)

    async def main():
        await gated.semaphore.acquire()  # gate full
        transport = httpx.ASGITransport(app=gated)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://t"
        ) as client:
            assert (await client.get("/health/liveness")).status_code == 200
            assert (await client.get("/q")).status_code == 503
            # readiness opens a DB connection, so it must NOT bypass
            assert (await client.get("/health/readiness")).status_code == 503

    try:
        anyio.run(main)
    finally:
        engine.dispose()


def test_gate_limit_never_exceeds_threadpool_tokens():
    assert gate_limit(pool_total=15, thread_tokens=40) == 13  # 2 headroom
    assert gate_limit(pool_total=80, thread_tokens=40) == 40
    assert gate_limit(pool_total=1, thread_tokens=40) == 1


def test_gate_is_registered_between_slowapi_and_gzip():
    """Inside CORS (a 503 still carries CORS headers so the browser can read
    it), outside GZip (which must stay innermost —
    tests/test_public_cache_and_gzip.py)."""
    from app.main import app

    names = [m.cls.__name__ for m in app.user_middleware]  # outer -> inner
    assert names.index("DbBulkheadMiddleware") == names.index("GZipMiddleware") - 1, (
        names
    )
    assert names.index("CORSMiddleware") < names.index("DbBulkheadMiddleware")


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Override conftest's autouse limiter reset — these apps don't use it."""
    yield
