"""
Module:   whatsapp_webhook
Purpose:  Meta WhatsApp Cloud API webhook receiver — GET verification
          challenge + POST inbound-message persistence with HMAC-SHA256
          signature verification.
Touches:  PostgreSQL inbound_messages (writes only); never reads back.
Does NOT: send outbound WhatsApp messages (app/services/whatsapp.py is
          MEH-508), dispatch auto-replies (auto_reply_watchdog is PR2b),
          handle status/delivered/read receipts (logged + 200, no
          persistence in v1), invoke the watchdog directly (PR2b's
          APScheduler tick consumes the rows we write).
Related:  app/models/models.py:InboundMessage (PR2b), app/config.py
          (whatsapp_app_secret + whatsapp_verify_token), Meta docs
          https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
History:  MEH-509 PR2c (creation; flip Railway env to WATCHDOG_ENABLED=true
          after this PR deploys + smoke).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import InboundMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# Meta sends X-Hub-Signature-256 with a literal "sha256=" prefix per
# https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
# The old X-Hub-Signature (SHA-1) is deprecated; we deliberately do NOT
# accept it as a fallback — adding the weaker primitive would expand the
# attack surface for zero migration benefit.
_SIGNATURE_HEADER = "X-Hub-Signature-256"
_SIGNATURE_PREFIX = "sha256="


# ---- GET verification challenge --------------------------------------------


@router.get("/whatsapp")
async def webhook_challenge(request: Request) -> PlainTextResponse:
    """Respond to Meta's subscription challenge.

    Meta hits this URL once when the webhook is registered in the
    Developer Console, sending three query params: `hub.mode=subscribe`,
    `hub.verify_token=<our static token>`, `hub.challenge=<random>`.
    A successful response echoes `hub.challenge` as plain-text 200.

    Fail-closed: empty `whatsapp_verify_token` setting → 403 every time.
    The Meta UI surfaces a clear error in that case, telling the operator
    to set the env var rather than letting any GET pass through.
    """
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token") or ""
    challenge = request.query_params.get("hub.challenge") or ""

    expected_token = settings.whatsapp_verify_token
    if not expected_token:
        logger.warning(
            "[WEBHOOK] GET challenge rejected — WHATSAPP_VERIFY_TOKEN not configured"
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    # Constant-time string compare — both args MUST be str (compare_digest
    # raises TypeError on mixed str/bytes). `token` is str from query_params;
    # `expected_token` is str from Settings.
    token_ok = hmac.compare_digest(token, expected_token)
    if mode != "subscribe" or not token_ok:
        logger.warning(
            "[WEBHOOK] GET challenge rejected — mode=%s token_ok=%s",
            mode,
            token_ok,
        )
        raise HTTPException(status_code=403, detail="Forbidden")

    return PlainTextResponse(content=challenge, status_code=200)


# ---- POST receiver ---------------------------------------------------------


@router.post("/whatsapp")
async def webhook_receive(
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    """Receive inbound WhatsApp events.

    Order is load-bearing:
      1. await request.body() FIRST — FastAPI consumes the stream
         exactly once. Any Pydantic body model on this handler would
         steal the bytes before HMAC verification can see them.
      2. Verify X-Hub-Signature-256 against the raw bytes.
      3. ONLY THEN parse JSON and persist messages.

    Always returns 200 if signature is valid (even on garbage JSON or
    unknown event shapes), because Meta retries on non-2xx and we don't
    want exponential backoff to hide a parser bug.
    """
    body_bytes = await request.body()

    # --- Step 1: signature header ---
    signature_header = request.headers.get(_SIGNATURE_HEADER) or ""
    if not signature_header.startswith(_SIGNATURE_PREFIX):
        logger.warning(
            "[WEBHOOK] POST rejected — missing or malformed %s",
            _SIGNATURE_HEADER,
        )
        raise HTTPException(status_code=403, detail="Forbidden")
    received_hex = signature_header[len(_SIGNATURE_PREFIX) :]

    # --- Step 2: fail-closed on empty secret ---
    secret = settings.whatsapp_app_secret
    if not secret:
        # An empty HMAC key would produce a deterministic-but-trivially-
        # forgeable signature. Reject before computing so an attacker
        # cannot derive the expected hex.
        logger.warning("[WEBHOOK] POST rejected — WHATSAPP_APP_SECRET not configured")
        raise HTTPException(status_code=403, detail="Forbidden")

    # --- Step 3: compute expected HMAC + constant-time compare ---
    expected_hex = hmac.new(
        secret.encode("utf-8"),
        body_bytes,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(received_hex, expected_hex):
        logger.warning("[WEBHOOK] POST rejected — X-Hub-Signature-256 mismatch")
        raise HTTPException(status_code=403, detail="Forbidden")

    # --- Step 4: parse JSON ---
    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        # Meta would never send unparseable JSON with a valid signature —
        # this is either a misconfigured proxy stripping bytes or a real
        # bug. Return 200 (don't trigger Meta's retry storm) but log loud.
        logger.warning("[WEBHOOK] POST signature ok but body unparseable: %s", exc)
        return Response(status_code=200)

    # --- Step 5: walk Meta's nested structure ---
    entries = payload.get("entry") or []
    if not entries:
        logger.warning(
            "[WEBHOOK] POST unknown event shape: top-level keys=%s",
            sorted(payload.keys()),
        )
        return Response(status_code=200)

    counters = _process_entries(db, entries)
    if any(counters.values()):
        logger.info(
            "[WEBHOOK] tick persisted=%d duplicates=%d failed=%d statuses=%d",
            counters["persisted"],
            counters["duplicates"],
            counters["failed"],
            counters["statuses"],
        )
    return Response(status_code=200)


def _process_entries(db: Session, entries: list) -> dict[str, int]:
    """Walk Meta's `entry[].changes[].value` tree and persist each message.

    Extracted from `webhook_receive` so the handler stays under the
    project's McCabe-complexity ceiling (C901 / PLR0912). Returns counters
    of (persisted / duplicates / failed / statuses) for the caller's log.
    `statuses` counts delivery / read receipts that are intentionally NOT
    persisted in v1.
    """
    counters = {"persisted": 0, "duplicates": 0, "failed": 0, "statuses": 0}
    for entry in entries:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            messages = value.get("messages") or []
            if not messages:
                # Delivery/read receipts come on `value.statuses[]`.
                if value.get("statuses"):
                    counters["statuses"] += len(value["statuses"])
                continue
            for message in messages:
                result = _persist_message(db, message)
                if result == "persisted":
                    counters["persisted"] += 1
                elif result == "duplicate":
                    counters["duplicates"] += 1
                else:
                    counters["failed"] += 1
    return counters


def _persist_message(db: Session, message: dict) -> str:
    """Insert one Meta WhatsApp message into `inbound_messages`.

    Returns one of: ``"persisted"`` (new row), ``"duplicate"`` (UNIQUE
    constraint on meta_message_id caught a replay), ``"failed"`` (the
    message was missing required fields or hit an unexpected DB error).
    Caller logs the aggregate counters; this function only logs per-row
    anomalies to keep the happy path quiet.
    """
    from_phone = message.get("from")
    meta_message_id = message.get("id")
    msg_type = message.get("type") or "unknown"

    if not from_phone or not meta_message_id:
        logger.warning(
            "[WEBHOOK] message missing from/id (type=%s) — skipping", msg_type
        )
        return "failed"

    if msg_type == "text":
        body = (message.get("text") or {}).get("body") or ""
    else:
        # Non-text types (image / video / audio / document / sticker /
        # location / contacts / interactive / reaction / button etc.) —
        # persist a placeholder so the watchdog still treats them as
        # inbound activity. Actual media handling is a post-launch ticket.
        body = f"[{msg_type}]"

    # Meta sends timestamp as Unix-seconds string. Coerce to naive UTC
    # to match the DateTime (without tz) column the watchdog filters on.
    received_at = None
    ts_raw = message.get("timestamp")
    if ts_raw is not None:
        try:
            received_at = datetime.fromtimestamp(int(ts_raw), tz=timezone.utc).replace(
                tzinfo=None
            )
        except (TypeError, ValueError):
            received_at = None  # server_default now() will fill in

    inbound = InboundMessage(
        from_phone=from_phone,
        body=body,
        meta_message_id=meta_message_id,
        received_at=received_at,
    )
    db.add(inbound)
    try:
        db.commit()
    except IntegrityError:
        # UNIQUE(meta_message_id) caught Meta's at-least-once delivery.
        # The first POST already persisted this id; second arrival is a no-op.
        db.rollback()
        logger.debug(
            "[WEBHOOK] duplicate meta_message_id (id_prefix=%s)",
            meta_message_id[:24],
        )
        return "duplicate"
    except Exception as exc:  # noqa: BLE001 — webhook must never 5xx Meta
        db.rollback()
        logger.warning(
            "[WEBHOOK] persist failed (type=%s id_prefix=%s): %s",
            msg_type,
            meta_message_id[:24],
            exc,
        )
        return "failed"

    # MEH-509 PR2c: log only the last 4 digits of the phone — privacy.
    logger.info(
        "[WEBHOOK] persisted msg from=...%s type=%s",
        from_phone[-4:],
        msg_type,
    )
    return "persisted"
