"""WhatsApp Cloud API client (MEH-508).

Direct Meta Graph API integration; replaces the Twilio SDK that previously
fronted producer/admin/alert/OTP/rating-request notifications. Two public
functions — `send_text` for free-form messages inside the 24h customer-
service window, `send_template` for pre-approved business-initiated
templates.

Both fail-open: missing config → return False (no exception); any send
failure → log at ERROR, return False. Callers therefore never need a
try/except around these functions, mirroring the contract of the Twilio
call sites they replace.

MEH-2122: that level is ERROR rather than WARNING because fail-open makes
the failure invisible everywhere else — `producer_me.py` discards the
bool and still answers «קוד נשלח». ERROR is filterable in Railway logs
and is the threshold sentry-sdk's default LoggingIntegration captures at
(`sentry.py:110`). Note "failure" here is every non-accepted outcome, not
only an HTTP error: a Graph `200` carrying an `error` object is one, per
the AUD-009/010 note below.

Phone-number normalization (Israeli `0…` → `+972…`) stays at call sites;
this module only strips a leading `+` because Meta's API expects E.164
without it (see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages).

AUD-009/010 (MEH-214): `_post` no longer treats every non-error HTTP
status as "delivered". A Graph `200` only means the message was
*accepted/queued* (true delivery arrives later via the MEH-509 webhook),
and an `error` object can ride inside a `200` body. `_post` now parses
the response body into a `WhatsAppSendResult` — extracting the `wamid`
(message id) on success and the `error.code`/`error.message` on failure
— classifies the outcome (`accepted` / `failed` / `window_expired`), and
logs per outcome. `send_text` / `send_template` still return `bool`
(`result.ok`) so every call site stays byte-compatible.

MEH-771 (Chunk A): `_post` now also persists one `outbound_messages` row
per real send (`to_phone`, `kind`, `status` from the classification, and
the `wamid` as `meta_message_id`). Best-effort / fail-open via a
short-lived session — a DB error never breaks a send. The delivery-status
webhook that flips `accepted` → `delivered`/`failed` is Chunk B (not here).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import and_, or_

from app.config import settings
from app.services import outbound_guard
from app.services.outbound_guard import phone_allowed
from app.services.whatsapp_templates import WhatsAppTemplate
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0

# Outcome labels — `accepted` means Meta queued the message (HTTP 200 with a
# wamid); it does NOT mean delivered. True delivery is a later webhook event.
OUTCOME_ACCEPTED = "accepted"
OUTCOME_FAILED = "failed"
OUTCOME_WINDOW_EXPIRED = "window_expired"
# MEH-3402: dropped outside production (recipient not a staff number). Stored
# only outside production, with the content, for /admin/whatsapp/blocked.
OUTCOME_BLOCKED_NON_PROD = "blocked_nonprod"
BLOCKED_DEDUPE_WINDOW = timedelta(hours=24)

# MEH-771 Chunk C — the two terminal-bad outcomes from the recipient's
# perspective (`failed` = Meta reported an error, `window_expired` = the 24h
# customer-service window closed). Owned HERE, next to the outcome labels
# they mirror, so the admin failures list (routers/admin_whatsapp.py) and the
# admin-home queue count (routers/admin_extra.py, MEH-2359) read one tuple
# and one window instead of one router importing the other's privates.
UNDELIVERED_STATUSES: tuple[str, ...] = (OUTCOME_FAILED, OUTCOME_WINDOW_EXPIRED)
UNDELIVERED_WINDOW_DAYS = 7

# MEH-2122 Chunk E (state-machine audit §7.1): an `accepted` row becomes final
# only when Meta's delivery webhook arrives. If the webhook never comes
# (misconfigured, HMAC, outage) the row stays `accepted` forever, and an admin
# screen that shows only failed/window_expired cannot tell "no failures" from
# "the whole receipts pipeline is dead". So an `accepted` row older than this
# is STUCK and is listed with the undelivered ones. No schema change, no new
# status value: it is a predicate over the existing two columns.
STUCK_ACCEPTED_AFTER = timedelta(days=1)


def undelivered_predicate(model: Any, now: datetime) -> Any:
    """The one SQL filter for "did not reach the recipient", last 7 days:
    failed / window_expired, OR accepted for longer than STUCK_ACCEPTED_AFTER.
    Shared by the admin list (routers/admin_whatsapp.py) and the admin-home
    count (routers/admin_extra.py) so the two can never disagree."""
    return and_(
        model.created_at >= now - timedelta(days=UNDELIVERED_WINDOW_DAYS),
        or_(
            model.status.in_(UNDELIVERED_STATUSES),
            and_(
                model.status == OUTCOME_ACCEPTED,
                model.created_at < now - STUCK_ACCEPTED_AFTER,
            ),
        ),
    )


# MEH-214: Meta error codes meaning the 24h customer-service window has
# closed, so a free-form message can't be delivered (a template is required).
# 470 (legacy re-engagement), 131047 (re-engagement message), 131051
# (unsupported message type inside an expired window).
_WINDOW_EXPIRED_ERROR_CODES = frozenset({470, 131047, 131051})


@dataclass(frozen=True)
class WhatsAppSendResult:
    """Parsed outcome of a single Graph `/messages` POST.

    `ok` is the back-compat bool the call sites branch on (`True` only for
    `accepted`). `outcome` carries the richer classification; `message_id`
    is the Meta `wamid` when present; `error_code`/`error_message` mirror
    the Graph error object when the send failed.
    """

    outcome: str
    ok: bool
    message_id: str | None = None
    error_code: int | None = None
    error_message: str | None = None
    http_status: int | None = None


def _graph_api_base() -> str:
    return f"https://graph.facebook.com/{settings.whatsapp_api_version}"


def _is_configured() -> bool:
    return bool(settings.whatsapp_phone_number_id and settings.whatsapp_access_token)


def is_configured() -> bool:
    """Public read of the same check, for callers that must tell "nothing could
    be sent here" (dev / CI) from "the send failed" (MEH-2122 B)."""
    return _is_configured()


