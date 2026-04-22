"""MEH-256 — rate-limit key must resolve the real client IP behind a
trusted proxy, not the proxy's own IP.

Before MEH-256, `get_remote_address` read `request.client.host` which
on Railway is the edge-proxy IP. All users shared one bucket.

The fix is env-gated and takes the RIGHTMOST X-Forwarded-For entry
(the value appended by the trusted proxy), not the leftmost (which is
whatever the client sent and is therefore spoofable).
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
    """Single-entry XFF → return that entry (trusted proxy replaced)."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "1.2.3.4"},
        client_host="10.0.0.1",
    )
    assert get_real_client_ip(req) == "1.2.3.4"


def test_takes_rightmost_when_client_spoofs_xff(monkeypatch):
    """Client sent `X-Forwarded-For: 1.1.1.1`; Railway appended real IP.
    Rightmost = the trusted value. Leftmost would be attacker-controlled."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "1.1.1.1, 9.9.9.9"},
        client_host="10.0.0.1",
    )
    assert get_real_client_ip(req) == "9.9.9.9"


def test_ignores_xff_when_untrusted(monkeypatch):
    """TRUSTED_PROXY unset → XFF is attacker-controlled, must be ignored."""
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    req = _make_request(
        headers={"x-forwarded-for": "1.2.3.4"},
        client_host="127.0.0.1",
    )
    assert get_real_client_ip(req) == "127.0.0.1"


def test_accepts_true_yes_on_as_truthy(monkeypatch):
    """UX trap: operator sets TRUSTED_PROXY=true; must behave as '1'."""
    for value in ("true", "TRUE", "True", "yes", "on", "1"):
        monkeypatch.setenv("TRUSTED_PROXY", value)
        req = _make_request(
            headers={"x-forwarded-for": "1.2.3.4"},
            client_host="127.0.0.1",
        )
        assert get_real_client_ip(req) == "1.2.3.4", f"failed for value={value!r}"


def test_handles_missing_xff(monkeypatch):
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(headers={}, client_host="10.0.0.1")
    assert get_real_client_ip(req) == "10.0.0.1"


def test_handles_malformed_xff(monkeypatch):
    """Whitespace-only / empty entries must not crash and must fall back."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "   ,   "},
        client_host="10.0.0.1",
    )
    assert get_real_client_ip(req) == "10.0.0.1"


def test_isolates_different_client_ips(monkeypatch):
    """The bug fix itself: two distinct real clients behind the same
    proxy IP must produce different keys."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    proxy_ip = "10.0.0.1"
    # Client A, real IP 1.1.1.1 → Railway appended after any client XFF
    req_a = _make_request(
        headers={"x-forwarded-for": "1.1.1.1"},
        client_host=proxy_ip,
    )
    req_b = _make_request(
        headers={"x-forwarded-for": "2.2.2.2"},
        client_host=proxy_ip,
    )
    assert get_real_client_ip(req_a) != get_real_client_ip(req_b)
    assert get_real_client_ip(req_a) == "1.1.1.1"
    assert get_real_client_ip(req_b) == "2.2.2.2"
