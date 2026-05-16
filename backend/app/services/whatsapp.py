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
"""

from __future__ import annotations

import logging

import httpx

from app.config import settings
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0


def _graph_api_base() -> str:
    return f"https://graph.facebook.com/{settings.whatsapp_api_version}"


def _is_configured() -> bool:
    return bool(settings.whatsapp_phone_number_id and settings.whatsapp_access_token)


def _post(payload: dict, *, kind: str, to: str) -> bool:
    url = f"{_graph_api_base()}/{settings.whatsapp_phone_number_id}/messages"
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    try:
        r = httpx.post(url, json=payload, headers=headers, timeout=_TIMEOUT_SECONDS)
        r.raise_for_status()
        return True
    except httpx.HTTPError as e:
        logger.warning("[WHATSAPP] %s send failed to %s: %s", kind, mask_phone(to), e)
        return False


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


def send_template(
    to: str,
    template_name: str,
    params: list[str],
    lang: str = "he",
) -> bool:
    """Send a pre-approved WhatsApp template message.

    `params` are positional body parameters substituted into `{{1}}`,
    `{{2}}`, … placeholders defined in the template. An empty list emits
    no `components` block (templates with no body parameters).
    """
    if not _is_configured():
        logger.debug(
            "[WHATSAPP] Would send template %s to %s", template_name, mask_phone(to)
        )
        return False
    components = (
        [
            {
                "type": "body",
                "parameters": [{"type": "text", "text": p} for p in params],
            }
        ]
        if params
        else []
    )
    payload = {
        "messaging_product": "whatsapp",
        "to": to.lstrip("+"),
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": lang},
            "components": components,
        },
    }
    return _post(payload, kind=f"template[{template_name}]", to=to)