def _safe_json(response: Any) -> dict[str, Any] | None:
    """Best-effort parse of a Graph response body to a dict, else None.

    Never raises: a malformed/empty/non-JSON body must not turn a real
    send outcome into an exception at the call site.
    """
    try:
        body = response.json()
    except Exception:  # noqa: BLE001 — any decode failure → treat as no body
        return None
    return body if isinstance(body, dict) else None


def _result_from_error(status: int | None, error: dict[str, Any]) -> WhatsAppSendResult:
    raw_code = error.get("code")
    code = raw_code if isinstance(raw_code, int) else None
    outcome = (
        OUTCOME_WINDOW_EXPIRED
        if code in _WINDOW_EXPIRED_ERROR_CODES
        else OUTCOME_FAILED
    )
    return WhatsAppSendResult(
        outcome=outcome,
        ok=False,
        error_code=code,
        error_message=error.get("message"),
        http_status=status,
    )


def _classify(status: int | None, body: dict[str, Any] | None) -> WhatsAppSendResult:
    """Map a 2xx Graph response body to a result.

    A `200` can still carry an `error` object → failure. Otherwise the
    presence of `messages[0].id` (the wamid) marks the message as
    `accepted` (queued). A 2xx with no parseable body is treated as
    accepted-without-id to preserve the pre-AUD-009 contract.
    """
    if body is not None:
        error = body.get("error")
        if isinstance(error, dict):
            return _result_from_error(status, error)
        message_id = None
        messages = body.get("messages")
        if isinstance(messages, list) and messages and isinstance(messages[0], dict):
            message_id = messages[0].get("id")
        return WhatsAppSendResult(
            outcome=OUTCOME_ACCEPTED,
            ok=True,
            message_id=message_id,
            http_status=status,
        )
    return WhatsAppSendResult(outcome=OUTCOME_ACCEPTED, ok=True, http_status=status)


