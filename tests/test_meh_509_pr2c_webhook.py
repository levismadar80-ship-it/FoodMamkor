"""MEH-509 PR2c — WhatsApp webhook receiver (GET challenge + POST + HMAC).

Security boundary tests: the X-Hub-Signature-256 HMAC is the only thing
standing between the open internet and writes to `inbound_messages` /
`outbound_messages`. Every POST path must verify (a) signature is
required, (b) signature is constant-time-compared, (c) an empty
`whatsapp_app_secret` is treated as "no security configured → reject",
(d) replays are absorbed by the UNIQUE(meta_message_id) constraint
(inbound) or the precedence-guarded UPDATE (outbound), not by a
pre-check SELECT.

MEH-771 Chunk B adds outbound-status reconciliation tests: a signed
`statuses[]` payload flips the matching `outbound_messages` row from
'accepted' → 'delivered' / 'failed' (terminal states never overwritten;
unknown wamid logged + ignored; signature still required).

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
from app.models.models import OutboundMessage


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


def _build_status_payload(
    *,
    message_id: str = "wamid.HBgLNzIxXXXX_status01",
    status: str = "delivered",
    recipient_id: str = "972501112222",
    timestamp: str = "1716381000",
    errors: list | None = None,
) -> dict:
    """MEH-771 Chunk B factory — Meta `value.statuses[]` shape.

    Mirrors `_build_text_payload`. Caller passes ``errors=[{...}]`` to
    simulate a `failed` receipt; default is None (omitted) for the
    `delivered`/`read`/`sent` happy paths.
    """
    status_obj: dict = {
        "id": message_id,
        "status": status,
        "timestamp": timestamp,
        "recipient_id": recipient_id,
    }
    if errors is not None:
        status_obj["errors"] = errors
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
                            "statuses": [status_obj],
                        },
                        "field": "messages",
                    }
                ],
            }
        ],
    }


def _seed_outbound(
    db,
    *,
    wamid: str,
    status: str = "accepted",
    to_phone: str = "972501112222",
    kind: str = "test.template",
) -> OutboundMessage:
    """MEH-771 Chunk B helper — seed one `outbound_messages` row.

    Mirrors the shape `app/services/whatsapp.py:_persist_outbound` writes
    at send time (`status='accepted'`, `meta_message_id=wamid`).
    """
    row = OutboundMessage(
        to_phone=to_phone,
        kind=kind,
        meta_message_id=wamid,
        status=status,
    )
    db.add(row)
    db.commit()
    return row


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
        + hmac.new(
            FAKE_APP_SECRET.encode("utf-8"), body_bytes, hashlib.sha1
        ).hexdigest()
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
    sig = "sha256=" + hmac.new(b"", body_bytes, hashlib.sha256).hexdigest()
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
    assert relevant, (
        f"expected entry-not-a-list warning, got: {[r.getMessage() for r in caplog.records]}"
    )
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


def test_post_negative_content_length_returns_400(client, db, webhook_settings):
    """MEH-509 batch-2 #3 — negative Content-Length is malformed per
    RFC 7230 §3.3.2 ("a decimal non-negative integer"). Reject 400 (not
    413) BEFORE the `> cap` check so a hostile `-1` can't bypass the
    body-size gate via signed-int wraparound semantics.

    Defense-in-depth: not exploitable today (Railway/Vercel proxies
    normalize), but cheap to harden + locks the spec contract."""
    payload = _build_text_payload(message_id="wamid.negative_cl")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {
        "X-Hub-Signature-256": _sign(body_bytes),
        "Content-Length": "-1",
    }
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 400
    assert (
        db.query(InboundMessage)
        .filter(InboundMessage.meta_message_id == "wamid.negative_cl")
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


# ---- MEH-771 Chunk B — outbound status reconciliation ---------------------


def test_post_status_event_does_not_write_inbound(client, db, webhook_settings):
    """Delivery receipts arrive on `value.statuses[]` (not `messages`). They
    MUST NOT bleed into the inbound pipeline — `inbound_messages` stays
    untouched even when the wamid has no matching outbound row.

    Old (pre-Chunk-B) name: ``test_post_status_event_returns_200_no_persist``
    (asserted only that statuses → 200 + no inbound write). Chunk B keeps
    the inbound-zero invariant and adds the reconcile-behavior tests
    below; this test guards the "no cross-pipe pollution" contract.
    """
    payload = _build_status_payload(
        message_id="wamid.meh771_no_inbound",
        status="delivered",
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert resp.status_code == 200
    # No inbound row created.
    assert db.query(InboundMessage).count() == 0
    # No outbound row created either — reconcile UPDATES existing rows,
    # never INSERTs (that's Chunk A's job).
    assert db.query(OutboundMessage).count() == 0


def test_status_delivered_reconciles_accepted_row(client, db, webhook_settings):
    """Signed `delivered` status for a known wamid → row.status flips from
    'accepted' to 'delivered' and updated_at is populated."""
    wamid = "wamid.meh771_deliver_01"
    seed = _seed_outbound(db, wamid=wamid, status="accepted")
    assert seed.updated_at is None

    payload = _build_status_payload(message_id=wamid, status="delivered")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row.status == "delivered"
    assert row.updated_at is not None
    assert row.error_code is None
    assert row.error_message is None


def test_status_read_treated_as_delivered(client, db, webhook_settings):
    """`read` folds into 'delivered' in Chunk B (no separate 'read' enum).
    Behavior identical to `delivered` for now; Chunk C may split them."""
    wamid = "wamid.meh771_read_01"
    _seed_outbound(db, wamid=wamid, status="accepted")

    payload = _build_status_payload(message_id=wamid, status="read")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row.status == "delivered"
    assert row.updated_at is not None


def test_status_sent_is_noop(client, db, webhook_settings):
    """Meta's `sent` ≈ our 'accepted' from Chunk A's send-time write —
    no UPDATE issued, no updated_at touched. Counter still increments
    via the existing `statuses` total, but `reconciled` does NOT."""
    wamid = "wamid.meh771_sent_01"
    _seed_outbound(db, wamid=wamid, status="accepted")

    payload = _build_status_payload(message_id=wamid, status="sent")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row.status == "accepted"
    assert row.updated_at is None


def test_status_failed_captures_error_code_and_message(client, db, webhook_settings):
    """`failed` receipt with `errors=[{code, message}]` → row flips to
    'failed' AND error_code (int) + error_message (str) are persisted."""
    wamid = "wamid.meh771_fail_01"
    _seed_outbound(db, wamid=wamid, status="accepted")

    payload = _build_status_payload(
        message_id=wamid,
        status="failed",
        errors=[
            {
                "code": 131026,
                "title": "Message undeliverable",
                "message": "Receiver incapable",
            }
        ],
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row.status == "failed"
    assert row.error_code == 131026
    assert row.error_message == "Receiver incapable"
    assert row.updated_at is not None


def test_status_failed_without_errors_array_does_not_crash(
    client, db, webhook_settings
):
    """`failed` with missing/empty `errors[]` is still a valid receipt:
    status flips to 'failed', error_code/error_message stay NULL,
    and crucially the handler does NOT IndexError on errors[0]."""
    wamid = "wamid.meh771_fail_no_errs"
    _seed_outbound(db, wamid=wamid, status="accepted")

    # errors omitted entirely (Meta sometimes ships just status + id).
    payload = _build_status_payload(
        message_id=wamid,
        status="failed",
        errors=None,
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row.status == "failed"
    assert row.error_code is None
    assert row.error_message is None
    assert row.updated_at is not None


def test_status_unknown_wamid_logs_no_crash(client, db, webhook_settings, caplog):
    """Status receipt for a wamid not in `outbound_messages` (e.g., a
    pre-Chunk-A send the DB never persisted) → 200, zero mutations, and
    a log line carrying the recipient last-4 ONLY (no full phone)."""
    import logging

    payload = _build_status_payload(
        message_id="wamid.meh771_ghost_01",
        status="delivered",
        recipient_id="972501119999",
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}

    with caplog.at_level(logging.INFO, logger="app.routers.whatsapp_webhook"):
        resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    assert db.query(OutboundMessage).count() == 0

    # Log line carries last-4 of recipient, NOT the full phone, NOT the body.
    msgs = [r.getMessage() for r in caplog.records]
    unknown_logs = [m for m in msgs if "unknown wamid_prefix=" in m]
    assert unknown_logs, f"expected unknown-wamid log, got: {msgs}"
    line = unknown_logs[0]
    assert "9999" in line  # last 4 digits present
    assert "972501119999" not in line  # full phone NEVER logged


def test_status_idempotent_replay(client, db, webhook_settings):
    """Replaying the same `delivered` status leaves the row in the same
    state — second POST matches 0 rows (status='accepted' guard) and
    silently no-ops. Both POSTs return 200."""
    wamid = "wamid.meh771_replay_01"
    _seed_outbound(db, wamid=wamid, status="accepted")

    payload = _build_status_payload(message_id=wamid, status="delivered")
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}

    r1 = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert r1.status_code == 200
    db.expire_all()
    row_after_first = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    assert row_after_first.status == "delivered"
    first_updated_at = row_after_first.updated_at
    assert first_updated_at is not None

    # Replay the identical signed payload.
    r2 = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)
    assert r2.status_code == 200
    db.expire_all()
    row_after_second = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    # Status unchanged; updated_at NOT bumped on the replay (UPDATE matched
    # 0 rows because status no longer == 'accepted').
    assert row_after_second.status == "delivered"
    assert row_after_second.updated_at == first_updated_at
    # Single row, no duplicate insert.
    assert (
        db.query(OutboundMessage)
        .filter(OutboundMessage.meta_message_id == wamid)
        .count()
        == 1
    )


def test_status_no_downgrade_from_delivered(client, db, webhook_settings):
    """Precedence: a row already at 'delivered' must NOT be overwritten by
    a late `failed` receipt. Terminal states stay terminal."""
    wamid = "wamid.meh771_no_downgrade_01"
    _seed_outbound(db, wamid=wamid, status="delivered")

    payload = _build_status_payload(
        message_id=wamid,
        status="failed",
        errors=[{"code": 131026, "message": "late failure"}],
    )
    body_bytes = json.dumps(payload).encode("utf-8")
    headers = {"X-Hub-Signature-256": _sign(body_bytes)}
    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 200
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    # 'delivered' preserved; error fields stay NULL (no overwrite occurred).
    assert row.status == "delivered"
    assert row.error_code is None
    assert row.error_message is None


def test_status_signature_still_required(client, db, webhook_settings):
    """The HMAC gate applies to status payloads identically to inbound
    payloads — an unsigned (or wrong-signature) status receipt → 403,
    zero outbound mutations. The signature gate is the only thing
    standing between the internet and writes to outbound_messages."""
    wamid = "wamid.meh771_unsigned_01"
    _seed_outbound(db, wamid=wamid, status="accepted")

    payload = _build_status_payload(message_id=wamid, status="delivered")
    body_bytes = json.dumps(payload).encode("utf-8")
    # Wrong-secret signature.
    headers = {"X-Hub-Signature-256": _sign(body_bytes, secret="attacker-guess")}

    resp = client.post("/webhook/whatsapp", content=body_bytes, headers=headers)

    assert resp.status_code == 403
    db.expire_all()
    row = (
        db.query(OutboundMessage).filter(OutboundMessage.meta_message_id == wamid).one()
    )
    # Row untouched — still 'accepted', updated_at still NULL.
    assert row.status == "accepted"
    assert row.updated_at is None
