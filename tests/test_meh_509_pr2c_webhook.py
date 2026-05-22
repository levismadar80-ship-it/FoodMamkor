"""MEH-509 PR2c — WhatsApp webhook receiver (GET challenge + POST + HMAC).

Security boundary tests: the X-Hub-Signature-256 HMAC is the only thing
standing between the open internet and writes to `inbound_messages`.
Every POST path must verify (a) signature is required, (b) signature is
constant-time-compared, (c) an empty `whatsapp_app_secret` is treated as
"no security configured → reject", (d) replays are absorbed by the
UNIQUE(meta_message_id) constraint, not by a pre-check SELECT.

Mocking pattern: monkeypatch the runtime `settings` object inline
(matches PR1/PR2a/PR2b convention in tests/test_whatsapp_notify.py:57-63
and tests/test_meh_509_pr1_hooks.py).
"""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest

from app.models import InboundMessage


FAKE_APP_SECRET = "meh509-pr2c-test-secret-not-for-prod"
FAKE_VERIFY_TOKEN = "meh509-pr2c-test-verify-token"


@pytest.fixture
def webhook_settings(monkeypatch):
    """Install the test signing+verify secrets on the live Settings."""
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(
        whatsapp_webhook.settings, "whatsapp_app_secret", FAKE_APP_SECRET
    )
    monkeypatch.setattr(
        whatsapp_webhook.settings, "whatsapp_verify_token", FAKE_VERIFY_TOKEN
    )
    return whatsapp_webhook.settings


def _sign(body_bytes: bytes, secret: str = FAKE_APP_SECRET) -> str:
    return (
        "sha256="
        + hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    )


def _build_text_payload(
    *,
    message_id: str = "wamid.HBgLNzIxXXXX_test01",
    from_phone: str = "972501234567",
    body: str = "היי, אפשר להזמין?",
    timestamp: str = "1716381000",
) -> dict:
    return {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WBA_ACCOUNT_ID",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "972552553744",
                                "phone_number_id": "PHONE_NUMBER_ID",
                            },
                            "messages": [
                                {
                                    "from": from_phone,
                                    "id": message_id,
                                    "timestamp": timestamp,
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


# ---- GET challenge ---------------------------------------------------------


def test_get_challenge_valid_token_returns_challenge(client, webhook_settings):
    resp = client.get(
        "/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": FAKE_VERIFY_TOKEN,
            "hub.challenge": "1234567890",
        },
    )
    assert resp.status_code == 200
    assert resp.text == "1234567890"


def test_get_challenge_invalid_token_returns_403(client, webhook_settings):
    resp = client.get(
        "/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong-token",
            "hub.challenge": "abc",
        },
    )
    assert resp.status_code == 403


def test_get_challenge_missing_token_returns_403(client, webhook_settings):
    resp = client.get(
        "/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.challenge": "abc",
        },
    )
    assert resp.status_code == 403


def test_get_challenge_empty_settings_token_fails_closed(client, monkeypatch):
    # Default settings have whatsapp_verify_token="" — no challenge passes.
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(whatsapp_webhook.settings, "whatsapp_verify_token", "")
    resp = client.get(
        "/webhook/whatsapp",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "",  # matches "" but we still want 403
            "hub.challenge": "abc",
        },
    )
    assert resp.status_code == 403


def test_get_challenge_wrong_mode_returns_403(client, webhook_settings):
    """`hub.mode` must literally be 'subscribe' — anything else is rejected
    even with a valid token (Meta only sends 'subscribe' on registration)."""
    resp = client.get(
        "/webhook/whatsapp",
        params={
            "hub.mode": "unsubscribe",
            "hub.verify_token": FAKE_VERIFY_TOKEN,
            "hub.challenge": "abc",
        },
    )
    assert resp.status_code == 403


# ---- POST happy path -------------------------------------------------------


