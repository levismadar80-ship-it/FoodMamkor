"""
Module:   test_meh2298_edge_client_ip
Purpose:  MEH-2298 — the authenticated edge channel for the visitor IP. The
          header our Vercel middleware sets wins only with the right secret;
          everything else falls through to the MEH-256 order unchanged.
Touches:  Nothing outside the process — builds Starlette requests by hand.
Related:  backend/app/rate_limit.py::resolve_client_ip;
          frontend/middleware.js::apiPassThrough;
          backend/app/middleware.py::add_security_headers (X-Client-IP-Source).
History:  MEH-2298 (creation, 24/10).

WHAT DISCRIMINATES WHAT
-----------------------
`test_matching_secret_uses_edge_ip` is the only case that the pre-MEH-2298
code fails (it returned X-Real-IP). Every spoofing case below passes on the
old code too — they are the controls that stop "always trust the header"
from satisfying the suite.
"""

from __future__ import annotations

import pytest
from starlette.requests import Request

from app.rate_limit import get_real_client_ip, resolve_client_ip

SECRET = "s" * 40
VISITOR = "203.0.113.7"
VERCEL = "76.76.21.21"
PEER = "100.64.0.9"


def _req(headers: dict[str, str]) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/producers",
            "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
            "client": (PEER, 1234),
        }
    )


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    monkeypatch.setenv("EDGE_PROXY_SECRET", SECRET)


def _via_vercel(**extra) -> dict[str, str]:
    headers = {"x-real-ip": VERCEL, "x-forwarded-for": f"{VISITOR}, {VERCEL}"}
    headers.update(extra)
    return headers


def test_matching_secret_uses_edge_ip():
    req = _req(_via_vercel(**{"x-edge-secret": SECRET, "x-edge-client-ip": VISITOR}))
    assert resolve_client_ip(req) == (VISITOR, "edge")
    assert get_real_client_ip(req) == VISITOR


def test_wrong_secret_is_ignored():
    req = _req(
        _via_vercel(**{"x-edge-secret": "x" * 40, "x-edge-client-ip": "1.2.3.4"})
    )
    assert resolve_client_ip(req) == (VERCEL, "real-ip")


def test_missing_secret_header_is_ignored():
    req = _req(_via_vercel(**{"x-edge-client-ip": "1.2.3.4"}))
    assert resolve_client_ip(req) == (VERCEL, "real-ip")


def test_unset_secret_disables_the_channel(monkeypatch):
    monkeypatch.delenv("EDGE_PROXY_SECRET")
    req = _req(_via_vercel(**{"x-edge-secret": "", "x-edge-client-ip": "1.2.3.4"}))
    assert resolve_client_ip(req) == (VERCEL, "real-ip")


def test_short_secret_is_treated_as_unset(monkeypatch):
    short = "abc"
    monkeypatch.setenv("EDGE_PROXY_SECRET", short)
    req = _req(_via_vercel(**{"x-edge-secret": short, "x-edge-client-ip": "1.2.3.4"}))
    assert resolve_client_ip(req) == (VERCEL, "real-ip")


def test_garbage_ip_falls_through():
    req = _req(
        _via_vercel(**{"x-edge-secret": SECRET, "x-edge-client-ip": "not-an-ip"})
    )
    assert resolve_client_ip(req) == (VERCEL, "real-ip")


def test_ipv6_is_accepted_and_normalised():
    req = _req(
        _via_vercel(**{"x-edge-secret": SECRET, "x-edge-client-ip": "2001:DB8::1"})
    )
    assert resolve_client_ip(req) == ("2001:db8::1", "edge")


def test_meh256_order_unchanged_without_edge_headers(monkeypatch):
    assert resolve_client_ip(_req({"x-real-ip": VISITOR})) == (VISITOR, "real-ip")
    assert resolve_client_ip(_req({"x-forwarded-for": f"{VISITOR}, {VERCEL}"})) == (
        VISITOR,
        "xff",
    )
    assert resolve_client_ip(_req({})) == (PEER, "peer")
    monkeypatch.setenv("TRUSTED_PROXY", "0")
    assert resolve_client_ip(_req({"x-real-ip": VISITOR})) == (PEER, "peer")


def test_response_reports_the_source_label_not_the_ip(client):
    res = client.get(
        "/health",
        headers={"x-edge-secret": SECRET, "x-edge-client-ip": VISITOR},
    )
    assert res.headers["x-client-ip-source"] == "edge"
    assert VISITOR not in res.headers["x-client-ip-source"]
