"""
Email + WhatsApp notifications for Events & Experiences.

Keeps the send logic in one place so both the public router (/events)
and the admin router (/admin/events) emit consistent messages.

All sends are best-effort — failures are logged but never raise.
"""
from __future__ import annotations

from app.config import settings


def _send_email(to_email: str, subject: str, body: str) -> None:
    """Best-effort email sender — logs and swallows all errors."""
    if not to_email:
        return
    if not settings.smtp_user:
        print(f"[EMAIL] Would send to {to_email}: {subject}\n{body}")
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
        print(f"[EMAIL] Sent to {to_email}")
    except Exception as e:  # noqa: BLE001 — notifications are best-effort
        print(f"[EMAIL] Failed to send to {to_email}: {e}")


def _send_whatsapp(to: str, body: str) -> None:
    if not to:
        return
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        print(f"[WHATSAPP] Would send to {to}: {body}")
        return
    try:
        from twilio.rest import Client

        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
        client.messages.create(
            body=body,
            from_=f"whatsapp:{settings.twilio_whatsapp_from}",
            to=f"whatsapp:{to}",
        )
    except Exception as e:  # noqa: BLE001
        print(f"[WHATSAPP] Failed to send to {to}: {e}")


# --- Event-specific templates ---


def notify_admin_new_event(event_title: str, host_name: str, city: str | None) -> None:
    """Email + WhatsApp to admin when a new event is submitted."""
    subject = f"מהמקור — אירוע חדש ממתין לאישור: {event_title}"
    body = (
        f"שלום,\n\n"
        f'אירוע חדש ממתין לאישור במהמקור: "{event_title}"\n'
        f"מארגן: {host_name}\n"
        f"עיר: {city or 'לא צוין'}\n\n"
        f"לעיון ואישור: {settings.frontend_url}/admin/events\n\n"
        f"בברכה,\nמערכת מהמקור"
    )
    if settings.admin_email:
        _send_email(settings.admin_email, subject, body)
    if settings.admin_whatsapp_to:
        _send_whatsapp(
            settings.admin_whatsapp_to,
            f'📅 אירוע חדש ממתין לאישור: "{event_title}" — {host_name}',
        )


def notify_host_approved(host_email: str, event_title: str, event_id: str) -> None:
    subject = f'מהמקור — האירוע "{event_title}" אושר! 🌿'
    body = (
        f"שלום,\n\n"
        f'שמחים לבשר שהאירוע שלך "{event_title}" אושר במהמקור! 🌿\n'
        f"הוא זמין כעת לציבור הרחב.\n\n"
        f"צפה בדף האירוע: {settings.frontend_url}/events/{event_id}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)


def notify_host_changes_requested(
    host_email: str, event_title: str, event_id: str, feedback: str
) -> None:
    subject = f'מהמקור — נדרשים שינויים באירוע "{event_title}"'
    body = (
        f"שלום,\n\n"
        f'האירוע שלך "{event_title}" דורש מספר התאמות לפני שיאושר.\n\n'
        f"הערות מהצוות:\n{feedback}\n\n"
        f"לעריכה: {settings.frontend_url}/events/{event_id}/edit\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)


def notify_host_rejected(host_email: str, event_title: str, reason: str) -> None:
    subject = f'מהמקור — עדכון לגבי האירוע "{event_title}"'
    reason_text = f"\nסיבה: {reason}\n" if reason else ""
    body = (
        f"שלום,\n\n"
        f'לצערנו האירוע "{event_title}" לא אושר לפרסום במהמקור.{reason_text}\n'
        f"ניתן לפנות אלינו לפרטים נוספים.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(host_email, subject, body)


def notify_followers_new_event(host_name: str, event_title: str) -> None:
    """Placeholder — v2 feature (producer followers table not yet in DB)."""
    print(f"[NOTIFY] Would notify followers of {host_name}: new event '{event_title}'")
