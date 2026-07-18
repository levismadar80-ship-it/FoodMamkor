"""MEH-1339 — WhatsApp "הסר" opt-out keyword handling on the inbound webhook.

A customer who replies "הסר" (or a full-message synonym) to a favorite alert
has whatsapp_opt_in turned off automatically — across every business she saved
and every account sharing her phone — instead of blocking the number (which
hurts the business account's quality rating).

Covers both the canonical-phone helper (app/utils/phone.py) and the webhook
flow: the inbound row is always persisted first (fail-open), the keyword must
be a full-message match (not a substring), an uncanonicalizable / unknown phone
is a silent no-op, and an error in the opt-out path never breaks the webhook.
"""
from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from conftest import make_producer, make_user

from app.models import FavoriteAlert, InboundMessage
from app.utils.phone import canonical_il_msisdn

FAKE_APP_SECRET = "meh1339-test-secret-not-for-prod"
FAKE_VERIFY_TOKEN = "meh1339-test-verify-token"
CONFIRMATION = "העדכונים בוואטסאפ הופסקו. אפשר להפעיל אותם מחדש בעמוד המועדפים באתר."


# ============================================================
# canonical_il_msisdn unit tests
# ============================================================


@pytest.mark.parametrize(
    "raw",
    ["+972501234567", "972501234567", "0501234567", "050-123-4567", "  050 123 4567 "],
)
def test_canonical_collapses_all_il_notations(raw):
    assert canonical_il_msisdn(raw) == "972501234567"


@pytest.mark.parametrize(
    "raw",
    ["", None, "abc", "12345", "025551234", "+15551234567", "97250123456789"],
)
def test_canonical_returns_none_for_uncanonicalizable(raw):
    assert canonical_il_msisdn(raw) is None


# ============================================================
# webhook opt-out flow
# ============================================================


@pytest.fixture
def webhook_settings(monkeypatch):
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(
        whatsapp_webhook.settings, "whatsapp_app_secret", FAKE_APP_SECRET
    )
    monkeypatch.setattr(
        whatsapp_webhook.settings, "whatsapp_verify_token", FAKE_VERIFY_TOKEN
    )
    return whatsapp_webhook.settings


@pytest.fixture
def captured_send_text(monkeypatch):
    """Capture the in-window confirmation instead of hitting Meta."""
    calls = []
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(
        whatsapp_webhook, "send_text", lambda to, body: calls.append((to, body)) or True
    )
    return calls


def _sign(body_bytes: bytes) -> str:
    return "sha256=" + hmac.new(
        FAKE_APP_SECRET.encode("utf-8"), body_bytes, hashlib.sha256
    ).hexdigest()


