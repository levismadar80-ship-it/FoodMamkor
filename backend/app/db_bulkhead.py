"""
Module:   db_bulkhead
Purpose:  Keep the server answering under a burst: at most N requests run
          inside the app at once; the rest wait in a cheap event-loop queue,
          and one that waits too long gets 503 + Retry-After instead of
          hanging.
Touches:  nothing (pure ASGI; no DB, no threads).
Does NOT: rate-limit per visitor — that is slowapi (rate_limit.py). Its
          limits are per-route decorators, so a 429 is decided INSIDE this
          gate (it is fast, the slot is held for microseconds).
Related:  database.py:48-49 (pool size), database.py:119 (_release_session),
          fastapi/routing.py:338 (sync response validation in the threadpool),
          middleware.py install_middlewares (position).
History:  MEH-2955 (creation — local load test 11/11: 60+ concurrent requests
          froze the process until DB_POOL_TIMEOUT, and never recovered while
          traffic kept arriving).

Why a gate and not a bigger pool: sync endpoints and their response
validation share anyio's default threadpool (40 tokens). In a burst every
token ends up held by a thread blocked in ``Pool.connect``, while requests
that already hold a connection wait for a token to validate their response —
which they must finish before the connection goes back (MEH-2886 releases it
only after the response). A bigger pool only moves the threshold: measured,
pool 30+10 still froze on a 200-request burst. Capping requests in flight at
min(pool, tokens) makes the cycle impossible: every admitted request can get
both a connection and a token.

Each admitted request holds its slot until its BackgroundTasks finish (they
run inside the response call). That is conservative — a slow email or the
signup risk score (an Anthropic call) keeps a slot — and is the price of the
guarantee.

Headroom: the gate admits pool total minus POOL_HEADROOM, because a few
connections are taken outside it — APScheduler jobs (startup.py) and the one
inline path that opens a second session inside a request
(services/whatsapp.py _persist_outbound). Without headroom those make an
admitted request wait up to DB_POOL_TIMEOUT for a connection.
"""

import asyncio
import json

import anyio.to_thread
from starlette.types import ASGIApp, Receive, Scope, Send

# MEH-2955: how long a request may wait for a slot before it is shed. Long
# enough to ride out a burst (a slot frees every few ms at normal latency),
# short enough that the visitor gets an answer instead of a hang.
WAIT_SECONDS = 10.0
RETRY_AFTER_SECONDS = 2
BUSY_DETAIL = "האתר עמוס כרגע. נסו שוב בעוד רגע."

# Connections reserved for users outside the gate (module docstring).
POOL_HEADROOM = 2

# Only the DB-free probes bypass the gate (MEH-2955). DO NOT add
# /health/readiness: it is sync and opens a DB connection, so an ungated
# burst of it re-creates the deadlock this gate exists to prevent.
_BYPASS_PATHS = frozenset({"/health", "/health/liveness"})


def gate_limit(pool_total: int, thread_tokens: int) -> int:
    """Requests allowed in flight: never more than the connections left after
    headroom, never more than threadpool tokens (either excess re-opens the
    deadlock)."""
    return max(1, min(pool_total - POOL_HEADROOM, thread_tokens))


class DbBulkheadMiddleware:
    """Pure ASGI (no BaseHTTPMiddleware): waiting costs a coroutine, not a
    thread.

    The semaphore is not thread-safe and binds to the first loop it waits
    on. Fine in production (one loop). In tests, the shared app instance is
    driven by TestClient from more than one loop; that only matters once a
    test pushes more than ``limit`` concurrent requests through it."""

    def __init__(
        self,
        app: ASGIApp,
        limit: int | None = None,
        wait_seconds: float = WAIT_SECONDS,
    ) -> None:
        self.app = app
        if limit is None:
            from app.database import DB_MAX_OVERFLOW, DB_POOL_SIZE

            # The default limiter's size is readable without a running loop
            # only through anyio's own default (40); a deploy that raises it
            # would still be safe, just gated lower than it could be.
            limit = gate_limit(DB_POOL_SIZE + DB_MAX_OVERFLOW, _default_thread_tokens())
        self.limit = limit
        self.wait_seconds = wait_seconds
        self.semaphore = asyncio.Semaphore(limit)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in _BYPASS_PATHS:
            await self.app(scope, receive, send)
            return
        try:
            await asyncio.wait_for(self.semaphore.acquire(), self.wait_seconds)
        except TimeoutError:
            await _send_busy(send)
            return
        try:
            await self.app(scope, receive, send)
        finally:
            self.semaphore.release()


def _default_thread_tokens() -> int:
    try:
        return int(anyio.to_thread.current_default_thread_limiter().total_tokens)
    except RuntimeError:  # no running event loop at import time
        return 40


async def _send_busy(send: Send) -> None:
    body = json.dumps({"detail": BUSY_DETAIL}, ensure_ascii=False).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 503,
            "headers": [
                (b"content-type", b"application/json; charset=utf-8"),
                (b"content-length", str(len(body)).encode()),
                (b"retry-after", str(RETRY_AFTER_SECONDS).encode()),
                (b"cache-control", b"no-store"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