def _log_result(kind: str, to: str, result: WhatsAppSendResult) -> None:
    masked = mask_phone(to)
    if result.ok:
        logger.info(
            "[WHATSAPP] %s outcome=%s wamid=%s to=%s http=%s",
            kind,
            result.outcome,
            result.message_id,
            masked,
            result.http_status,
        )
    else:
        # MEH-2122: ERROR, not WARNING (Chunk A). Two consumers depend on the
        # level: Railway logs, where ERROR is filterable and WARNING is not
        # distinguishable from routine chatter; and Sentry, whose default
        # LoggingIntegration has event_level=ERROR (sentry.py:110), so a
        # WARNING here is a breadcrumb and never becomes an issue. The same
        # failure class in app/services/email.py is loud in production for
        # exactly that reason. Success stays INFO on purpose — raising the
        # whole function would bury failures under every successful send.
        logger.error(
            "[WHATSAPP] %s outcome=%s err_code=%s err=%s to=%s http=%s",
            kind,
            result.outcome,
            result.error_code,
            result.error_message,
            masked,
            result.http_status,
        )


def _persist_outbound(kind: str, to: str, result: WhatsAppSendResult) -> None:
    """Persist one `outbound_messages` row per real send (MEH-771 Chunk A).

    Best-effort / fail-open: a DB error must NEVER turn a real WhatsApp
    send into an exception at the call site — that is the whole-module
    contract (see `_safe_json`). `status` is taken straight from the
    AUD-009/010 classification (`result.outcome`); `meta_message_id`
    (the wamid) is the idempotency key the MEH-509 delivery webhook
    (Chunk B) will reconcile against to flip the row to delivered/failed.

    Opens its own short-lived session (the send layer is stateless, called
    from request handlers, background tasks, and the watchdog alike) —
    same pattern as `app/services/producer_risk.py:265`.
    """
    try:
        # REUSES: app/services/producer_risk.py:265 — service-layer own session.
        from app.database import SessionLocal
        from app.models.models import OutboundMessage

        with SessionLocal() as db:
            db.add(
                OutboundMessage(
                    to_phone=to.lstrip("+")[:20],
                    kind=kind[:64],
                    meta_message_id=result.message_id,
                    status=result.outcome,
                    error_code=result.error_code,
                    error_message=result.error_message,
                )
            )
            db.commit()
    except Exception as exc:  # noqa: BLE001 — persistence is best-effort, fail-open
        logger.warning(
            "[WHATSAPP] outbound persist failed kind=%s to=%s: %s",
            kind,
            mask_phone(to),
            exc,
        )


def _post(payload: dict[str, Any], *, kind: str, to: str) -> bool:
    """POST to Graph and return the back-compat `ok` bool.

    Delegates parsing/classification/logging to `_post_result`, persists
    the outbound row (MEH-771 Chunk A), then returns the boolean so
    callers keep their existing contract.
    """
    result = _post_result(payload, kind=kind, to=to)
    _persist_outbound(kind, to, result)
    return result.ok


def _post_result(payload: dict[str, Any], *, kind: str, to: str) -> WhatsAppSendResult:
    url = f"{_graph_api_base()}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=_TIMEOUT_SECONDS)
        r.raise_for_status()
        # MEH-771 Chunk C: dropped the `getattr(r, "status_code", None)` debt.
        # The fallback existed only to accommodate the _OkResp test mock; the
        # mock now declares `status_code = 200`. A real httpx.Response always
        # has status_code, so direct read is the right contract.
        result = _classify(r.status_code, _safe_json(r))
    except httpx.HTTPStatusError as e:
        # Non-2xx with a response body — parse the Graph error object.
        body = _safe_json(e.response)
        error = body.get("error") if body else None
        status = e.response.status_code if e.response is not None else None
        if isinstance(error, dict):
            result = _result_from_error(status, error)
        else:
            result = WhatsAppSendResult(
                outcome=OUTCOME_FAILED,
                ok=False,
                error_message=str(e),
                http_status=status,
            )
    except httpx.HTTPError as e:
        # Transport-level failure (timeout, connect error) — no response.
        result = WhatsAppSendResult(
            outcome=OUTCOME_FAILED, ok=False, error_message=str(e)
        )
    _log_result(kind, to, result)
    return result