def test_post_valid_signature_persists_message(client, db, webhook_settings):
    payload = _build_text_payload(
        message_id="wamid.test_valid_001",
        from_phone="972501112222",
        body="אפשר להזמין כיכר לחם?",
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}

    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    row = (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.test_valid_001")
        .one()
    )
    assert row.from_phone == "972501112222"
    assert row.body == "אפשר להזמין כיכר לחם?"
    assert row.bot_replied is False
    assert row.human_replied is False
    # Meta timestamp 1716381000 → 2024-05-22 13:50:00 UTC (naive on column)
    assert row.received_at is not None


# ---- POST failure paths ----------------------------------------------------


def test_post_invalid_signature_returns_403_persists_nothing(
    client, db, webhook_settings
):
    payload = _build_text_payload(message_id="wamid.must_not_persist")
    body_bytes = json.dumps(payload).encode("utf-8")
    # Sign with the WRONG secret so HMAC mismatches.
    headers = {"X-Hub-Signature-256": _sign(body_bytes, secret="attacker-guess")}

    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 403
    persisted = (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.must_not_persist")
        .count()
    )
    assert persisted == 0


def test_post_missing_signature_returns_403(client, db, webhook_settings):
    payload = _build_text_payload(message_id="wamid.no_sig_header")
    body_bytes = json.dumps(payload).encode("utf-8")

    # No X-Hub-Signature-256 header at all.
    resp = client.post("/webhook/whatsapp", content=body_bytes)

    assert resp.status_code == 403
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.no_sig_header")
        .count()
        == 0
    )


def test_post_malformed_signature_prefix_returns_403(client, db, webhook_settings):
    """Old SHA-1 prefix `sha1=` must be rejected — we never accept it."""
    payload = _build_text_payload(message_id="wamid.sha1_attempt")
    body_bytes = json.dumps(payload).encode("utf-8")
    sha1_sig = (
        "sha1="
        + hmac.new(FAKE_APP_SECRET.encode("utf-8"), body_bytes, hashlib.sha1).hexdigest()
    )
    resp = client.post(
        "/webhook/whatsapp",
        content=body_bytes,
        headers={"X-Hub-Signature-256": sha1_sig},
    )
    assert resp.status_code == 403


def test_post_empty_secret_fails_closed(client, db, monkeypatch):
    """Empty `whatsapp_app_secret` → all POST signatures rejected, even
    a signature computed with the empty key (which would otherwise be
    deterministically forgeable by anyone)."""
    from app.routers import whatsapp_webhook

    monkeypatch.setattr(whatsapp_webhook.settings, "whatsapp_app_secret", "")

    payload = _build_text_payload(message_id="wamid.empty_secret")
    body_bytes = json.dumps(payload).encode("utf-8")
    # Sign with an empty key — this is the value the handler WOULD compute
    # if it didn't fail-closed. We want 403 anyway.
    sig = (
        "sha256="
        + hmac.new(b"", body_bytes, hashlib.sha256).hexdigest()
    )
    resp = client.post(
        "/webhook/whatsapp",
        content=body_bytes,
        headers={"X-Hub-Signature-256": sig},
    )
    assert resp.status_code == 403
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.empty_secret")
        .count()
        == 0
    )


# ---- Idempotency / replay --------------------------------------------------


def test_post_duplicate_meta_message_id_returns_200_no_double_insert(
    client, db, webhook_settings
):
    payload = _build_text_payload(message_id="wamid.duplicate_test")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}

    r1 = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    r2 = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert r1.status_code == 200
    assert r2.status_code == 200
    # Exactly one row despite two valid POSTs with the same meta_message_id.
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.duplicate_test")
        .count()
        == 1
    )


# ---- Non-text + unknown shapes --------------------------------------------


def test_post_non_text_message_persists_with_placeholder(client, db, webhook_settings):
    payload = _build_text_payload(message_id="wamid.image_test")
    # Replace the text message with an image message.
    msg = payload["entry"][0]["changes"][0]["value"]["messages"][0]
    msg.pop("text", None)
    msg["type"] = "image"
    msg["image"] = {
        "id": "MEDIA_ID_xyz",
        "mime_type": "image/jpeg",
        "sha256": "deadbeef",
    }

    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    row = (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.image_test")
        .one()
    )
    assert row.body == "[image]"


