"""MEH-287 — Producer registration returns ``whatsapp_sent`` flag.

The flag is a pre-flight check: True when Twilio config + phone are
present (background task expected to send), False when any piece is
missing (silent fail reported as logger.error, frontend shows a
dashboard-fallback banner instead of the default WhatsApp copy).
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


def test_whatsapp_sent_false_when_twilio_env_missing(client):
    """Default test config has empty TWILIO_* → whatsapp_sent=False."""
    resp = client.post("/auth/register/producer", json=VALID_PRODUCER_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is False


def test_whatsapp_sent_true_when_twilio_env_present(client, monkeypatch):
    """TWILIO_* configured + phone present → whatsapp_sent=True.

    Only the three Twilio env attributes are patched (monkeypatch on
    the real settings object); the twilio.rest.Client is stubbed so
    the background task doesn't hit the real API.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "twilio_account_sid", "AC_fake")
    monkeypatch.setattr(auth_module.settings, "twilio_auth_token", "token_fake")
    monkeypatch.setattr(
        auth_module.settings, "twilio_whatsapp_from", "whatsapp:+14155238886"
    )
    fake_client = MagicMock()
    fake_client.return_value.messages.create.return_value = None
    monkeypatch.setattr("twilio.rest.Client", fake_client)

    resp = client.post(
        "/auth/register/producer",
        json={**VALID_PRODUCER_REG, "email": "twilio-ok@test.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is True


def test_whatsapp_sent_false_when_phone_missing(client, monkeypatch):
    """Phone omitted → whatsapp_sent=False even when Twilio is configured.

    Registration with primary_contact_method='whatsapp' now requires phone
    (auth.py:326-330), so we switch the contact method to 'email' to reach
    the whatsapp_sent=False branch with phone genuinely absent.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "twilio_account_sid", "AC_fake")
    monkeypatch.setattr(auth_module.settings, "twilio_auth_token", "token_fake")
    monkeypatch.setattr(
        auth_module.settings, "twilio_whatsapp_from", "whatsapp:+14155238886"
    )
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