def _skip_test_cause(kind: str, to: str) -> bool:
    """MEH-2952: log the drop of a send caused by a test business/user."""
    logger.info(
        "[WHATSAPP] skipped: caused by a test row (%s to=%s)", kind, mask_phone(to)
    )
    return False


def _record_blocked(kind: str, to: str, content: str) -> None:
    """MEH-3402 follow-up: keep what a dropped message would have said, so it
    can be checked on /admin/whatsapp/blocked without being sent. Runs only
    outside production (the caller is the guard). Fail-open like
    `_persist_outbound`: a DB error never reaches the caller. `to_phone` is
    stored like a real send's, so account deletion removes it too."""
    try:
        from app.database import SessionLocal
        from app.models.models import OutboundMessage
        from app.utils.clock import utc_now

        phone, now = to.lstrip("+")[:20], utc_now()
        with SessionLocal() as db:
            blocked = db.query(OutboundMessage).filter(
                OutboundMessage.status == OUTCOME_BLOCKED_NON_PROD
            )
            # Bounded (MEH-3022): rows past the list's window are dropped here,
            # and a retrying caller (watchdog, dispatcher) adds no duplicate.
            blocked.filter(
                OutboundMessage.created_at
                < now - timedelta(days=UNDELIVERED_WINDOW_DAYS)
            ).delete(synchronize_session=False)
            duplicate = blocked.filter(
                OutboundMessage.to_phone == phone,
                OutboundMessage.kind == kind[:64],
                OutboundMessage.error_message == content,
                OutboundMessage.created_at >= now - BLOCKED_DEDUPE_WINDOW,
            ).first()
            if duplicate is None:
                db.add(
                    OutboundMessage(
                        to_phone=phone,
                        kind=kind[:64],
                        status=OUTCOME_BLOCKED_NON_PROD,
                        error_message=content,
                    )
                )
            db.commit()
    except Exception as exc:  # noqa: BLE001 — capture is best-effort, fail-open
        logger.warning(
            "[WHATSAPP] blocked-send capture failed kind=%s to=%s: %s",
            kind,
            mask_phone(to),
            exc,
        )


# DO NOT store a one-time login code — anyone reading /admin/whatsapp/blocked
# or a staging backup could use it (MEH-3402 review). producer_otp_v1.code.
_SECRET_TEMPLATE_FIELDS = frozenset({"code"})
_REDACTED = "******"


def _template_preview(template: WhatsAppTemplate) -> str:
    values = [
        _REDACTED if f in _SECRET_TEMPLATE_FIELDS else str(getattr(template, f))
        for f in type(template).model_fields
    ]
    return f"{template.name}: {' | '.join(values)}" if values else template.name


def _blocked_outside_production(kind: str, to: str, content: str = "") -> bool:
    """MEH-3402: outside production only ADMIN_WHATSAPP_TO and the
    OTP_TEST_NUMBERS harness numbers receive WhatsApp. Returns True when the
    send must be dropped (logged, recorded with its content as
    `blocked_nonprod`, no HTTP)."""
    if phone_allowed(to):
        return False
    logger.info(
        "[WHATSAPP] NOT SENT outside production: %s to=%s is not a staff number",
        kind,
        mask_phone(to),
    )
    _record_blocked(kind, to, content)
    return True


