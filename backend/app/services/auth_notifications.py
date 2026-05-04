"""
Twilio + email notifications for the producer-registration flow.

Both functions are fire-and-forget background-task targets; both
fail-open so a Twilio outage cannot break producer signup. MEH-287
retained: every skip path emits logger.error with the exact missing
piece (phone, TWILIO_ACCOUNT_SID, TWILIO_WHATSAPP_FROM) so Railway /
Sentry surfaces the misconfiguration instead of silently failing.

Lifted verbatim from backend/app/routers/auth.py during the MEH-440
refactor.
"""

import logging

from app.config import settings
from app.services.email import send_email

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
    if not settings.twilio_account_sid:
        missing.append("TWILIO_ACCOUNT_SID")
    if not settings.twilio_whatsapp_from:
        missing.append("TWILIO_WHATSAPP_FROM")
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
    try:
        from twilio.rest import Client
        Client(settings.twilio_account_sid, settings.twilio_auth_token).messages.create(
            body=message,
            from_=settings.twilio_whatsapp_from,
            to=f"whatsapp:{phone}",
        )
        logger.info("[WHATSAPP] Producer welcome sent")
        return True
    except Exception as e:
        logger.error(
            f"[WHATSAPP] Producer welcome FAILED for {phone}: {e}", exc_info=True
        )
        return False


def notify_admin_new_producer(name: str, city: str | None) -> None:
    """Send WhatsApp + email notification to admin about new producer."""
    message = (
        f"בית עסק חדש: {name} - {city or 'לא צוין'}\n"
        f"לאישור: {settings.frontend_url}/admin"
    )
    # WhatsApp via Twilio
    if settings.twilio_account_sid and settings.admin_whatsapp_to:
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            client.messages.create(
                body=message,
                from_=settings.twilio_whatsapp_from,
                to=settings.admin_whatsapp_to,
            )
            logger.info("[WHATSAPP] Notification sent to admin")
        except Exception as e:
            logger.warning(f"[WHATSAPP] Failed: {e}")
    else:
        logger.debug(f"[WHATSAPP] Would send: {message}")

    # Email
    if settings.admin_email:
        send_email(settings.admin_email, f"מהמקור - בית עסק חדש: {name}", message)
