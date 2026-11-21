"""
Module:   admin_whatsapp
Purpose:  The one way to ping the admin on WhatsApp about something that is
          not «a business waits for approval»: the approved AdminUpdateV1
          template, never free text.
Touches:  Meta WhatsApp Cloud API (through services/whatsapp.send_template).
Does NOT: send the matching email (each notifier keeps its own send_email, in
          its own try, so a WhatsApp failure never skips it); handle the
          «waiting for approval» pings (AdminBusinessPendingV1, MEH-3147).
Related:  app/services/whatsapp_templates.py AdminUpdateV1;
          tests/test_meh3589_admin_whatsapp.py (guard: no send_text to the
          admin anywhere in app/).
History:  MEH-3589 (creation) — eight free-text pings that Meta only delivers
          inside the 24h customer-service window, so most never arrived.
"""

from __future__ import annotations

import logging
import re

from app.config import settings
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import AdminUpdateV1

logger = logging.getLogger(__name__)

# Topic and detail together stay well under Meta's 1,024-char body limit.
_TOPIC_MAX = 80
_DETAIL_MAX = 400


def _one_line(text: str, limit: int) -> str:
    """Meta rejects a parameter with a newline, a tab or 4+ spaces (132000)."""
    flat = re.sub(r"\s+", " ", text or "").strip()
    return flat[:limit] or "-"


def ping_admin(topic: str, detail: str, *, test_cause: bool = False) -> bool:
    """Send AdminUpdateV1 to ADMIN_WHATSAPP_TO. Fail-open: never raises.

    Returns True only when Meta accepted the send. No ADMIN_WHATSAPP_TO →
    False and nothing sent; test_cause → dropped by send_template (MEH-2952).
    """
    if not settings.admin_whatsapp_to:
        logger.debug("[WHATSAPP] admin ping skipped — ADMIN_WHATSAPP_TO not set")
        return False
    template = AdminUpdateV1(
        topic=_one_line(topic, _TOPIC_MAX), detail=_one_line(detail, _DETAIL_MAX)
    )
    try:
        ok = send_template(settings.admin_whatsapp_to, template, test_cause=test_cause)
    except Exception:  # noqa: BLE001 — a WhatsApp fault must not break the caller
        logger.exception("[WHATSAPP] admin ping raised (topic=%s)", template.topic)
        return False
    if not ok:
        logger.warning("[WHATSAPP] admin ping NOT delivered (topic=%s)", template.topic)
    return ok
