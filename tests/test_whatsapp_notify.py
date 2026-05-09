"""MEH-287 — Producer registration returns ``whatsapp_sent`` flag.

The flag is a pre-flight check: True when WhatsApp config + phone are
present (background task expected to send), False when any piece is
missing (silent fail reported as logger.error, frontend shows a
dashboard-fallback banner instead of the default WhatsApp copy).

MEH-508: SDK swapped Twilio → Meta Cloud API. Patches now target the
whatsapp_* settings; the background task's network call is stubbed via
`app.services.whatsapp.httpx.post` (hygiene — the assertion is on the
pre-flight predicate at auth.py:443-444, but mocking the post prevents
the bg task from ever attempting a real Meta Graph call during tests).
"""
from unittest.mock import MagicMock


VALID_PRODUCER_REG = {
    "email": "producer287@test.com",
    "name": "שרה ישראלית",
    "password": "SecurePass123!",
    "producer_name": "חוות MEH-287",
    "phone": "0501234567",
    "category_ids": [],
    "primary_contact_method": "whatsapp",
}


def test_whatsapp_sent_false_when_whatsapp_env_missing(client):
    """Default test config has empty WHATSAPP_* → whatsapp_sent=False."""
    resp = client.post("/auth/register/producer", json=VALID_PRODUCER_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is False


def test_whatsapp_sent_true_when_whatsapp_env_present(client, monkeypatch):
    """WHATSAPP_* configured + phone present → whatsapp_sent=True.

    Only the two WhatsApp env attributes that drive the auth.py:443-444
    pre-flight predicate are patched (monkeypatch on the real settings
    object); httpx.post is stubbed so the background task doesn't hit
    the real Meta Graph API.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "whatsapp_phone_number_id", "PNID_fake")
    monkeypatch.setattr(auth_module.settings, "whatsapp_access_token", "token_fake")
    fake_response = MagicMock(status_code=200)
    fake_response.raise_for_status = lambda: None
    monkeypatch.setattr(
        "app.services.whatsapp.httpx.post", lambda *a, **kw: fake_response
    )

    resp = client.post(
        "/auth/register/producer",
        json={**VALID_PRODUCER_REG, "email": "whatsapp-ok@test.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is True


def test_whatsapp_sent_false_when_phone_missing(client, monkeypatch):
    """Phone omitted → whatsapp_sent=False even when WhatsApp is configured.

    Registration with primary_contact_method='whatsapp' now requires phone
    (auth.py:326-330), so we switch the contact method to 'email' to reach
    the whatsapp_sent=False branch with phone genuinely absent.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "whatsapp_phone_number_id", "PNID_fake")
    monkeypatch.setattr(auth_module.settings, "whatsapp_access_token", "token_fake")
    payload = {
        **VALID_PRODUCER_REG,
        "email": "nophone@test.com",
        "primary_contact_method": "email",
        "contact_email": "nophone-contact@test.com",
    }
    payload.pop("phone", None)
    resp = client.post("/auth/register/producer", json=payload)
    assert resp.status_code == 200
    assert resp.json()["whatsapp_sent"] is False
