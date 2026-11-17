"""MEH-3374 — no request body above 6 MB gets into the app (rulings 17/11 §א5).

Two paths, both pinned here:
  - a declared Content-Length above the cap is answered 413 before one byte
    of the body is read;
  - a body with no Content-Length (chunked) is counted as it arrives and cut
    off with 413 when it crosses the cap.

The app is driven as raw ASGI where the test needs to see what was READ; a
TestClient always sends Content-Length, so it cannot reach the second path.
"""

import asyncio
import json

import pytest

from app.body_limit import MAX_BODY_BYTES, BodySizeLimitMiddleware, BodyTooLarge
from app.main import app

MB = 1024 * 1024


def _scope(path="/auth/login", headers=(), method="POST"):
    return {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": [(b"host", b"testserver"), *headers],
        "client": ("203.0.113.9", 4321),
        "server": ("testserver", 80),
    }


def _run(asgi_app, scope, chunks):
    """Drive one request. Returns (status, headers dict, body, chunks_read)."""
    out = {"status": None, "headers": {}, "body": b"", "read": 0}
    pending = list(chunks)

    async def receive():
        if not pending:
            return {"type": "http.disconnect"}
        out["read"] += 1
        chunk = pending.pop(0)
        return {"type": "http.request", "body": chunk, "more_body": bool(pending)}

    async def send(message):
        if message["type"] == "http.response.start":
            out["status"] = message["status"]
            out["headers"] = {
                k.decode().lower(): v.decode() for k, v in message["headers"]
            }
        elif message["type"] == "http.response.body":
            out["body"] += message.get("body", b"")

    asyncio.run(asgi_app(scope, receive, send))
    return out["status"], out["headers"], out["body"], out["read"]


def test_the_cap_is_six_megabytes():
    assert MAX_BODY_BYTES == 6 * MB


# ---------- path 1: Content-Length ----------


def test_declared_length_above_the_cap_is_413_and_nothing_is_read():
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(MAX_BODY_BYTES + 1).encode()),
    ]
    status, _, body, read = _run(app, _scope(headers=headers), [b"x" * 1024] * 8)
    assert status == 413
    assert read == 0
    assert "detail" in json.loads(body)


def test_declared_length_exactly_at_the_cap_is_not_413():
    payload = b"x" * MAX_BODY_BYTES  # not JSON: the handler's own 422, not 413
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(payload)).encode()),
    ]
    status, _, _, _ = _run(app, _scope(headers=headers), [payload])
    assert status == 422


# ---------- path 2: counted chunks, no Content-Length ----------


def test_chunked_body_is_cut_off_when_it_crosses_the_cap():
    headers = [
        (b"content-type", b"application/json"),
        (b"transfer-encoding", b"chunked"),
    ]
    chunks = [b"x" * MB] * 20  # 20 MB offered
    status, _, _, read = _run(app, _scope(headers=headers), chunks)
    assert status == 413
    # 6 chunks fill the cap exactly; the 7th crosses it. Nothing after is read.
    assert read == 7


def test_chunked_body_under_the_cap_reaches_the_handler():
    """Control for the test above: the same shape, small, is NOT 413 — it gets
    the handler's own answer (422: not valid JSON for the login schema)."""
    headers = [
        (b"content-type", b"application/json"),
        (b"transfer-encoding", b"chunked"),
    ]
    status, _, _, read = _run(app, _scope(headers=headers), [b"x" * 1024] * 3)
    assert status == 422
    assert read == 3


def test_a_small_declared_length_does_not_switch_the_counting_off():
    headers = [(b"content-type", b"application/json"), (b"content-length", b"10")]
    status, _, _, read = _run(app, _scope(headers=headers), [b"x" * MB] * 20)
    assert status == 413
    assert read == 7


_PART_HEAD = (
    b"--xyz\r\n"
    b'Content-Disposition: form-data; name="file"; filename="a.jpg"\r\n'
    b"Content-Type: image/jpeg\r\n\r\n"
)


@pytest.mark.parametrize(
    ("path", "content_type", "first"),
    [
        # the form parser — a well-formed part that never ends
        ("/upload/image", b"multipart/form-data; boundary=xyz", _PART_HEAD),
        # request.body() inside the route
        ("/webhook/whatsapp", b"application/json", b""),
    ],
)
def test_counted_path_holds_for_the_other_ways_a_route_reads_a_body(
    path, content_type, first
):
    headers = [(b"content-type", content_type), (b"transfer-encoding", b"chunked")]
    chunks = [first + b"x" * (MB - len(first))] + [b"x" * MB] * 19
    status, _, _, read = _run(app, _scope(path=path, headers=headers), chunks)
    assert status == 413
    assert read == 7


