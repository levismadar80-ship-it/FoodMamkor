"""
WhatsApp + email notifications for the producer-registration flow.

Producer-facing notifications fail-open so a WhatsApp outage cannot
break producer signup or admin approval. MEH-287 retained: every skip
path emits logger.error with the exact missing piece (phone,
WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) so Railway / Sentry
surfaces the misconfiguration instead of silently failing.

Lifted verbatim from backend/app/routers/auth.py during the MEH-440
refactor; SDK swapped Twilio → Meta Cloud API in MEH-508; MEH-509 PR1
swapped the producer-facing welcome from free-text send_text to the
pre-approved producer_welcome_v1 template and added the symmetric
producer_approved_v1 hook for admin approval (works outside the 24h
customer-service window — required since approval can land days after
signup).
"""

import logging
from uuid import UUID

from app.config import settings
from app.services.email import send_email
from app.services.whatsapp import send_template, send_text
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)


def _normalize_il_phone(phone: str) -> str:
    """Strip hyphens/whitespace; prepend +972 if local 0… format."""
    phone = phone.replace("-", "").strip()
    if not phone.startswith("+"):
        phone = "+972" + phone.lstrip("0")
    return phone


def _producer_wa_preflight(name: str, phone: str | None, kind: str) -> bool:
    """Shared MEH-287 skip-and-log gate for producer-facing WhatsApp.

    `kind` is "welcome" / "approved" — only used in the log line so
    Railway/Sentry can distinguish which template was suppressed.
    """
    missing = []
    if not phone:
        missing.append("phone")
    if not settings.whatsapp_phone_number_id:
        missing.append("WHATSAPP_PHONE_NUMBER_ID")
    if not settings.whatsapp_access_token:
        missing.append("WHATSAPP_ACCESS_TOKEN")
    if missing:
        logger.error(
            f"[WHATSAPP] Producer {kind} SKIPPED for '{name}' — missing: {', '.join(missing)}"
        )
        return False
    return True


def notify_producer_registered(name: str, phone: str | None) -> bool:
    """Send WhatsApp welcome template to the new producer (MEH-509 PR1).

    Fires the Meta-approved ``producer_welcome_v1`` template with one
    positional param: business name. Returns True on success, False on
    skip/failure (MEH-287 contract preserved).
    """
    # MEH-509 PR1 prod-fix: template signature is 1 param (name only); the
    # original 2-param shape returned 400 from Meta. The earlier dashboard
    # URL construction was removed alongside the param — if a Quick-Reply
    # URL button is added to the template later, reintroduce it then.
    if not _producer_wa_preflight(name, phone, "welcome"):
        return False
    normalized = _normalize_il_phone(phone)
    try:
        ok = send_template(
            normalized,
            "producer_welcome_v1",
            [name],
            lang="he",
        )
    except Exception as e:  # belt-and-suspenders; send_template is fail-open
        logger.warning(
            f"[WHATSAPP] Producer welcome unexpected error for {mask_phone(normalized)}: {e}"
        )
        return False
    if ok:
        logger.info("[WHATSAPP] Producer welcome template sent")
        return True
    logger.error(f"[WHATSAPP] Producer welcome FAILED for {mask_phone(normalized)}")
    return False


def notify_producer_approved(
    name: str,
    phone: str | None,
    slug: str | None,  # noqa: ARG001 — kept in signature; callers pre-wired
    producer_id: UUID | str,  # noqa: ARG001 — kept in signature; callers pre-wired
) -> bool:
    """Send WhatsApp approval template once admin approves the producer.

    Fires ``producer_approved_v1`` with one positional param: business
    name. Returns True on success, False on skip/failure.
    """
    # MEH-509 PR1 prod-fix: template signature is 1 param (name only); the
    # original 2-param shape (name + page_url) returned 400 from Meta. The
    # slug-vs-id URL construction was removed alongside the second param —
    # if a Quick-Reply URL button is added to the template later,
    # reintroduce that branch in the same PR. `slug` + `producer_id` stay
    # in the signature so callers in routers/admin.py don't need to change.
    if not _producer_wa_preflight(name, phone, "approved"):
        return False
    normalized = _normalize_il_phone(phone)
    try:
        ok = send_template(
            normalized,
            "producer_approved_v1",
            [name],
            lang="he",
        )
    except Exception as e:  # belt-and-suspenders; send_template is fail-open
        logger.warning(
            f"[WHATSAPP] Producer approved unexpected error for {mask_phone(normalized)}: {e}"
        )
        return False
    if ok:
        logger.info("[WHATSAPP] Producer approved template sent")
        return True
    logger.error(f"[WHATSAPP] Producer approved FAILED for {mask_phone(normalized)}")
    return False


def notify_admin_new_producer(name: str, city: str | None) -> None:
    """Send WhatsApp + email notification to admin about new producer."""
    message = (
        f"בית עסק חדש: {name} - {city or 'לא צוין'}\n"
        f"לאישור: {settings.frontend_url}/admin"
    )
    # WhatsApp via Meta Cloud API (send_text fail-opens on missing config).
    if settings.admin_whatsapp_to:
        if send_text(settings.admin_whatsapp_to, message):
            logger.info("[WHATSAPP] Notification sent to admin")
    else:
        logger.debug(f"[WHATSAPP] Would send: {message}")

    # Email
    if settings.admin_email:
        send_email(settings.admin_email, f"מהמקור - בית עסק חדש: {name}", message)
