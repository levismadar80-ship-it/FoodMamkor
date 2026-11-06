"""
Module:   test_meh2761_error_security_headers
Purpose:  MEH-2761 — an unhandled exception (HTTP 500) and a rate-limit
          rejection (HTTP 429) carry the same security headers as every other
          API response.
Touches:  Nothing outside the process — TestClient against a fresh FastAPI
          app built with the real `install_middlewares`, so the routes added
          here never reach the production app object.
Related:  backend/app/middleware.py::apply_security_headers ·
          tests/test_meh2750_security_headers.py (the other response kinds).
History:  MEH-2761 (creation, 06/11).

WHY A FRESH APP
---------------
The 500 needs a route that raises. Adding one to `app.main.app` would leave a
crashing route registered for the rest of the session. `install_middlewares`
is the whole security layer, so a fresh app built with it is the same stack.

WHAT DISCRIMINATES
------------------
Before the fix the 500 came from Starlette's ServerErrorMiddleware, which sits
outside `@app.middleware("http")`, and carried none of these headers (measured
06/11: `{}`). `test_exception_still_propagates` pins that the fix does not
swallow the exception — server logs and Sentry must still see it.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient

from app.middleware import install_middlewares
from app.rate_limit import limiter

EXPECTED = {
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=(self)",
    "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
}


class _Boom(RuntimeError):
    pass


def _app() -> FastAPI:
    app = FastAPI()
    install_middlewares(app)

    @app.get("/meh2761/boom")
    def boom():
        raise _Boom("deliberate")

    @app.get("/meh2761/limited")
    @limiter.limit("1/minute")
    def limited(request: Request):
        return {"ok": True}

    return app


# Built ONCE: slowapi registers a limit per decorated function name, so a
# second `_app()` would stack another "1/minute" on the same key and the first
# request of the 429 test would already be rejected.
_APP = _app()


def _missing(headers) -> list[str]:
    return [
        f"{name}: got {headers.get(name)!r}"
        for name, value in EXPECTED.items()
        if headers.get(name) != value
    ]


def test_500_carries_security_headers():
    r = TestClient(_APP, raise_server_exceptions=False).get("/meh2761/boom")
    assert r.status_code == 500
    assert _missing(r.headers) == []


def test_500_body_is_unchanged():
    r = TestClient(_APP, raise_server_exceptions=False).get("/meh2761/boom")
    assert r.text == "Internal Server Error"
    assert "deliberate" not in r.text


def test_exception_still_propagates():
    with pytest.raises(_Boom):
        TestClient(_APP, raise_server_exceptions=True).get("/meh2761/boom")


def test_429_carries_security_headers():
    was = limiter.enabled
    limiter.enabled = True
    try:
        c = TestClient(_APP)
        assert c.get("/meh2761/limited").status_code == 200
        r = c.get("/meh2761/limited")
    finally:
        limiter.enabled = was
    assert r.status_code == 429
    assert _missing(r.headers) == []
