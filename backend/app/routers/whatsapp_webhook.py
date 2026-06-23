"""
Module:   whatsapp_webhook
Purpose:  Meta WhatsApp Cloud API webhook receiver — GET verification
          challenge + POST inbound-message persistence + outbound-status
          reconciliation, all gated by HMAC-SHA256 signature verification.
Touches:  PostgreSQL inbound_messages (writes only; never reads back) and
          outbound_messages (UPDATE only, keyed on the unique wamid; the
          INSERT-side is app/services/whatsapp.py).
Does NOT: send outbound WhatsApp messages (app/services/whatsapp.py is
          MEH-508), dispatch auto-replies (auto_reply_watchdog is PR2b),
          retry failed sends or surface them to admin (MEH-771 Chunk C),
          invoke the watchdog directly (PR2b's APScheduler tick consumes
          the rows we write).
Related:  app/models/models.py:InboundMessage (PR2b),
          app/models/models.py:OutboundMessage (MEH-771 Chunk A),
          app/services/whatsapp.py:OUTCOME_* (status convention),
          app/config.py (whatsapp_app_secret + whatsapp_verify_token),
          Meta docs
          https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
History:  MEH-509 PR2c (creation; flip Railway env to WATCHDOG_ENABLED=true
          after this PR deploys + smoke).
          MEH-771 Chunk B (delivery-status reconciliation —
          statuses[] → outbound_messages flips accepted → delivered/failed,
          terminal-state-guarded UPDATE → idempotent replay).
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

# MEH-771 Chunk B — REUSES: app/services/whatsapp.py:185 — same direct path
# (OutboundMessage is intentionally not in app.models.__init__.__all__).
from app.models.models import OutboundMessage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhook", tags=["webhook"])

# Meta sends X-Hub-Signature-256 with a literal "sha256=" prefix per
# https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
# The old X-Hub-Signature (SHA-1) is deprecated; we deliberately do NOT
# accept it as a fallback — adding the weaker primitive would expand the
# attack surface for zero migration benefit.
_SIGNATURE_HEADER = "X-Hub-Signature-256"
_SIGNATURE_PREFIX = "sha256="

# MEH-663: in-app body-size cap as defense-in-depth against the unbounded
# `await request.body()` read that happens BEFORE HMAC verification. Meta
# payloads are typically < 50KB; 1 MiB is ~20× the largest realistic
# inbound (status-receipt batch). Railway/Vercel edge proxies already
# bound bodies in production, but if we ever change hosting topology the
# implicit defense disappears silently — this constant makes the bound
# explicit at the application layer. See docs/SECURITY.md §17a invariant #7.
_MAX_BODY_BYTES = 1_048_576

# MEH-771 Chunk B — Meta `value.statuses[]` reconciliation.
# Maps Meta's status enum to our internal convention
# ('accepted' | 'delivered' | 'failed' | 'window_expired'). The UPDATE in
# `_reconcile_status` is guarded on `status = 'accepted'`, so terminal
# states are NEVER overwritten — late out-of-order events become
# idempotent no-ops at the SQL level. `sent` is silently dropped: Meta's
# `sent` ≈ our 'accepted' from Chunk A's send-time write, so there is
# nothing to update. `read` folds into 'delivered' (no separate 'read'
# enum value in Chunk B; read-receipt analytics is Chunk C).
_STATUS_TO_DELIVERED = frozenset({"delivered", "read"})
_STATUS_FAILED = "failed"
_STATUS_SENT = "sent"


def _enforce_content_length(request: Request) -> None:
    """MEH-663 + batch-2 #3 — reject oversized OR malformed
    Content-Length BEFORE the unbounded `await request.body()` allocates.

    Failure-mode matrix (documented in docs/SECURITY.md §17a invariant #7):
      missing header     → fall through (proxy bounds the body; Meta
                           always sends it but legitimate omissions
                           don't get gratuitously broken).
      non-numeric        → 400 Bad Request.
      negative (-1, …)   → 400 Bad Request (RFC 7230 §3.3.2 specifies
                           "decimal non-negative integer"). Rejected
                           BEFORE the > cap check so a hostile `-1`
                           can't slip past via signed-int comparison.
      > _MAX_BODY_BYTES  → 413 Payload Too Large.

    Extracted from `webhook_receive` to keep the handler under the
    project McCabe ceiling (C901) after batch-2 #3 added the negative-
    value branch.
    """
    declared = request.headers.get("Content-Length")
    if declared is None:
        return
    try:
        declared_int = int(declared)
    except ValueError:
        logger.warning("[WEBHOOK] POST rejected — non-numeric Content-Length")
        raise HTTPException(status_code=400, detail="Bad Request")
    if declared_int < 0:
        logger.warning(
            "[WEBHOOK] POST rejected — negative Content-Length %d",
            declared_int,
        )
        raise HTTPException(status_code=400, detail="Bad Request")
    if declared_int > _MAX_BODY_BYTES:
        logger.warning(
            "[WEBHOOK] POST rejected — Content-Length %d > %d cap",
            declared_int,
            _MAX_BODY_BYTES,
        )
        raise HTTPException(status_code=413, detail="Payload Too Large")


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
    # MEH-663 + batch-2 #3: Content-Length pre-check (DoS defense-in-depth).
    _enforce_content_length(request)
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
            "[WEBHOOK] tick persisted=%d duplicates=%d failed=%d "
            "statuses=%d reconciled=%d unknown=%d",
            counters["persisted"],
            counters["duplicates"],
            counters["failed"],
            counters["statuses"],
            counters["reconciled"],
            counters["unknown"],
        )
    return Response(status_code=200)


def _process_entries(db: Session, entries) -> dict[str, int]:
    """Walk Meta's ``entry[].changes[].value`` tree and persist each message.

    Extracted from `webhook_receive` so the handler stays under the
    project's McCabe-complexity ceiling (C901 / PLR0912). Returns counters
    of (persisted / duplicates / failed / statuses) for the caller's log.
    `statuses` counts delivery / read receipts that are intentionally NOT
    persisted in v1.

    Defensive ``isinstance`` checks at every nesting level: if a valid-
    signature POST ever carries a malformed shape (Meta change OR a
    secret leak letting an attacker control the payload), we log the
    bad-shape key + type and skip that level instead of letting an
    AttributeError bubble to a 500 (which would put Meta into retry
    storm). The log lines NEVER include the value — PII guard.
    """
    # MEH-771 Chunk B added `reconciled` (statuses[] → outbound_messages
    # UPDATE matched) and `unknown` (wamid with no matching outbound row).
    counters = {
        "persisted": 0,
        "duplicates": 0,
        "failed": 0,
        "statuses": 0,
        "reconciled": 0,
        "unknown": 0,
    }
    if not isinstance(entries, list):
        logger.warning(
            "[WEBHOOK] payload.entry not a list: type=%s", type(entries).__name__
        )
        return counters
    for entry in entries:
        _process_one_entry(db, entry, counters)
    return counters


def _process_one_entry(db: Session, entry, counters: dict[str, int]) -> None:
    """Single-entry walker — extracted to keep `_process_entries` under the
    McCabe / PLR0912 caps after the MEH-509 PR2c hardening pass."""
    if not isinstance(entry, dict):
        logger.warning("[WEBHOOK] entry not a dict: type=%s", type(entry).__name__)
        return
    changes = entry.get("changes")
    if not isinstance(changes, list):
        if changes is not None:
            logger.warning(
                "[WEBHOOK] entry.changes not a list: type=%s",
                type(changes).__name__,
            )
        return
    for change in changes:
        _process_one_change(db, change, counters)


def _process_one_change(db: Session, change, counters: dict[str, int]) -> None:
    """Single-change walker — same extraction rationale as `_process_one_entry`.

    MEH-771 Chunk B: a single Meta change can carry `messages[]` (inbound)
    OR `statuses[]` (delivery receipts) — defensively, we walk both. The
    inbound `_process_messages` path stays byte-identical; statuses[]
    reconciles against `outbound_messages` via `_process_statuses`. Meta
    typically separates the two into different changes, but handling
    them independently here is order-agnostic and costs nothing.
    """
    if not isinstance(change, dict):
        logger.warning("[WEBHOOK] change not a dict: type=%s", type(change).__name__)
        return
    value = change.get("value")
    if not isinstance(value, dict):
        if value is not None:
            logger.warning(
                "[WEBHOOK] change.value not a dict: type=%s",
                type(value).__name__,
            )
        return
    messages = value.get("messages")
    if messages is not None and not isinstance(messages, list):
        logger.warning(
            "[WEBHOOK] value.messages not a list: type=%s",
            type(messages).__name__,
        )
        messages = None
    if messages:
        _process_messages(db, messages, counters)

    statuses = value.get("statuses")
    if statuses is not None and not isinstance(statuses, list):
        logger.warning(
            "[WEBHOOK] value.statuses not a list: type=%s",
            type(statuses).__name__,
        )
        statuses = None
    if statuses:
        counters["statuses"] += len(statuses)
        _process_statuses(db, statuses, counters)


def _process_messages(db: Session, messages: list, counters: dict[str, int]) -> None:
    """Per-message persister loop — extracted to keep `_process_one_change`
    under the McCabe ceiling after the MEH-509 PR2c isinstance hardening."""
    for message in messages:
        if not isinstance(message, dict):
            logger.warning(
                "[WEBHOOK] message not a dict: type=%s", type(message).__name__
            )
            counters["failed"] += 1
            continue
        result = _persist_message(db, message)
        if result == "persisted":
            counters["persisted"] += 1
        elif result == "duplicate":
            counters["duplicates"] += 1
        else:
            counters["failed"] += 1


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


# ---- MEH-771 Chunk B — outbound status reconciliation ---------------------


def _process_statuses(db: Session, statuses: list, counters: dict[str, int]) -> None:
    """Per-status reconciler loop — mirrors `_process_messages`.

    Walks `value.statuses[]` and reconciles each Meta delivery receipt
    against `outbound_messages` (UPDATE keyed on the unique wamid).
    Defensive isinstance + per-status try/except inside
    `_reconcile_status` — never raises, never 5xx Meta, no inbound-path
    interaction.
    """
    for status_obj in statuses:
        if not isinstance(status_obj, dict):
            logger.warning(
                "[WEBHOOK] status not a dict: type=%s", type(status_obj).__name__
            )
            continue
        _reconcile_status(db, status_obj, counters)


def _reconcile_status(db: Session, status_obj: dict, counters: dict[str, int]) -> None:
    """Reconcile one Meta status receipt against `outbound_messages`.

    Mapping (see `_build_status_update`):
      sent      → no-op (Meta's `sent` ≈ our 'accepted' from send-time)
      delivered → UPDATE status='delivered', updated_at=now()
      read      → same as delivered (no separate 'read' enum in Chunk B)
      failed    → UPDATE status='failed', error_code/error_message from
                  errors[0] when present (guarded, never IndexError),
                  updated_at=now()
      other     → debug-log + skip

    Precedence: the UPDATE is guarded on `status = 'accepted'`, so
    terminal states ('delivered', 'failed', 'window_expired') are NEVER
    overwritten. Replays of the same receipt match 0 rows once the row is
    already past 'accepted', leaving it in the same state — idempotent at
    the SQL level.

    Unknown wamid (no matching row) → log + counters['unknown'] += 1 and
    continue. PII guard: log wamid prefix + recipient_id last-4 only,
    never the full phone, never the body.
    """
    wamid = status_obj.get("id")
    if not isinstance(wamid, str) or not wamid:
        logger.warning("[WEBHOOK] status missing/invalid id — skipping")
        return

    update_payload = _build_status_update(status_obj)
    if update_payload is None:
        return

    try:
        rowcount = (
            db.query(OutboundMessage)
            .filter(
                OutboundMessage.meta_message_id == wamid,
                OutboundMessage.status == "accepted",
            )
            .update(update_payload, synchronize_session=False)
        )
        db.commit()
    except Exception as exc:  # noqa: BLE001 — webhook must never 5xx Meta
        db.rollback()
        logger.warning(
            "[WEBHOOK] status reconcile failed wamid_prefix=%s: %s",
            wamid[:24],
            exc,
        )
        return

    if rowcount:
        counters["reconciled"] += 1
        return

    _log_zero_rowcount(db, wamid, status_obj, counters)


def _build_status_update(status_obj: dict) -> dict | None:
    """Map a Meta status receipt to the column changes for the UPDATE.

    Returns `None` when no update should be applied (`sent`, unknown
    status name, or anything else outside the documented enum). The
    `read → 'delivered'` fold lives here, as does the defensive
    `errors[0]` guard for the failed case (missing/empty errors[] →
    error_code/error_message stay NULL, but status still flips to
    'failed' per spec).
    """
    raw_status = status_obj.get("status")
    if raw_status == _STATUS_SENT:
        return None
    if raw_status in _STATUS_TO_DELIVERED:
        return {
            "status": "delivered",
            "updated_at": datetime.utcnow(),
        }
    if raw_status == _STATUS_FAILED:
        err = _extract_first_error(status_obj.get("errors"))
        return {
            "status": "failed",
            "updated_at": datetime.utcnow(),
            "error_code": err["code"],
            "error_message": err["message"],
        }
    logger.debug(
        "[WEBHOOK] unknown status name — skipping (status=%s)",
        raw_status if isinstance(raw_status, str) else type(raw_status).__name__,
    )
    return None


def _log_zero_rowcount(
    db: Session, wamid: str, status_obj: dict, counters: dict[str, int]
) -> None:
    """Cold-path branch for `_reconcile_status` when the UPDATE matched 0
    rows. Either the wamid is unknown (no matching outbound row at all)
    or the row already passed 'accepted' (idempotent replay / terminal).

    One existence probe distinguishes the two: unknown → log + unknown
    counter; existing → silent no-op (the common replay path stays quiet
    so it can't drown out real anomalies in production logs).
    """
    exists = (
        db.query(OutboundMessage.id)
        .filter(OutboundMessage.meta_message_id == wamid)
        .first()
    )
    if exists is not None:
        return
    counters["unknown"] += 1
    recipient = status_obj.get("recipient_id")
    suffix = recipient[-4:] if isinstance(recipient, str) and recipient else "????"
    # REUSES: app/routers/whatsapp_webhook.py:425 — PII pattern (last-4 only).
    logger.info(
        "[WEBHOOK] status receipt for unknown wamid_prefix=%s to=...%s",
        wamid[:24],
        suffix,
    )


def _extract_first_error(errors) -> dict:
    """Pull `{code, message}` from Meta's `errors[]`, defensively.

    Returns `{"code": int|None, "message": str|None}` and never raises:
      - missing / empty / non-list errors → both None
      - errors[0] not a dict → both None
      - errors[0].code not an int → code None (message still captured)
    """
    if not isinstance(errors, list) or not errors:
        return {"code": None, "message": None}
    first = errors[0]
    if not isinstance(first, dict):
        return {"code": None, "message": None}
    raw_code = first.get("code")
    code = raw_code if isinstance(raw_code, int) else None
    raw_message = first.get("message")
    message = raw_message if isinstance(raw_message, str) else None
    return {"code": code, "message": message}
