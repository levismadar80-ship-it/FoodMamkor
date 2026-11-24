"""MEH-3690 — POST /auth/google/code: our own Google button sends the one-time
authorization code from Google's popup (GIS code client, redirect_uri
"postmessage"); the server swaps it at Google for an ID token, verifies that
token exactly as /auth/google does, and returns it. Every existing consumer
(/auth/google, /auth/register/producer/oauth, owner-invite, account delete)
then receives the same Google-signed ID token it receives today.

What is real: the route, the exchange helper and verify_google_token. Only
Google is faked: httpx.post (the token endpoint) and google-auth's
verify_oauth2_token (the signature/aud check), so the refusal paths run through
our own code.
"""
import pytest

from app.config import settings

ROUTE = "/auth/google/code"
CLIENT_ID = "ours.apps.googleusercontent.com"
SECRET = "test-secret-not-real"


class _Resp:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", SECRET)


@pytest.fixture
def google(monkeypatch):
    """Fake Google: records the token request, answers with `state`."""
    state = {
        "status": 200,
        "payload": {"id_token": "signed.id.token", "access_token": "at"},
        "claims": {"sub": "123", "email": "a@example.com", "email_verified": True, "aud": CLIENT_ID},
        "verify_error": None,
        "calls": [],
    }

    def fake_post(url, data=None, timeout=None, **kw):
        state["calls"].append({"url": url, "data": data, "timeout": timeout})
        return _Resp(state["status"], state["payload"])

    def fake_verify(token, request, audience):
        state["verified"] = {"token": token, "audience": audience}
        if state["verify_error"]:
            raise state["verify_error"]
        return state["claims"]

    import httpx
    from google.oauth2 import id_token as google_id_token

    monkeypatch.setattr(httpx, "post", fake_post)
    monkeypatch.setattr(google_id_token, "verify_oauth2_token", fake_verify)
    return state


def test_returns_the_verified_id_token(client, configured, google):
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 200, r.text
    assert r.json() == {"id_token": "signed.id.token"}
    sent = google["calls"][0]
    assert sent["url"] == "https://oauth2.googleapis.com/token"
    assert sent["data"] == {
        "code": "4/0Abc",
        "client_id": CLIENT_ID,
        "client_secret": SECRET,
        "redirect_uri": "postmessage",
        "grant_type": "authorization_code",
    }
    assert sent["timeout"] is not None
    # The token is checked against OUR client id, as /auth/google checks it.
    assert google["verified"] == {"token": "signed.id.token", "audience": CLIENT_ID}


def test_the_secret_never_reaches_the_response(client, configured, google):
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert SECRET not in r.text
    assert "access_token" not in r.json()


def test_503_without_the_secret(client, monkeypatch, google):
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", "")
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 503
    assert "Google" in r.json()["detail"]
    assert google["calls"] == []


def test_503_without_the_client_id(client, monkeypatch, google):
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(settings, "google_client_secret", SECRET)
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 503
    assert google["calls"] == []


def test_401_when_google_refuses_the_code(client, configured, google):
    google["status"] = 400
    google["payload"] = {"error": "invalid_grant"}
    r = client.post(ROUTE, json={"code": "used-or-forged"})
    assert r.status_code == 401
    assert "Google" in r.json()["detail"]


def test_401_when_google_answers_without_an_id_token(client, configured, google):
    google["payload"] = {"access_token": "at"}  # scope without openid
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 401


def test_401_when_the_token_was_issued_to_another_app(client, configured, google):
    google["verify_error"] = ValueError("Token has wrong audience other.apps.googleusercontent.com")
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 401
    assert "id_token" not in r.json()


def test_401_when_the_email_is_not_verified(client, configured, google):
    google["claims"] = {**google["claims"], "email_verified": False}
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 401
    assert "id_token" not in r.json()


def test_502_when_google_cannot_be_reached(client, configured, monkeypatch):
    import httpx

    def boom(*a, **kw):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(httpx, "post", boom)
    r = client.post(ROUTE, json={"code": "4/0Abc"})
    assert r.status_code == 502
    assert "Google" in r.json()["detail"]


@pytest.mark.parametrize("code", ["", "x" * 2049])
def test_422_for_an_empty_or_oversized_code(client, configured, google, code):
    r = client.post(ROUTE, json={"code": code})
    assert r.status_code == 422
    assert google["calls"] == []
