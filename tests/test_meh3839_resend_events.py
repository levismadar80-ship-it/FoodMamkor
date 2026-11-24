"""MEH-3839 — Resend delivery events: the webhook, the stored row, the tag.

What a business owner loses when her address bounces is an order she never
hears about. These tests hold the three pieces that make that visible:
every email carries a `kind` tag, Resend's signed webhook is the only way a
row gets in, and the row keeps no full address.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
import uuid
from datetime import timedelta

import pytest

import app.services.email as email_module
from app.config import settings
from app.models.email_events import EMAIL_EVENT_TYPES, EmailEvent
from app.services import retention_purge
from app.utils.clock import utc_now
from conftest import make_user

SECRET_BYTES = b"meh-3839-test-signing-secret-32b"
SECRET = "whsec_" + base64.b64encode(SECRET_BYTES).decode()
PATH = "/webhook/resend"


@pytest.fixture
def secret(monkeypatch):
    monkeypatch.setattr(settings, "resend_webhook_secret", SECRET)
    return SECRET


def _event(event_type="email.bounced", to="owner@farm.example.co.il", **data):
    payload = {
        "type": event_type,
        "created_at": "2026-11-24T10:00:00.000Z",
        "data": {
            "created_at": "2026-11-24T09:59:00.000Z",
            "email_id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c",
            "from": "noreply@mehamakor.co.il",
            "to": [to],
            "subject": "הזמנה חדשה מחכה לאישור",
            "tags": {"kind": "order_new"},
            **data,
        },
    }
    return json.dumps(payload, ensure_ascii=False)


def _headers(body: str, *, msg_id=None, ts=None, key=SECRET_BYTES):
    msg_id = msg_id or f"msg_{uuid.uuid4().hex}"
    ts = str(int(time.time()) if ts is None else ts)
    signed = f"{msg_id}.{ts}.{body}".encode()
    sig = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return {
        "svix-id": msg_id,
        "svix-timestamp": ts,
        "svix-signature": f"v1,{sig}",
        "content-type": "application/json",
    }


def _post(client, body, **kw):
    return client.post(PATH, content=body.encode(), headers=_headers(body, **kw))


def _rows(db):
    db.expire_all()
    return db.query(EmailEvent).all()


# --- the webhook -------------------------------------------------------------


def test_a_signed_bounce_is_stored_against_the_owner(client, db, secret):
    owner = make_user(db, email="Owner@Farm.example.co.il", role="producer")
    body = _event(bounce={"type": "Permanent", "subType": "General", "message": "x"})

    r = _post(client, body)

    assert r.status_code == 200
    [row] = _rows(db)
    assert row.event_type == "email.bounced"
    assert row.kind == "order_new"
    assert row.user_id == owner.id  # matched case-insensitively
    assert row.recipient_domain == "farm.example.co.il"
    assert row.detail == "Permanent/General"
    assert row.resend_email_id == "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"


def test_the_row_keeps_no_full_address(client, db, secret):
    _post(client, _event("email.complained"))
    [row] = _rows(db)
    stored = [str(getattr(row, c.name)) for c in EmailEvent.__table__.columns]
    assert not any("@" in v for v in stored)


def test_a_wrong_signature_is_refused_and_stores_nothing(client, db, secret):
    body = _event()
    r = client.post(
        PATH, content=body.encode(), headers=_headers(body, key=b"not-the-secret")
    )
    assert r.status_code == 401
    assert _rows(db) == []


def test_a_replayed_old_delivery_is_refused(client, db, secret):
    r = _post(client, _event(), ts=int(time.time()) - 3600)
    assert r.status_code == 401
    assert _rows(db) == []


def test_the_same_delivery_twice_is_stored_once(client, db, secret):
    body = _event("email.delivered")
    headers = _headers(body)
    first = client.post(PATH, content=body.encode(), headers=headers)
    second = client.post(PATH, content=body.encode(), headers=headers)
    assert (first.status_code, second.status_code) == (200, 200)
    assert len(_rows(db)) == 1


def test_without_a_secret_the_webhook_is_off(client, db, monkeypatch):
    monkeypatch.setattr(settings, "resend_webhook_secret", "")
    r = _post(client, _event())
    assert r.status_code == 503
    assert _rows(db) == []


@pytest.mark.parametrize("event_type", ["email.sent", "email.opened", "contact.created"])
def test_events_we_do_not_count_are_acknowledged_not_stored(
    client, db, secret, event_type
):
    r = _post(client, _event(event_type))
    assert r.status_code == 200
    assert _rows(db) == []


def test_every_stored_type_is_one_resend_sends():
    # The allow-list is ours; a typo in it would silently drop a whole type.
    from resend.webhooks._webhook import WebhookEvent  # noqa: PLC0415
    from typing import get_args  # noqa: PLC0415

    assert set(EMAIL_EVENT_TYPES) <= set(get_args(WebhookEvent))


def test_an_untagged_email_is_stored_as_other(client, db, secret):
    payload = json.loads(_event("email.clicked", click={"link": "https://x"}))
    del payload["data"]["tags"]
    _post(client, json.dumps(payload))
    [row] = _rows(db)
    assert row.kind == "other"
    assert row.user_id is None  # no such user


# --- the tag on the way out --------------------------------------------------


@pytest.fixture
def sent(monkeypatch):
    calls = []
    monkeypatch.setattr(settings, "resend_api_key", "re_test")
    monkeypatch.setattr(
        email_module, "_route_outside_production", lambda *a: a
    )

    class _Emails:
        @staticmethod
        def send(params):
            calls.append(params)
            return {"id": "x"}

    class _Resend:
        Emails = _Emails

    monkeypatch.setattr(email_module, "configure_resend", lambda key: _Resend)
    return calls


def test_send_email_tags_the_kind(sent):
    email_module.send_email("a@farm.co.il", "s", "b", kind="weekly_summary")
    assert sent[0]["tags"] == [{"name": "kind", "value": "weekly_summary"}]


@pytest.mark.parametrize("bad", ["", "Weekly Summary", "שבועי", "x" * 41])
def test_a_kind_resend_would_reject_goes_out_as_other(sent, bad):
    email_module.send_email("a@farm.co.il", "s", "b", kind=bad)
    assert sent[0]["tags"] == [{"name": "kind", "value": "other"}]


def test_a_caller_without_a_kind_is_tagged_other(sent):
    email_module.send_email("a@farm.co.il", "s", "b")
    assert sent[0]["tags"] == [{"name": "kind", "value": "other"}]


# --- retention ----------------------------------------------------------------


def test_the_purge_drops_events_older_than_30_days(db):
    old = EmailEvent(
        svix_id="msg_old",
        event_type="email.delivered",
        kind="other",
        recipient_domain="x.co.il",
        created_at=utc_now() - timedelta(days=31),
    )
    fresh = EmailEvent(
        svix_id="msg_fresh",
        event_type="email.delivered",
        kind="other",
        recipient_domain="x.co.il",
        created_at=utc_now() - timedelta(days=29),
    )
    db.add_all([old, fresh])
    db.commit()

    retention_purge.run_purge(db)

    assert [r.svix_id for r in _rows(db)] == ["msg_fresh"]
