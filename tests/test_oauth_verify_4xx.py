"""MEH-786 — OAuth verify endpoints return a 4xx (never 503) on an invalid
id_token when the provider IS configured.

Pins the FUZZ-002/003/004 findings (docs/audits/2026-06-night-batch-5.md,
schemathesis run #1031): POST /auth/google, /auth/apple and
/auth/register/producer/oauth all reported 503.

Root cause (read-only diagnosis, MEH-786): the fuzz environment leaves
GOOGLE_CLIENT_ID / APPLE_CLIENT_ID unset, so every request hit the MEH-253
"provider not configured" 503 branch (backend/app/routers/auth.py:704, 812,
820, 1029) *before* the token was ever validated. On a configured server the
same invalid token is correctly rejected with 401 — never 5xx.

These tests lock in the configured-server contract (rejected token -> 401).
The deliberate unconfigured-server 503 (MEH-253) stays asserted, untouched, in
tests/test_oauth_unconfigured.py. The verifiers are stubbed to None here so the
assertion is deterministic and network-free (no live Google/Apple call).
"""
import app.routers.auth as auth_router
from app.config import settings


def _reject_token(_id_token):
    """Simulate a verifier rejecting the token (its fail-open None path)."""
    return None


def test_fuzz002_google_verify_returns_401_not_503(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "dummy-client-id")
    monkeypatch.setattr(auth_router, "_verify_google_token", _reject_token)
    r = client.post("/auth/google", json={"id_token": "not-a-real-jwt"})
    assert r.status_code == 401, r.text
    assert r.status_code != 503


def test_fuzz003_apple_verify_returns_401_not_503(client, monkeypatch):
    monkeypatch.setattr(settings, "apple_client_id", "dummy-client-id")
    monkeypatch.setattr(auth_router, "_verify_apple_token", _reject_token)
    r = client.post("/auth/apple", json={"id_token": "not-a-real-jwt"})
    assert r.status_code == 401, r.text
    assert r.status_code != 503


def test_fuzz004_producer_oauth_verify_returns_401_not_503(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "dummy-client-id")
    monkeypatch.setattr(auth_router, "_verify_google_token", _reject_token)
    r = client.post(
        "/auth/register/producer/oauth",
        json={"provider": "google", "id_token": "not-a-real-jwt"},
    )
    assert r.status_code == 401, r.text
    assert r.status_code != 503
