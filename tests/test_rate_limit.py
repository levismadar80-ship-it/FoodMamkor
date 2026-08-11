"""MEH-256 — real client IP resolution for rate-limit keying.

Resolution order (when TRUSTED_PROXY is enabled):
  1. X-Real-IP (Railway edge — unspoofable)
  2. X-Forwarded-For[-2] (defensive, when ≥2 entries)
  3. get_remote_address (TCP peer fallback)

When TRUSTED_PROXY is NOT set, headers are client-controlled and
must be ignored entirely — the test suite checks that too.
"""
from unittest.mock import MagicMock

from app.rate_limit import get_real_client_ip


def _make_request(headers=None, client_host="127.0.0.1"):
    """Minimum Request surface the key function reads."""
    req = MagicMock()
    req.headers = headers or {}
    req.client = MagicMock()
    req.client.host = client_host
    return req


# ---------- primary path: X-Real-IP ----------


def test_x_real_ip_primary(monkeypatch):
    """Railway sets X-Real-IP from its own TCP-peer view. Primary signal."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={
            "x-real-ip": "13.220.112.153",
            "x-forwarded-for": "20.161.30.192, 13.220.112.153, 167.82.233.94",
        },
        client_host="100.64.0.4",
    )
    assert get_real_client_ip(req) == "13.220.112.153"


def test_x_real_ip_wins_over_xff_even_when_xff_suggests_otherwise(monkeypatch):
    """If attacker somehow injects a different value into XFF, we still
    use X-Real-IP (Railway's edge, not client-controllable)."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={
            "x-real-ip": "9.9.9.9",  # Railway's view
            "x-forwarded-for": "1.1.1.1, 2.2.2.2, 167.82.233.1",  # spoofed
        },
        client_host="100.64.0.4",
    )
    assert get_real_client_ip(req) == "9.9.9.9"


# ---------- fallback path: XFF[-2] ----------


def test_xff_fallback_when_x_real_ip_missing(monkeypatch):
    """If Railway stops setting X-Real-IP for some reason, XFF[-2] is
    the next-best signal — rightmost is Railway's internal proxy."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "20.161.30.192, 13.220.112.153, 167.82.233.94"},
        client_host="100.64.0.4",
    )
    assert get_real_client_ip(req) == "13.220.112.153"


def test_xff_two_entries_fallback(monkeypatch):
    """Direct client → Railway (2 entries): real client is [-2] = [0]."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "3.127.65.60, 140.248.75.32"},
        client_host="100.64.0.34",
    )
    assert get_real_client_ip(req) == "3.127.65.60"


def test_xff_single_entry_not_trusted(monkeypatch):
    """A single-entry XFF is whatever the client sent — NOT the one
    Railway would have appended. Skip the XFF fallback and drop to
    get_remote_address (the proxy IP) so a spoofer can't bypass."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "1.1.1.1"},  # spoofed, no Railway append
        client_host="100.64.0.4",
    )
    assert get_real_client_ip(req) == "100.64.0.4"


def test_xff_malformed_falls_through(monkeypatch):
    """Whitespace-only or empty entries must not crash."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    req = _make_request(
        headers={"x-forwarded-for": "  ,   "},
        client_host="100.64.0.4",
    )
    assert get_real_client_ip(req) == "100.64.0.4"


# ---------- spoof prevention: env-gated ----------


def test_spoof_prevention_x_real_ip_ignored_without_trusted_proxy(monkeypatch):
    """TRUSTED_PROXY unset → the caller controls X-Real-IP (nothing
    overwrites it). Must be ignored to prevent bypass in local dev /
    directly-exposed deploys."""
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    req = _make_request(
        headers={"x-real-ip": "1.1.1.1"},
        client_host="127.0.0.1",
    )
    assert get_real_client_ip(req) == "127.0.0.1"


def test_spoof_prevention_xff_ignored_without_trusted_proxy(monkeypatch):
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    req = _make_request(
        headers={"x-forwarded-for": "1.1.1.1, 2.2.2.2"},
        client_host="127.0.0.1",
    )
    assert get_real_client_ip(req) == "127.0.0.1"


def test_no_trusted_proxy_uses_remote_address(monkeypatch):
    """Pure local-dev case — no proxy headers, no env var — must
    behave identically to the pre-MEH-256 baseline."""
    monkeypatch.delenv("TRUSTED_PROXY", raising=False)
    req = _make_request(client_host="192.168.1.5")
    assert get_real_client_ip(req) == "192.168.1.5"


# ---------- truthy env-var values ----------


def test_accepts_true_yes_on_as_truthy(monkeypatch):
    """UX trap: operator sets TRUSTED_PROXY=true; must behave as '1'."""
    for value in ("true", "TRUE", "yes", "on", "1"):
        monkeypatch.setenv("TRUSTED_PROXY", value)
        req = _make_request(
            headers={"x-real-ip": "1.2.3.4"},
            client_host="100.64.0.1",
        )
        assert get_real_client_ip(req) == "1.2.3.4", f"failed for value={value!r}"


# ---------- isolation: different clients, different keys ----------


def test_isolates_different_client_ips_via_x_real_ip(monkeypatch):
    """The core bug fix — two real users must end up in different
    rate-limit buckets even when the same Railway pod serves them."""
    monkeypatch.setenv("TRUSTED_PROXY", "1")
    proxy_ip = "100.64.0.4"
    req_a = _make_request(
        headers={"x-real-ip": "1.1.1.1"},
        client_host=proxy_ip,
    )
    req_b = _make_request(
        headers={"x-real-ip": "2.2.2.2"},
        client_host=proxy_ip,
    )
    assert get_real_client_ip(req_a) == "1.1.1.1"
    assert get_real_client_ip(req_b) == "2.2.2.2"
    assert get_real_client_ip(req_a) != get_real_client_ip(req_b)
