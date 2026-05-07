"""MEH-301 — Registration endpoints return ``email_sent`` flag.

Mirrors test_whatsapp_notify.py (MEH-287 pattern): the flag is a
pre-flight check — True when RESEND_API_KEY is set (background task
expected to attempt send), False when missing (silent-fail logged as
logger.error, frontend may show a diagnostic banner).
"""
from unittest.mock import MagicMock


VALID_CONSUMER_REG = {
    "email": "consumer301@test.com",
    "name": "שרה ישראלית",
    "password": "SecurePass123!",
}


def test_email_sent_false_when_resend_key_missing(client):
    """Default test config has empty RESEND_API_KEY → email_sent=False."""
    resp = client.post("/auth/register", json=VALID_CONSUMER_REG)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["email_sent"] is False


def test_email_sent_true_when_resend_key_present(client, monkeypatch):
    """RESEND_API_KEY configured → email_sent=True.

    resend.Emails.send is stubbed so the background task doesn't hit
    the real API. The resend module is lazy-imported inside send_email,
    so we patch it at the module level after forcing the import.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "resend_api_key", "re_fake_key")

    import resend as resend_mod
    fake_send = MagicMock(return_value={"id": "fake-id"})
    monkeypatch.setattr(resend_mod.Emails, "send", fake_send)

    resp = client.post(
        "/auth/register",
        json={**VALID_CONSUMER_REG, "email": "resend-ok@test.com"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["email_sent"] is True


def test_email_sent_false_when_resend_key_missing_for_welcome(client, monkeypatch):
    """Missing RESEND_API_KEY → email_sent=False even though password reg succeeds."""
    from app.routers import auth as auth_module
    # Explicitly ensure key is absent (belt-and-suspenders for test isolation).
    monkeypatch.setattr(auth_module.settings, "resend_api_key", "")

    resp = client.post(
        "/auth/register",
        json={**VALID_CONSUMER_REG, "email": "nokey@test.com"},
    )
    assert resp.status_code == 200
    assert resp.json()["email_sent"] is False
