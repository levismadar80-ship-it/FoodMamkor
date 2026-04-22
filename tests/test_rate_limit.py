"""MEH-256 — rate-limit key must resolve the real client IP behind a
trusted proxy, not the proxy's own IP.

Before MEH-256, `get_remote_address` read `request.client.host` which
on Railway is the edge-proxy IP. All users shared one bucket — a
single attacker could DoS login for everyone, and brute-force from a
distributed pool against a single target counted as one IP.

The fix is env-gated: when `TRUSTED_PROXY=1`, the limiter honors the
first `X-Forwarded-For` value. When unset, it falls back to the TCP
peer's IP so an attacker cannot spoof the header in an untrusted
environment.
"""
from unittest.mock import MagicMock

from app.rate_limit import get_real_client_ip


def _make_request(headers=None, client_host="127.0.0.1"):
    """Build the minimum FastAPI Request surface the key function reads."""
    req = MagicMock()
    req.headers = headers or {}
    req.client = MagicMock()
    req.client.host = client_host
    return req


def test_keys_by_xff_when_trusted(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "1.2.3.4, 10.0.0.1"},
        client_host="10.0.0.1",
    )
    assert get_real_client_ip(req) == "1.2.3.4"


def test_ignores_xff_when_untrusted(monkeypatch):
    """TRUSTED_PROXY unset/0 → XFF is attacker-controlled, must be ignored."""
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    req = _make_request(
        headers={"x-forwarded-for": "1.2.3.4"},
        client_host="127.0.0.1",
    )
    assert get_real_client_ip(req) == "127.0.0.1"


def test_handles_missing_xff(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(headers={}, client_host="10.0.0.1")
    assert get_real_client_ip(req) == "10.0.0.1"


def test_handles_malformed_xff(monkeypatch):
    """Empty / whitespace-only XFF falls back to TCP peer, never crashes."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "   , 10.0.0.1"},
        client_host="10.0.0.1",
    )
    assert get_real_client_ip(req) == "10.0.0.1"


def test_isolates_different_client_ips(monkeypatch):
    """The bug fix itself: two distinct real clients behind the same
    proxy IP must produce different keys."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    proxy_ip = "10.0.0.1"
    req_a = _make_request(
        headers={"x-forwarded-for": f"1.1.1.1, {proxy_ip}"},
        client_host=proxy_ip,
    )
    req_b = _make_request(
        headers={"x-forwarded-for": f"2.2.2.2, {proxy_ip}"},
        client_host=proxy_ip,
    )
    assert get_real_client_ip(req_a) != get_real_client_ip(req_b)
    assert get_real_client_ip(req_a) == "1.1.1.1"
    assert get_real_client_ip(req_b) == "2.2.2.2"
