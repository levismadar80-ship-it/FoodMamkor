# guard-ok: backend/pyproject.toml is deny-listed for CC, so this file is not in [tool.mypy].files yet; it passes mypy --strict (PR body). Sapir adds the line.
"""
Module:   body_limit
Purpose:  No request body above MAX_BODY_BYTES enters the app. A declared
          Content-Length above the cap is answered 413 before a byte is read;
          a body with no (or a wrong) Content-Length is counted as it arrives
          and cut off with 413 when it crosses the cap.
Touches:  nothing (pure ASGI; no DB, no threads).
Does NOT: validate what the body IS — the 5 MB image cap and the magic-byte
          check stay in routers/upload.py; the WhatsApp webhook keeps its own
          smaller cap (routers/whatsapp_webhook.py). It does not time out a
          slow body either: that is the bulkhead's subject (db_bulkhead.py).
Related:  middleware.py install_middlewares (position: outside the DB
          bulkhead, inside CORS), routers/upload.py:31 (MAX_FILE_SIZE),
          fastapi/routing.py (re-raises an HTTPException met while it reads
          the body; any other exception there becomes a 400).
History:  MEH-3374 (creation — rulings 17/11 §א5: there was no app-level cap,
          and the upload route checked size only after reading the body).
"""

import json

from starlette.exceptions import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# 6 MB: the largest legitimate body is a 5 MB image (routers/upload.py) plus
# its multipart envelope.
MAX_BODY_BYTES = 6 * 1024 * 1024

TOO_LARGE_DETAIL = "Request body too large"
# The one place a person meets this limit is a photo upload, and that route
# already has approved wording for "too big" (routers/upload.py) — reused, not
# imported, so this module stays import-free of the routers.
_UPLOAD_PREFIX = "/upload"
_UPLOAD_DETAIL = "תמונה גדולה מדי (מקסימום 5MB)"


class BodyTooLarge(HTTPException):
    """Raised from `receive` when the counted body crosses the cap.

    An HTTPException on purpose: FastAPI reads the body inside a block that
    re-raises HTTPException and turns every other exception into a 400, so
    this type is the one that reaches the client as 413 from inside a route.
    Read outside FastAPI (a pure-ASGI layer), it propagates to the middleware
    below, which answers 413 itself.
    """

    def __init__(self, detail: str) -> None:
        super().__init__(status_code=413, detail=detail)


class BodySizeLimitMiddleware:
    """Pure ASGI, so refusing costs no thread and no buffering."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        detail = _detail_for(scope.get("path", ""))
        declared = _declared_length(scope)
        if declared is not None and declared > self.max_bytes:
            await _send_too_large(send, detail)
            return

        # Counted even when Content-Length is present and small: the header is
        # the client's claim, and the count is what actually arrived.
        seen = 0
        started = False

        async def counting_receive() -> Message:
            nonlocal seen
            message = await receive()
            if message["type"] == "http.request":
                seen += len(message.get("body", b""))
                if seen > self.max_bytes:
                    raise BodyTooLarge(detail)
            return message

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, counting_receive, tracking_send)
        except BodyTooLarge:
            # DO NOT swallow this once a response has started — a second
            # http.response.start is a protocol error; let the server close.
            if started:
                raise
            await _send_too_large(send, detail)


def _declared_length(scope: Scope) -> int | None:
    """The Content-Length as a non-negative int, or None when it is absent or
    not one (then the count decides)."""
    for name, value in scope.get("headers", []):
        if name.lower() == b"content-length":
            text = value.decode("latin-1").strip()
            return int(text) if text.isascii() and text.isdigit() else None
    return None


def _detail_for(path: str) -> str:
    return _UPLOAD_DETAIL if path.startswith(_UPLOAD_PREFIX) else TOO_LARGE_DETAIL


async def _send_too_large(send: Send, detail: str) -> None:
    body = json.dumps({"detail": detail}, ensure_ascii=False).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json; charset=utf-8"),
                (b"content-length", str(len(body)).encode()),
                (b"cache-control", b"no-store"),
                # The unread body is still on the wire; tell the server and the
                # client not to reuse this connection for another request.
                (b"connection", b"close"),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
