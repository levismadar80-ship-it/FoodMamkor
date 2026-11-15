"""MEH-3297 — a slow request body must not hold a bulkhead slot.

Before: the slot was taken at header arrival and the app read the body
inside it, with no body-read timeout, so N stalled uploads blocked every
other request for WAIT_SECONDS and then 503'd them. Now the body is read
before the slot, under a deadline (408) and a size cap (413).
Pure ASGI, no DB.
"""

import asyncio
import json

import anyio
from fastapi import FastAPI, Request

from app.db_bulkhead import DbBulkheadMiddleware


def _app() -> FastAPI:
    app = FastAPI()

    @app.get("/ping")
    async def ping() -> dict:
        return {"ok": True}

    @app.post("/echo")
    async def echo(request: Request) -> dict:
        return {"len": len(await request.body())}

    return app


async def _call(  # noqa: PLR0913 — test driver, keyword knobs only
    app, method, path, body_chunks=None, stall=False, headers=None, gap=0.0
):
    """Drive one request through the ASGI app; returns (status, json body)."""
    hdrs = list(headers or [])
    chunks = list(body_chunks or [])
    sent: list[dict] = []
    done = asyncio.Event()

    async def receive():
        if stall:
            await asyncio.sleep(3600)
        if chunks:
            if gap:
                await asyncio.sleep(gap)
            body = chunks.pop(0)
            return {"type": "http.request", "body": body, "more_body": bool(chunks)}
        await done.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": hdrs,
        "client": ("127.0.0.1", 1),
        "server": ("t", 80),
    }
    try:
        await app(scope, receive, send)
    finally:
        done.set()
    start = next(m for m in sent if m["type"] == "http.response.start")
    body = b"".join(
        m.get("body", b"") for m in sent if m["type"] == "http.response.body"
    )
    return start["status"], json.loads(body) if body else None


def test_stalled_body_does_not_block_other_requests():
    gated = DbBulkheadMiddleware(_app(), limit=1, wait_seconds=0.5, body_idle_seconds=1)

    async def main():
        stalled = asyncio.create_task(
            _call(
                gated,
                "POST",
                "/echo",
                stall=True,
                headers=[(b"content-length", b"100")],
            )
        )
        await asyncio.sleep(0.05)  # the stalled request is in first
        status, _ = await _call(gated, "GET", "/ping")
        assert status == 200, "a stalled body held the only slot"
        status, body = await stalled
        assert status == 408
        assert body["detail"]

    anyio.run(main)


def test_buffered_body_reaches_the_app_intact():
    gated = DbBulkheadMiddleware(_app(), limit=1)

    async def main():
        status, body = await _call(
            gated,
            "POST",
            "/echo",
            body_chunks=[b"a" * 1000, b"b" * 1000, b"c"],
            headers=[(b"content-length", b"2001")],
        )
        assert (status, body) == (200, {"len": 2001})

    anyio.run(main)


def test_oversized_body_is_413(monkeypatch):
    import app.db_bulkhead as bulkhead

    monkeypatch.setattr(bulkhead, "MAX_BUFFERED_BODY", 10)
    gated = DbBulkheadMiddleware(_app(), limit=1)

    async def main():
        status, _ = await _call(
            gated,
            "POST",
            "/echo",
            body_chunks=[b"x" * 8, b"x" * 8],
            headers=[(b"content-length", b"16")],
        )
        assert status == 413

    anyio.run(main)


def test_get_without_body_is_not_buffered():
    gated = DbBulkheadMiddleware(_app(), limit=1)

    async def main():
        status, body = await _call(gated, "GET", "/ping")
        assert (status, body) == (200, {"ok": True})

    anyio.run(main)


def test_slow_but_steady_upload_is_not_cut_off():
    """Idle deadline, not a whole-body deadline: 6 chunks 0.3 s apart take
    1.8 s, longer than the 1 s idle limit, and must still succeed."""
    gated = DbBulkheadMiddleware(_app(), limit=1, body_idle_seconds=1)

    async def main():
        status, body = await _call(
            gated,
            "POST",
            "/echo",
            body_chunks=[b"x" * 10] * 6,
            headers=[(b"content-length", b"60")],
            gap=0.3,
        )
        assert (status, body) == (200, {"len": 60})
        assert gated.buffered == 0

    anyio.run(main)


def test_declared_oversize_is_413_before_reading(monkeypatch):
    import app.db_bulkhead as bulkhead

    monkeypatch.setattr(bulkhead, "MAX_BUFFERED_BODY", 10)
    gated = DbBulkheadMiddleware(_app(), limit=1)

    async def main():
        # stall=True: if the gate tried to read the body this would hang.
        status, _ = await asyncio.wait_for(
            _call(
                gated, "POST", "/echo", stall=True, headers=[(b"content-length", b"11")]
            ),
            2,
        )
        assert status == 413

    anyio.run(main)


def test_over_budget_is_503_and_budget_is_released(monkeypatch):
    import app.db_bulkhead as bulkhead

    monkeypatch.setattr(bulkhead, "BUFFER_BUDGET", 15)
    gated = DbBulkheadMiddleware(_app(), limit=1)

    async def main():
        gated.buffered = 10  # another request already holds 10 bytes
        status, _ = await _call(
            gated,
            "POST",
            "/echo",
            body_chunks=[b"x" * 8],
            headers=[(b"content-length", b"8")],
        )
        assert status == 503
        assert gated.buffered == 10  # nothing leaked
        gated.buffered = 0
        status, _ = await _call(
            gated,
            "POST",
            "/echo",
            body_chunks=[b"x" * 8],
            headers=[(b"content-length", b"8")],
        )
        assert status == 200
        assert gated.buffered == 0

    anyio.run(main)


def test_stalled_declared_body_costs_no_budget():
    """A client that declares a big body and sends nothing must not reserve
    budget — or a few of them would 503 every POST."""
    gated = DbBulkheadMiddleware(_app(), limit=1, body_idle_seconds=1)

    async def main():
        task = asyncio.create_task(
            _call(
                gated,
                "POST",
                "/echo",
                stall=True,
                headers=[(b"content-length", b"9000000")],
            )
        )
        await asyncio.sleep(0.1)
        assert gated.buffered == 0
        status, _ = await task
        assert status == 408
        assert gated.buffered == 0

    anyio.run(main)
