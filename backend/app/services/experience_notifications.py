"""SMTP notifications for the experiences moderation flow.

All sends are best-effort: missing SMTP config or any send error is
logged and swallowed. The admin_experiences router must never fail
because an email didn't go out — a stale queue is much better than
a broken moderation button.

Matches the shape of _send_notification_email() in app/routers/admin.py
but lives in its own module so the admin_experiences router can call
it cleanly without importing from admin.py (which would be a circular
reference risk once admin.py grows).
"""
from __future__ import annotations

import logging

from app.config import settings

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, body: str) -> None:
    if not to_email:
        return
    if not settings.smtp_user:
        logger.info(
            "[experience-email] SMTP not configured; would send to %s: %s",
            to_email, subject,
        )
        return
    try:
        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = settings.smtp_user
        msg["To"] = to_email

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        logger.info("[experience-email] sent to %s: %s", to_email, subject)
    except Exception as e:  # noqa: BLE001 — fail-open
        logger.warning(
            "[experience-email] failed to send to %s: %s", to_email, e
        )


# --- Templates ---


def notify_admin_new_submission(
    title: str, host_name: str, city: str | None, moderation_status: str
) -> None:
    """Fired from POST /experiences once the row is persisted."""
    if not settings.admin_email:
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
    subject = f'מהמקור — עדכון לגבי החוויה "{title}"'
    reason_line = f"\nסיבה: {reason}\n" if reason else ""
    body = (
        f"שלום,\n\n"
        f'לצערנו החוויה "{title}" לא אושרה לפרסום במהמקור.{reason_line}\n'
        f"ניתן לפנות אלינו לפרטים נוספים דרך טופס יצירת הקשר ב-/about.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)
