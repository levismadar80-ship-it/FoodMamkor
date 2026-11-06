"""
Module:   test_meh2750_security_headers
Purpose:  MEH-2750 — every API response carries the security headers that
          backend/app/middleware.py::add_security_headers sets. Before this
          file no test asserted any of them (grep of tests/ for
          X-Content-Type-Options / Strict-Transport-Security = 0 hits,
          06/11), so a refactor of the middleware stack could drop them with
          every check green.
Touches:  Nothing outside the process — TestClient against the app.
Related:  backend/app/middleware.py::add_security_headers ·
          docs/SECURITY.md (header list) · frontend/next.config.js
          securityHeaders (the frontend twin; checked live after deploy by
          scripts/checks/live_security_headers.py, MEH-2749).
History:  MEH-2750 (creation, 06/11).

WHAT DISCRIMINATES WHAT
-----------------------
The response kinds below are chosen because each one leaves the app by a
different path: a normal route, the 404 handler, an auth dependency raising
401, and a body-validation 422. A header set only on the happy path fails the
error cases. `test_control_a_header_the_app_never_sets_is_absent` stops a
client that echoes every name from passing the suite.

KNOWN GAP — NOT COVERED: an unhandled exception (HTTP 500). Starlette's
ServerErrorMiddleware sits outside `@app.middleware("http")`, so the 500 it
builds carries NONE of these headers (measured 06/11: a route that raises →
500 with zero security headers). Pinning that here would assert the gap, and
fixing it means re-ordering the middleware stack — a security-layer change
that is Sapir's call, tracked as MEH-2761 (post-launch), not folded into a
tests-only PR.
429 (slowapi) is not covered either.
"""

from __future__ import annotations

import re

import pytest

# Exact values. Weakening any of them is a decision for Sapir (see the
# comment above add_security_headers), so a change here must be deliberate.
EXPECTED = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)",
}

# Floor = today's value (2 years, middleware.py). The comment above
# add_security_headers calls any shortening a regression, so 2y -> 1y must
# go red; lengthening stays green.
HSTS_MIN_MAX_AGE_S = 63072000

# (method, path, json body, expected status) — one per exit path.
CASES = [
    ("GET", "/health/liveness", None, 200),
    ("GET", "/__meh2750-no-such-route__", None, 404),
    ("GET", "/auth/me", None, 401),
    ("POST", "/auth/login", {"email": "not-an-email"}, 422),
]


def _call(client, method, path, body):
    return (
        client.request(method, path, json=body)
        if body is not None
        else client.request(method, path)
    )


@pytest.mark.parametrize(
    ("method", "path", "body", "status"), CASES, ids=[c[1] for c in CASES]
)
def test_security_headers_on_every_exit_path(client, method, path, body, status):
    r = _call(client, method, path, body)
    assert r.status_code == status, (
        f"{method} {path}: expected {status}, got {r.status_code} — the case no longer exercises its exit path"
    )
    for name, value in EXPECTED.items():
        assert r.headers.get(name) == value, (
            f"{method} {path}: {name}={r.headers.get(name)!r}"
        )


@pytest.mark.parametrize(
    ("method", "path", "body", "status"), CASES, ids=[c[1] for c in CASES]
)
def test_hsts_is_long_with_subdomains_and_preload(client, method, path, body, status):
    hsts = _call(client, method, path, body).headers.get(
        "Strict-Transport-Security", ""
    )
    m = re.search(r"max-age=(\d+)", hsts)
    assert m, f"{path}: HSTS missing or has no max-age: {hsts!r}"
    assert int(m.group(1)) >= HSTS_MIN_MAX_AGE_S, (
        f"{path}: HSTS max-age shortened below 2 years: {hsts!r}"
    )
    assert "includeSubDomains" in hsts, (
        f"{path}: HSTS without includeSubDomains: {hsts!r}"
    )
    assert "preload" in hsts, f"{path}: HSTS without preload: {hsts!r}"


def test_control_a_header_the_app_never_sets_is_absent(client):
    r = client.get("/health/liveness")
    assert r.status_code == 200
    assert "X-Meh2750-Never-Set" not in r.headers
