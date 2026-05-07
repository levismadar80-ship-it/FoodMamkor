"""Email notifications for the experiences moderation flow.

All sends are best-effort via the shared send_email() helper (Resend HTTP API).
The admin_experiences router must never fail because an email didn't go out.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.services.email import send_email

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, body: str) -> None:
    send_email(to_email, subject, body)


# --- Templates ---


def notify_admin_new_submission(
    title: str, host_name: str, city: str | None, moderation_status: str
) -> None:
    """Fired from POST /experiences once the row is persisted."""
    if not settings.admin_email:
        logger.debug("[notifications] ADMIN_EMAIL not set — admin notification skipped")
        return
    subject = f"מהמקור — חוויה חדשה ממתינה לאישור: {title}"
    flag_line = (
        "⚠️ Claude סימן כ-FLAGGED — כדאי להסתכל מהר."
        if moderation_status == "FLAGGED"
        else ""
    )
    body = (
        f"שלום,\n\n"
        f'חוויה חדשה בהמתנה: "{title}"\n'
        f"מארחת: {host_name}\n"
        f"עיר: {city or 'לא צוין'}\n"
        f"Claude pre-moderation: {moderation_status}\n"
        f"{flag_line}\n\n"
        f"לעיון ואישור: {settings.frontend_url}/admin/experiences\n\n"
        f"בברכה,\nמערכת מהמקור"
    )
    _send_email(settings.admin_email, subject, body)


def notify_host_approved(host_email: str, title: str, experience_id: str) -> None:
    subject = f'מהמקור — החוויה "{title}" אושרה! 🌿'
    body = (
        f"שלום,\n\n"
        f'שמחים לבשר שהחוויה שהגשת, "{title}", אושרה ופורסמה במהמקור.\n'
        f"החוויה זמינה עכשיו לציבור הרחב.\n\n"
        f"לצפייה: {settings.frontend_url}/experiences/{experience_id}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)


def notify_host_changes_requested(
    host_email: str, title: str, experience_id: str, feedback: str
) -> None:
    feedback = feedback.replace("\r", "").replace("\n", " ")
    subject = f'מהמקור — נדרשים שינויים בחוויה "{title}"'
    body = (
        f"שלום,\n\n"
        f'צוות מהמקור עבר על החוויה שלך, "{title}", ומבקש כמה התאמות '
        f"לפני שנוכל לפרסם אותה.\n\n"
        f"הערות מהצוות:\n{feedback}\n\n"
        f"אחרי שתעדכני את הפרטים, החוויה תחזור אוטומטית לתור האישור.\n"
        f"לעריכה: {settings.frontend_url}/experiences/{experience_id}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)


def notify_host_rejected(host_email: str, title: str, reason: str) -> None:
    reason = reason.replace("\r", "").replace("\n", " ") if reason else reason
    subject = f'מהמקור — עדכון לגבי החוויה "{title}"'
    reason_line = f"\nסיבה: {reason}\n" if reason else ""
    body = (
        f"שלום,\n\n"
        f'לצערנו החוויה "{title}" לא אושרה לפרסום במהמקור.{reason_line}\n'
        f"ניתן לפנות אלינו לפרטים נוספים דרך טופס יצירת הקשר ב-/about.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)
