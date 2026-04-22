"""MEH-253 — OAuth endpoints return 503 when the provider client_id
is not configured, instead of the misleading 401 "token invalid".

Without this distinction, a user whose token verification succeeded
but whose server happened to have `GOOGLE_CLIENT_ID=` unset (dev
environment, misconfigured staging) would see "אסימון Google לא
תקין" — suggesting the user did something wrong, when really the
server can't accept Google logins at all right now.
"""
from app.config import settings


def test_google_auth_503_when_client_id_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    r = client.post("/auth/google", json={"id_token": "anything"})
    assert r.status_code == 503
    assert "Google" in r.json()["detail"]


def test_apple_auth_503_when_client_id_unset(client, monkeypatch):
    monkeypatch.setattr(settings, "apple_client_id", "")
    r = client.post("/auth/apple", json={"id_token": "anything"})
    assert r.status_code == 503
    assert "Apple" in r.json()["detail"]


def test_google_auth_401_when_client_id_set_but_token_invalid(client, monkeypatch):
    """When client_id IS configured, an invalid token still gets a 401 —
    we're only changing the unconfigured-server path."""
    monkeypatch.setattr(settings, "google_client_id", "dummy-client-id")
    r = client.post("/auth/google", json={"id_token": "not-a-real-jwt"})
    assert r.status_code == 401