def test_a_content_length_too_long_to_be_a_number_falls_back_to_counting():
    headers = [(b"content-length", b"9" * 5000)]
    status, _, _, _ = _run(app, _scope(headers=headers), [b"x" * 16])
    assert status == 422  # counted, small, so the handler's own answer


def test_only_the_upload_routes_get_the_upload_wording():
    from app.body_limit import TOO_LARGE_DETAIL, _detail_for

    assert _detail_for("/upload") != TOO_LARGE_DETAIL
    assert _detail_for("/upload/image") != TOO_LARGE_DETAIL
    assert _detail_for("/uploads-of-something-else") == TOO_LARGE_DETAIL
    assert _detail_for("/auth/login") == TOO_LARGE_DETAIL


# ---------- the 413 is a full citizen ----------


def test_413_carries_cors_request_id_and_security_headers():
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(MAX_BODY_BYTES + 1).encode()),
        (b"origin", b"http://localhost:3000"),
    ]
    status, got, _, _ = _run(app, _scope(headers=headers), [])
    assert status == 413
    assert got.get("x-content-type-options") == "nosniff"
    assert "x-request-id" in got
    assert got.get("access-control-allow-origin") == "http://localhost:3000"


def test_upload_path_keeps_its_hebrew_wording():
    from app.routers.upload import MAX_FILE_SIZE

    headers = [
        (b"content-type", b"multipart/form-data; boundary=x"),
        (b"content-length", str(MAX_BODY_BYTES + 1).encode()),
    ]
    _, _, body, _ = _run(app, _scope(path="/upload/image", headers=headers), [])
    assert (
        json.loads(body)["detail"]
        == f"תמונה גדולה מדי (מקסימום {MAX_FILE_SIZE // MB}MB)"
    )


# ---------- position and scope ----------


def test_sits_outside_the_bulkhead_and_inside_cors():
    """An oversized body must not hold a DB slot while it is refused, and the
    413 must still get CORS + X-Request-ID. user_middleware is outermost first."""
    names = [m.cls.__name__ for m in app.user_middleware]
    assert "BodySizeLimitMiddleware" in names
    i = names.index("BodySizeLimitMiddleware")
    assert i < names.index("DbBulkheadMiddleware")
    assert i > names.index("CORSMiddleware")
    assert i > names.index("CorrelationIdMiddleware")


def test_upload_cap_stays_below_the_body_cap():
    """The 5 MB file cap needs multipart overhead to fit under the body cap."""
    from app.routers.upload import MAX_FILE_SIZE

    assert MAX_FILE_SIZE + 512 * 1024 <= MAX_BODY_BYTES


# ---------- the middleware alone ----------


def test_reader_outside_fastapi_is_answered_by_the_middleware_itself():
    """A pure-ASGI layer inside this one may read the body before FastAPI
    exists to turn the error into a response (the bulkhead plans to). The
    middleware then answers 413 itself."""

    async def reads_everything(scope, receive, send):
        while True:
            message = await receive()
            if not message.get("more_body"):
                break
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    wrapped = BodySizeLimitMiddleware(reads_everything, max_bytes=10)
    status, _, _, read = _run(wrapped, _scope(), [b"12345", b"67890", b"1", b"never"])
    assert status == 413
    assert read == 3
    status, _, body, _ = _run(wrapped, _scope(), [b"12345", b"67890"])
    assert (status, body) == (200, b"ok")


def test_after_the_response_started_the_error_is_not_swallowed():
    async def starts_then_reads(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        while (await receive()).get("more_body"):
            pass

    wrapped = BodySizeLimitMiddleware(starts_then_reads, max_bytes=3)
    with pytest.raises(BodyTooLarge):
        _run(wrapped, _scope(), [b"1234", b"5"])


def test_non_http_scopes_pass_through():
    seen = []

    async def inner(scope, receive, send):
        seen.append(scope["type"])

    asyncio.run(BodySizeLimitMiddleware(inner)({"type": "lifespan"}, None, None))
    assert seen == ["lifespan"]


@pytest.mark.parametrize("value", [b"abc", b"-5", b"", b"1e9"])
def test_an_unreadable_content_length_falls_back_to_counting(value):
    async def reads_everything(scope, receive, send):
        while (await receive()).get("more_body"):
            pass
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b""})

    wrapped = BodySizeLimitMiddleware(reads_everything, max_bytes=10)
    status, _, _, _ = _run(
        wrapped, _scope(headers=[(b"content-length", value)]), [b"x" * 11]
    )
    assert status == 413
