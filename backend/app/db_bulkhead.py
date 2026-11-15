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
          traffic kept arriving); MEH-3297 (body read before the slot, with a
          deadline and a size cap — a slow body no longer holds a slot).

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
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# MEH-2955: how long a request may wait for a slot before it is shed. Long
# enough to ride out a burst (a slot frees every few ms at normal latency),
# short enough that the visitor gets an answer instead of a hang.
WAIT_SECONDS = 10.0
RETRY_AFTER_SECONDS = 2
BUSY_DETAIL = "האתר עמוס כרגע. נסו שוב בעוד רגע."

# Connections reserved for users outside the gate (module docstring).
POOL_HEADROOM = 2

# MEH-3297: a request body is read before the request may take a slot.
# - BODY_IDLE_SECONDS: longest gap between two body chunks (a stalled client).
# - BODY_TOTAL_SECONDS: longest whole read. Generous on purpose: a 5 MB upload
#   (upload.py MAX_FILE_SIZE) in 300 s needs ~140 kbit/s, a weak 3G uplink. A
#   trickle holds no slot, so a long deadline costs only a coroutine.
# - MAX_BUFFERED_BODY: per request; 2x the upload cap plus multipart overhead.
# - BUFFER_BUDGET: all bodies buffered at once. Before MEH-3297 at most `limit`
#   bodies were read (inside slots); outside the gate nothing else bounds the
#   count, so without this many fast large posts could exhaust RAM. Over
#   budget answers like a full gate: 503 + Retry-After.
# - FREE_BODY_BYTES: the first part of every body is never charged to the
#   budget, so a few large uploads held open near BODY_TOTAL_SECONDS can fill
#   the budget for uploads only — login, register and every small JSON POST
#   still get in. uvicorn already buffers this much per connection before it
#   pauses reading (its flow-control high-water mark), so it adds no new kind
#   of memory use.
BODY_IDLE_SECONDS = 15.0
BODY_TOTAL_SECONDS = 300.0
MAX_BUFFERED_BODY = 10 * 1024 * 1024
BUFFER_BUDGET = 64 * 1024 * 1024
FREE_BODY_BYTES = 64 * 1024
BODY_TIMEOUT_DETAIL = "הבקשה הגיעה לאט מדי. נסו שוב."
BODY_TOO_LARGE_DETAIL = "הבקשה גדולה מדי."

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
        body_idle_seconds: float = BODY_IDLE_SECONDS,
        body_total_seconds: float = BODY_TOTAL_SECONDS,
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
        self.body_idle_seconds = body_idle_seconds
        self.body_total_seconds = body_total_seconds
        # Bytes currently buffered across requests (one event loop: no lock).
        self.buffered = 0
        self.semaphore = asyncio.Semaphore(limit)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"] in _BYPASS_PATHS:
            await self.app(scope, receive, send)
            return
        # MEH-3297: read the body BEFORE taking a slot. Starlette reads it
        # inside the app, and uvicorn has no body-read timeout, so a client
        # that sends headers and then trickles (or never sends) the body held
        # a slot for as long as it liked — 13 such connections and every other
        # request waited WAIT_SECONDS for a 503. Buffered here, a slow body
        # costs a coroutine, never a slot.
        reserved = 0
        try:
            if _has_body(scope):
                declared = _content_length(scope)
                if declared is not None and declared > MAX_BUFFERED_BODY:
                    await _send_error(send, 413, BODY_TOO_LARGE_DETAIL)
                    return
                try:
                    messages, reserved = await asyncio.wait_for(
                        self._read_body(receive), self.body_total_seconds
                    )
                except TimeoutError:
                    await _send_error(send, 408, BODY_TIMEOUT_DETAIL)
                    return
                except _BodyTooLarge:
                    await _send_error(send, 413, BODY_TOO_LARGE_DETAIL)
                    return
                except _OverBudget:
                    await _send_busy(send, close=True)
                    return
                if messages is None:  # client disconnected mid-body
                    return
                receive = _replay(messages, receive)
            await self._admit(scope, receive, send)
        finally:
            self.buffered -= reserved

    async def _read_body(self, receive: Receive) -> tuple[list[Message] | None, int]:
        """All `http.request` messages up to the last one (None on
        disconnect), and the bytes reserved against BUFFER_BUDGET.

        Bytes are reserved as they ARRIVE, never from the declared
        Content-Length: a client that declares 10 MB and sends nothing must
        cost no budget, or a handful of them would 503 every POST. Only bytes
        past FREE_BODY_BYTES are charged, so small bodies never see a 503 from
        the budget. The caller
        releases what is returned; on an exception path it is released here."""
        reserved = 0

        def reserve(n: int) -> None:
            nonlocal reserved
            if self.buffered + n > BUFFER_BUDGET:
                raise _OverBudget
            self.buffered += n
            reserved += n

        messages: list[Message] = []
        size = 0
        try:
            while True:
                message = await asyncio.wait_for(receive(), self.body_idle_seconds)
                if message["type"] == "http.disconnect":
                    return None, reserved
                chunk = len(message.get("body", b""))
                size += chunk
                if size > MAX_BUFFERED_BODY:
                    raise _BodyTooLarge
                billable = size - FREE_BODY_BYTES
                if billable > reserved:
                    reserve(billable - reserved)
                messages.append(message)
                if not message.get("more_body", False):
                    return messages, reserved
        except BaseException:
            self.buffered -= reserved
            raise

    async def _admit(self, scope: Scope, receive: Receive, send: Send) -> None:
        try:
            await asyncio.wait_for(self.semaphore.acquire(), self.wait_seconds)
        except TimeoutError:
            await _send_busy(send)
            return
        try:
            await self.app(scope, receive, send)
        finally:
            self.semaphore.release()


class _BodyTooLarge(Exception):
    pass


class _OverBudget(Exception):
    pass


def _content_length(scope: Scope) -> int | None:
    for name, value in scope.get("headers", []):
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


def _has_body(scope: Scope) -> bool:
    for name, value in scope.get("headers", []):
        if name == b"transfer-encoding":
            return True
        if name == b"content-length" and value.strip() not in (b"", b"0"):
            return True
    return False


def _replay(messages: list[Message], receive: Receive) -> Receive:
    """Hand the buffered body to the app, then fall through to the real
    `receive` (so disconnect detection during a streamed response still
    works)."""
    pending = list(messages)

    async def replay_receive() -> Message:
        if pending:
            return pending.pop(0)
        return await receive()

    return replay_receive


def _default_thread_tokens() -> int:
    try:
        return int(anyio.to_thread.current_default_thread_limiter().total_tokens)
    except RuntimeError:  # no running event loop at import time
        return 40


async def _send_busy(send: Send, close: bool = False) -> None:
    await _send_error(
        send,
        503,
        BUSY_DETAIL,
        [(b"retry-after", str(RETRY_AFTER_SECONDS).encode())],
        close=close,
    )


async def _send_error(
    send: Send,
    status: int,
    detail: str,
    extra_headers: list[tuple[bytes, bytes]] | None = None,
    close: bool = True,
) -> None:
    body = json.dumps({"detail": detail}, ensure_ascii=False).encode()
    headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode()),
        *(extra_headers or []),
        (b"cache-control", b"no-store"),
    ]
    if close:
        # The connection may still be mid-body; don't leave it half-read. Off
        # only for the full-gate 503, whose body (if any) was fully read.
        headers.append((b"connection", b"close"))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})
