"""Email notifications for recipe and kashrut moderation, and for reviews.

MEH-2602: the staging sweep (29/10) found that an owner hears nothing when
the team approves her recipe or her kashrut certificate, when a buyer leaves
a review, and that a buyer hears nothing when the owner answers. Experiences
already mail on every moderation outcome (experience_notifications.py); this
module gives the other surfaces the same courtesy and copies its tone.

All sends are best-effort through send_email() (Resend, fail-open). Callers
queue them as background tasks, so a mail problem never fails a request.
"""

from __future__ import annotations

from app.config import settings
from app.services.email import send_email


def _one_line(text: str | None) -> str:
    # Same header-injection guard as experience_notifications: the admin's
    # free text never carries a line break into the mail.
    return (text or "").replace("\r", "").replace("\n", " ").strip()


def _link(path: str) -> str:
    return f"{settings.frontend_url}{path}"


# --- Recipes (admin_recipes.py) ---


def notify_recipe_approved(to_email: str, title: str, path: str) -> None:
    subject = f'מהמקור — המתכון "{title}" אושר ופורסם 🌿'
    body = (
        f"שלום,\n\n"
        f'המתכון "{title}" אושר ומופיע עכשיו בדף בית העסק שלך במהמקור.\n\n'
        f"לצפייה: {_link(path)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


def notify_recipe_changes_requested(to_email: str, title: str, feedback: str) -> None:
    subject = f'מהמקור — נדרשים שינויים במתכון "{title}"'
    body = (
        f"שלום,\n\n"
        f'עברנו על המתכון "{title}" ונשמח לכמה התאמות לפני שנפרסם אותו.\n\n'
        f"הערות מהצוות:\n{_one_line(feedback)}\n\n"
        f"אחרי העדכון המתכון יחזור לבדיקה.\n"
        f"לעריכה: {_link('/producer/dashboard/recipes')}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


def notify_recipe_rejected(to_email: str, title: str, reason: str | None) -> None:
    subject = f'מהמקור — עדכון לגבי המתכון "{title}"'
    reason_line = f"\nסיבה: {_one_line(reason)}\n" if _one_line(reason) else ""
    body = (
        f"שלום,\n\n"
        f'לצערנו המתכון "{title}" לא אושר לפרסום.{reason_line}\n'
        f"אפשר תמיד להעלות מתכון חדש מלוח הבקרה: "
        f"{_link('/producer/dashboard/recipes')}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


# --- Kashrut (admin_kashrut.py) ---


def notify_kashrut_approved(
    to_email: str, producer_name: str, expires_on: str, path: str
) -> None:
    subject = "מהמקור — תעודת הכשרות אושרה ✓"
    body = (
        f"שלום,\n\n"
        f'תעודת הכשרות של "{producer_name}" אושרה, ותג הכשרות מופיע עכשיו '
        f"בדף בית העסק.\n"
        f"התעודה רשומה אצלנו בתוקף עד {expires_on}. לפני שהיא פגה אפשר "
        f"להעלות תעודה מחודשת מלוח הבקרה.\n\n"
        f"לצפייה: {_link(path)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


def notify_kashrut_rejected(
    to_email: str, producer_name: str, notes: str | None
) -> None:
    subject = "מהמקור — עדכון לגבי תעודת הכשרות"
    reason_line = f"\nהערות מהצוות: {_one_line(notes)}\n" if _one_line(notes) else ""
    body = (
        f"שלום,\n\n"
        f'לא יכולנו לאשר את תעודת הכשרות שהועלתה עבור "{producer_name}".'
        f"{reason_line}\n"
        f"אפשר להעלות תעודה מעודכנת מלוח הבקרה: "
        f"{_link('/producer/dashboard/edit')}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


# --- Reviews (reviews.py) ---


def notify_owner_new_review(
    to_email: str, producer_name: str, stars: int, path: str
) -> None:
    subject = f"מהמקור — ביקורת חדשה על {producer_name}"
    body = (
        f"שלום,\n\n"
        f'לקוח השאיר ביקורת חדשה על "{producer_name}" ({stars} מתוך 5).\n'
        f"אפשר לקרוא אותה ולהגיב מדף בית העסק.\n\n"
        f"לביקורת: {_link(path)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)


def notify_reviewer_reply(to_email: str, producer_name: str, path: str) -> None:
    subject = f"מהמקור — {producer_name} הגיבו לביקורת שלך"
    body = (
        f"שלום,\n\n"
        f'"{producer_name}" הגיבו לביקורת שכתבת במהמקור.\n\n'
        f"לקריאת התגובה: {_link(path)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    send_email(to_email, subject, body)
