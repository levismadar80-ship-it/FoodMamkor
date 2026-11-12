"""Email notifications for the experiences moderation flow.

All sends are best-effort via the shared send_email() helper (Resend HTTP API).
The admin_experiences router must never fail because an email didn't go out.

MEH-2952: every notifier takes `test_cause` — True when the host account or
its business is a seeded test row (`host_test_cause`) — and send_email then
sends nothing.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.services.email import send_email

logger = logging.getLogger(__name__)


def host_test_cause(host) -> bool:
    """MEH-2952: the host (a User) or the business she owns is a test row."""
    if host is None:
        return False
    producer = getattr(host, "producer", None)
    return bool(host.is_test or (producer is not None and producer.is_test))


def _send_email(
    to_email: str, subject: str, body: str, test_cause: bool = False
) -> None:
    send_email(to_email, subject, body, test_cause=test_cause)


# --- Templates ---


def notify_admin_new_submission(
    title: str,
    host_name: str,
    city: str | None,
    moderation_status: str,
    test_cause: bool = False,
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
    _send_email(settings.admin_email, subject, body, test_cause=test_cause)


def notify_host_approved(
    host_email: str, title: str, experience_id: str, test_cause: bool = False
) -> None:
    subject = f'מהמקור — החוויה "{title}" אושרה! 🌿'
    body = (
        f"שלום,\n\n"
        f'שמחים לבשר שהחוויה שהגשת, "{title}", אושרה ופורסמה במהמקור.\n'
        f"החוויה זמינה עכשיו לציבור הרחב.\n\n"
        f"לצפייה: {settings.frontend_url}/experiences/{experience_id}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body, test_cause=test_cause)


def notify_host_changes_requested(
    host_email: str,
    title: str,
    experience_id: str,
    feedback: str,
    test_cause: bool = False,
) -> None:
    feedback = feedback.replace("\r", "").replace("\n", " ")
    subject = f'מהמקור — נדרשים שינויים בחוויה "{title}"'
    body = (
        f"שלום,\n\n"
        f'צוות מהמקור עבר על החוויה שלך, "{title}", ומבקש כמה התאמות '
        f"לפני שנוכל לפרסם אותה.\n\n"
        f"הערות מהצוות:\n{feedback}\n\n"
        f"אחרי עדכון הפרטים, החוויה תחזור אוטומטית לתור האישור.\n"
        f"לעריכה: {settings.frontend_url}/experiences/{experience_id}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body, test_cause=test_cause)


def notify_host_rejected(
    host_email: str, title: str, reason: str, test_cause: bool = False
) -> None:
    reason = reason.replace("\r", "").replace("\n", " ") if reason else reason
    subject = f'מהמקור — עדכון לגבי החוויה "{title}"'
    reason_line = f"\nסיבה: {reason}\n" if reason else ""
    body = (
        f"שלום,\n\n"
        f'לצערנו החוויה "{title}" לא אושרה לפרסום במהמקור.{reason_line}\n'
        # MEH-1965: was the bare relative path "ב-/about". An email has no base
        # URL, so that rendered as literal unclickable text — in the one email
        # where the recipient most needs the contact route. Every other link in
        # every other email body in this repo interpolates settings.frontend_url;
        # this was the only exception (measured by grep across all send sites).
        f"ניתן לפנות אלינו לפרטים נוספים דרך טופס יצירת הקשר: "
        f"{settings.frontend_url}/about\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body, test_cause=test_cause)