def _payload(*, from_phone: str, body: str, message_id: str) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WBA",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {"phone_number_id": "PNID"},
                            "messages": [
                                {
                                    "from": from_phone,
                                    "id": message_id,
                                    "timestamp": "1716381000",
                                    "type": "text",
                                    "text": {"body": body},
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }


def _post(client, *, from_phone, body, message_id):
    raw = json.dumps(_payload(from_phone=from_phone, body=body, message_id=message_id))
    body_bytes = raw.encode("utf-8")
    return client.post(
        "/webhook/whatsapp",
        content=body_bytes,
        headers={"X-Hub-Signature-256": _sign(body_bytes)},
    )


def _alert(db, user, producer, opted_in=True):
    a = FavoriteAlert(
        user_id=user.id, producer_id=producer.id, whatsapp_opt_in=opted_in
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


def _optin(db, alert_id):
    db.expire_all()
    return db.query(FavoriteAlert).filter(FavoriteAlert.id == alert_id).first().whatsapp_opt_in


class TestWhatsAppOptOut:
    def test_keyword_disables_all_alerts_for_all_users_sharing_phone(
        self, client, db, webhook_settings, captured_send_text
    ):
        producer_a = make_producer(db, name="Farm A")
        producer_b = make_producer(db, name="Farm B")
        # Two users share the SAME physical phone (stored in different formats).
        u1 = make_user(db, email="u1@example.com")
        u1.phone = "0501234567"
        u2 = make_user(db, email="u2@example.com")
        u2.phone = "+972-50-123-4567"
        db.commit()
        a1 = _alert(db, u1, producer_a)
        a2 = _alert(db, u1, producer_b)
        a3 = _alert(db, u2, producer_a)

        # Meta delivers the sender as international-without-plus.
        resp = _post(client, from_phone="972501234567", body="הסר", message_id="wamid.opt1")
        assert resp.status_code == 200

        assert _optin(db, a1.id) is False
        assert _optin(db, a2.id) is False
        assert _optin(db, a3.id) is False
        # Confirmation sent once to the sender.
        assert captured_send_text == [("972501234567", CONFIRMATION)]
        # inbound row persisted even on the opt-out path.
        assert db.query(InboundMessage).filter(
            InboundMessage.meta_message_id == "wamid.opt1"
        ).first() is not None

    @pytest.mark.parametrize("kw", ["הסרה", "עצור", "STOP", "  unsubscribe  "])
    def test_keyword_synonyms_and_case_and_trim(
        self, client, db, webhook_settings, captured_send_text, kw
    ):
        producer = make_producer(db, name="Farm KW")
        user = make_user(db, email="kw@example.com")
        user.phone = "0509998877"
        db.commit()
        a = _alert(db, user, producer)

        resp = _post(client, from_phone="972509998877", body=kw, message_id=f"wamid.{kw.strip()}")
        assert resp.status_code == 200
        assert _optin(db, a.id) is False
        assert len(captured_send_text) == 1

    def test_substring_does_not_trigger_optout(
        self, client, db, webhook_settings, captured_send_text
    ):
        producer = make_producer(db, name="Farm Sub")
        user = make_user(db, email="sub@example.com")
        user.phone = "0501112233"
        db.commit()
        a = _alert(db, user, producer)

        # "הסר" appears as a substring but the message is not a bare keyword.
        resp = _post(
            client, from_phone="972501112233",
            body="אל תסיר אותי בבקשה", message_id="wamid.sub1",
        )
        assert resp.status_code == 200
        assert _optin(db, a.id) is True  # unchanged
        assert captured_send_text == []
        # inbound still written.
        assert db.query(InboundMessage).filter(
            InboundMessage.meta_message_id == "wamid.sub1"
        ).first() is not None

    def test_unknown_phone_is_silent_noop(
        self, client, db, webhook_settings, captured_send_text
    ):
        # No user has this phone.
        resp = _post(client, from_phone="972500000000", body="הסר", message_id="wamid.unk1")
        assert resp.status_code == 200
        assert captured_send_text == []
        assert db.query(InboundMessage).filter(
            InboundMessage.meta_message_id == "wamid.unk1"
        ).first() is not None

    def test_uncanonicalizable_phone_is_noop(
        self, client, db, webhook_settings, captured_send_text
    ):
        resp = _post(client, from_phone="12345", body="הסר", message_id="wamid.bad1")
        assert resp.status_code == 200
        assert captured_send_text == []

    def test_optout_error_does_not_break_webhook(
        self, client, db, webhook_settings, monkeypatch
    ):
        # Force the opt-out path to blow up; the webhook must still 200 and the
        # inbound row must still persist (fail-open).
        producer = make_producer(db, name="Farm Err")
        user = make_user(db, email="err@example.com")
        user.phone = "0507776655"
        db.commit()
        _alert(db, user, producer)

        from app.routers import whatsapp_webhook

        def boom(*a, **k):
            raise RuntimeError("boom")

        monkeypatch.setattr(whatsapp_webhook, "canonical_il_msisdn", boom)

        resp = _post(client, from_phone="972507776655", body="הסר", message_id="wamid.err1")
        assert resp.status_code == 200
        assert db.query(InboundMessage).filter(
            InboundMessage.meta_message_id == "wamid.err1"
        ).first() is not None
