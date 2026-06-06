"""WhatsApp Cloud API client (MEH-508).

Direct Meta Graph API integration; replaces the Twilio SDK that previously
fronted producer/admin/alert/OTP/rating-request notifications. Two public
functions — `send_text` for free-form messages inside the 24h customer-
service window, `send_template` for pre-approved business-initiated
templates.

Both fail-open: missing config → return False (no exception); HTTP error →
log warning, return False. Callers therefore never need a try/except
around these functions, mirroring the contract of the Twilio call sites
they replace.

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
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings
from app.services.whatsapp_templates import WhatsAppTemplate
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0

# Outcome labels — `accepted` means Meta queued the message (HTTP 200 with a
# wamid); it does NOT mean delivered. True delivery is a later webhook event.
OUTCOME_ACCEPTED = "accepted"
OUTCOME_FAILED = "failed"
OUTCOME_WINDOW_EXPIRED = "window_expired"

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
            kind, result.outcome, result.message_id, masked, result.http_status,
        )
    else:
        logger.warning(
            "[WHATSAPP] %s outcome=%s err_code=%s err=%s to=%s http=%s",
            kind, result.outcome, result.error_code,
            result.error_message, masked, result.http_status,
        )


def _post(payload: dict[str, Any], *, kind: str, to: str) -> bool:
    """POST to Graph and return the back-compat `ok` bool.

    Delegates parsing/classification/logging to `_post_result`; callers
    that only need the boolean keep their existing contract.
    """
    return _post_result(payload, kind=kind, to=to).ok


def _post_result(payload: dict[str, Any], *, kind: str, to: str) -> WhatsAppSendResult:
    url = f"{_graph_api_base()}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=_TIMEOUT_SECONDS)
        r.raise_for_status()
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


def send_text(to: str, body: str) -> bool:
    """Send a free-form WhatsApp text message.

    Only works inside the 24h customer-service window per Meta policy;
    business-initiated messages must use `send_template` instead.
    """
    if not _is_configured():
        logger.debug("[WHATSAPP] Would send text to %s", mask_phone(to))
        return False
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "text",
        "text": {"body": body},
    }
    return _post(payload, kind="text", to=to)


def send_template(to: str, template: WhatsAppTemplate) -> bool:
    """Send a pre-approved WhatsApp template message (MEH-672).

    `template` is a typed `WhatsAppTemplate` instance — the template name,
    language code, and body parameters all come from it, so a param
    mismatch is caught at construction/type-check time instead of by a
    Meta 400 at runtime. `template.to_components()` emits an empty list
    for a zero-parameter template (no `components` block), preserving the
    pre-MEH-672 empty-params output byte-for-byte.
    """
    if not _is_configured():
        logger.debug(
            "[WHATSAPP] Would send template %s to %s", template.name, mask_phone(to)
        )
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
