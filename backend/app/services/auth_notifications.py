"""
WhatsApp + email notifications for the producer-registration flow.

Both functions are fire-and-forget background-task targets; both
fail-open so a WhatsApp outage cannot break producer signup. MEH-287
retained: every skip path emits logger.error with the exact missing
piece (phone, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN) so
Railway / Sentry surfaces the misconfiguration instead of silently
failing.

Lifted verbatim from backend/app/routers/auth.py during the MEH-440
refactor; SDK swapped Twilio → Meta Cloud API in MEH-508.
"""

import logging

from app.config import settings
from app.services.email import send_email
from app.services.whatsapp import send_text
from app.utils.pii import mask_phone

logger = logging.getLogger(__name__)


def notify_producer_registered(name: str, phone: str | None) -> bool:
    """Send WhatsApp welcome + profile-completion link to the new producer.

    MEH-287: returns True on success, False on skip/failure. Any skip
    now emits logger.error with the exact missing piece so Railway /
    Sentry surfaces the misconfiguration instead of silently failing.
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
            f"[WHATSAPP] Producer welcome SKIPPED for '{name}' — missing: {', '.join(missing)}"
        )
        return False
    phone = phone.replace("-", "").strip()
    if not phone.startswith("+"):
        phone = "+972" + phone.lstrip("0")
    message = (
        f"ברוכה הבאה למהמקור! 🌿\n"
        f"העסק '{name}' נרשם בהצלחה.\n"
        f"השלימי את הפרופיל כדי שלקוחות יוכלו למצוא אותך:\n"
        f"{settings.frontend_url}/producer/dashboard"
    )
    if send_text(phone, message):
        logger.info("[WHATSAPP] Producer welcome sent")
        return True
    # send_text already logs the HTTP-error path with mask_phone; this
    # MEH-287 line preserves the per-recipient error trail at this layer.
    logger.error(
        f"[WHATSAPP] Producer welcome FAILED for {mask_phone(phone)}",
    )
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