def _links_to_production(template: WhatsAppTemplate, to: str) -> bool:
    """MEH-3414: outside production, drop a template whose Meta-registered
    text links to mehamakor.co.il (every template not marked
    `sends_outside_production`). Returns True when the send must be dropped."""
    # Module attribute, not a bare import: one switch for the whole guard.
    if outbound_guard.is_production() or template.sends_outside_production:
        return False
    logger.info(
        "[WHATSAPP] NOT SENT outside production: template[%s] to=%s links to "
        "production (its Meta text is fixed); the email carries this environment's link",
        template.name,
        mask_phone(to),
    )
    return True


def send_text(to: str, body: str, test_cause: bool = False) -> bool:
    """Send a free-form WhatsApp text message.

    Only works inside the 24h customer-service window per Meta policy;
    business-initiated messages must use `send_template` instead.

    MEH-2952: `test_cause=True` (the send was caused by a test business or a
    test user) drops the message before the config check and before any
    HTTP — staging and production alike — and returns False.
    """
    if test_cause:
        return _skip_test_cause("text", to)
    if not _is_configured():
        logger.debug("[WHATSAPP] Would send text to %s", mask_phone(to))
        return False
    if _blocked_outside_production("text", to, body):
        return False
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "text",
        "text": {"body": body},
    }
    return _post(payload, kind="text", to=to)


def send_template(
    to: str, template: WhatsAppTemplate, test_cause: bool = False
) -> bool:
    """Send a pre-approved WhatsApp template message (MEH-672).

    `template` is a typed `WhatsAppTemplate` instance — the template name,
    language code, and body parameters all come from it, so a param
    mismatch is caught at construction/type-check time instead of by a
    Meta 400 at runtime. `template.to_components()` emits an empty list
    for a zero-parameter template (no `components` block), preserving the
    pre-MEH-672 empty-params output byte-for-byte.

    MEH-2952: `test_cause=True` drops the send exactly as in `send_text`.
    """
    if test_cause:
        return _skip_test_cause(f"template[{template.name}]", to)
    if not _is_configured():
        logger.debug(
            "[WHATSAPP] Would send template %s to %s", template.name, mask_phone(to)
        )
        return False
    if _blocked_outside_production(
        f"template[{template.name}]", to, _template_preview(template)
    ):
        return False
    if _links_to_production(template, to):
        return False
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": template.name,
            "language": {"code": template.language},
            "components": template.to_components(),
        },
    }
    return _post(payload, kind=f"template[{template.name}]", to=to)


# MEH-3296: what the order outbox needs to know about a send, which the bool
# above folds together — a test row, a missing configuration and a refused
# send all read False there, and only the last is worth retrying.
OUTCOME_SKIPPED_TEST = "skipped_test"
OUTCOME_UNCONFIGURED = "unconfigured"
# MEH-3402 on the outcome path: outside production, a recipient who is not
# staff is dropped here too (the order outbox sends only through this twin).
# OUTCOME_BLOCKED_NON_PROD is defined once, above (same value, MEH-3402).


def send_template_result(
    to: str, template: WhatsAppTemplate, test_cause: bool = False
) -> WhatsAppSendResult:
    """`send_template`, answering with the parsed outcome instead of a bool."""
    if test_cause:
        _skip_test_cause(f"template[{template.name}]", to)
        return WhatsAppSendResult(outcome=OUTCOME_SKIPPED_TEST, ok=False)
    if not _is_configured():
        return WhatsAppSendResult(outcome=OUTCOME_UNCONFIGURED, ok=False)
    # DO NOT drop this — MEH-3402: the bool twins check it; this one must too.
    if _blocked_outside_production(f"template[{template.name}]", to):
        return WhatsAppSendResult(outcome=OUTCOME_BLOCKED_NON_PROD, ok=False)
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": template.name,
            "language": {"code": template.language},
            "components": template.to_components(),
        },
    }
    return _post_result(payload, kind=f"template[{template.name}]", to=to)
