"""MEH-287 → MEH-328 — Producer registration ``whatsapp_sent`` flag.

Originally (MEH-287): both upgrade and non-upgrade producer-signup paths
returned ``whatsapp_sent`` so the frontend could show a dashboard-fallback
banner when WhatsApp env config was missing.

MEH-328 Chunk B (OWASP anti-enumeration): the non-upgrade path now returns
an identical RegisterAck across new-email / collision branches. Exposing
``whatsapp_sent`` on the non-upgrade response would defeat anti-enum, so
the flag is removed from that path. The upgrade path is authenticated
(no enumeration risk) and still emits ``whatsapp_sent``. These tests now
exercise the upgrade path — the same MEH-287 pre-flight predicate is in
play, just on a different call site.

MEH-508: SDK swapped Twilio → Meta Cloud API. Patches target the
whatsapp_* settings; ``app.services.whatsapp.httpx.post`` is stubbed so
the background task never attempts a real Meta Graph call during tests.
"""
from unittest.mock import MagicMock

from tests.conftest import auth_header, make_user


VALID_PRODUCER_UPGRADE_REG = {
    # Upgrade path ignores email/name/password from the body — it uses the
    # authenticated user's identity. Only producer fields are required.
    "producer_name": "חוות MEH-287",
    "phone": "0501234567",
    "category_ids": [],
    "primary_contact_method": "whatsapp",
    "declaration_accepted": True,  # MEH-759: mandatory binding declaration
}


def test_whatsapp_sent_false_when_whatsapp_env_missing(client, db):
    """Default test config has empty WHATSAPP_* → whatsapp_sent=False."""
    user = make_user(db, email="upgrade287a@test.com")
    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is False


def test_whatsapp_sent_true_when_whatsapp_env_present(client, db, monkeypatch):
    """WHATSAPP_* configured + phone present → whatsapp_sent=True.

    Only the two WhatsApp env attributes that drive the upgrade-path
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
    user = make_user(db, email="upgrade287b@test.com")
    resp = client.post(
        "/auth/register/producer",
        json=VALID_PRODUCER_UPGRADE_REG,
        headers=auth_header(user),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["whatsapp_sent"] is True


def test_whatsapp_sent_false_when_phone_missing(client, db, monkeypatch):
    """Phone omitted → whatsapp_sent=False even when WhatsApp is configured.

    Registration with primary_contact_method='whatsapp' requires phone
    (handler 422 guard), so we switch the contact method to 'email' to reach
    the whatsapp_sent=False branch with phone genuinely absent.
    """
    from app.routers import auth as auth_module
    monkeypatch.setattr(auth_module.settings, "whatsapp_phone_number_id", "PNID_fake")
    monkeypatch.setattr(auth_module.settings, "whatsapp_access_token", "token_fake")
    user = make_user(db, email="upgrade287c@test.com")
    payload = {
        **VALID_PRODUCER_UPGRADE_REG,
        "primary_contact_method": "email",
        "contact_email": "nophone-contact@test.com",
    }
    payload.pop("phone", None)
    resp = client.post(
        "/auth/register/producer",
        json=payload,
        headers=auth_header(user),
    )
    assert resp.status_code == 200
    assert resp.json()["whatsapp_sent"] is False