def test_post_unknown_event_shape_returns_200(client, db, webhook_settings):
    """Payload with valid signature but no `entry` array — return 200 so
    Meta does not retry, but log + persist nothing."""
    payload = {"object": "page", "unexpected": "structure"}
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    assert db.query(InboundMessage).count() == 0


def test_post_malformed_entry_shape_returns_200_logs_warning(
    client, db, webhook_settings, caplog
):
    """MEH-509 PR2c hardening — if a valid-signature POST ever carries a
    malformed `entry` (Meta change OR an attacker-with-the-secret), the
    isinstance() guards in `_process_entries` must skip that level and
    log a warning rather than 500. Webhook stays at 200 so Meta does not
    enter retry storm; no rows persisted because the walker bails before
    reaching `_persist_message`."""
    import logging

    payload = {"object": "whatsapp_business_account", "entry": "not_a_list"}
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}

    with caplog.at_level(logging.WARNING, logger="app.routers.whatsapp_webhook"):
        resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    assert db.query(InboundMessage).count() == 0
    # Warning logged about the malformed shape (PII-safe — type name only,
    # never the bad value itself).
    relevant = [
        r
        for r in caplog.records
        if r.levelno == logging.WARNING and "entry not a list" in r.getMessage()
    ]
    assert relevant, f"expected entry-not-a-list warning, got: {[r.getMessage() for r in caplog.records]}"
    # The log line carries the type name but not the raw value (PII guard).
    msg = relevant[0].getMessage()
    assert "str" in msg
    assert "not_a_list" not in msg


def test_post_oversized_content_length_returns_413(client, db, webhook_settings):
    """MEH-663 — Content-Length above the 1 MiB cap is rejected BEFORE
    the unbounded `await request.body()` allocates. 413 Payload Too
    Large; no row persisted; logs the cap breach."""
    payload = _build_text_payload(message_id="wamid.oversized")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "X-Hub-Signature-256": _sign(body_bytes),
        # Declared length wildly exceeds the 1 MiB cap. Actual body is small;
        # we're testing that the HEADER value alone trips the early-return
        # before any body allocation happens.
        "Content-Length": str(2_097_152),
    }
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 413
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.oversized")
        .count()
        == 0
    )


def test_post_invalid_content_length_returns_400(client, db, webhook_settings):
    """MEH-663 — non-numeric `Content-Length` is malformed and rejected
    with 400 Bad Request before any body read. Per HTTP spec the header
    must be a non-negative integer."""
    payload = _build_text_payload(message_id="wamid.bad_cl")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "X-Hub-Signature-256": _sign(body_bytes),
        "Content-Length": "not-a-number",
    }
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 400
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.bad_cl")
        .count()
        == 0
    )


def test_post_within_content_length_cap_still_processes(client, db, webhook_settings):
    """MEH-663 — Content-Length at or below the 1 MiB cap is unaffected
    (sanity check that the early-return doesn't break the happy path)."""
    payload = _build_text_payload(message_id="wamid.under_cap")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "X-Hub-Signature-256": _sign(body_bytes),
        "Content-Length": str(len(body_bytes)),  # honest, small
    }
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.under_cap")
        .count()
        == 1
    )


def test_post_status_event_returns_200_no_persist(client, db, webhook_settings):
    """Delivery/read receipts arrive on `value.statuses[]` (not `messages`).
    We log + 200 + persist nothing in v1."""
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "id": "WBA_ACCOUNT_ID",
                "changes": [
                    {
                        "value": {
                            "messaging_product": "whatsapp",
                            "metadata": {
                                "display_phone_number": "972552553744",
                                "phone_number_id": "PHONE_NUMBER_ID",
                            },
                            "statuses": [
                                {
                                    "id": "wamid.status_only",
                                    "status": "delivered",
                                    "timestamp": "1716381000",
                                    "recipient_id": "972501112222",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    assert db.query(InboundMessage).count() == 0
