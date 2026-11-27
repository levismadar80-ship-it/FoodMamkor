"""
Module:   draft_merge_emails
Purpose:  The two emails of the draft-twin flow (MEH-3865): the admin hears
          that a business sent for review looks like a draft she prepared, and
          the owner hears that the prepared page is now in his account.
Touches:  Resend (send_email). Reads nothing.
Does NOT: decide whether two businesses match (services/draft_twins.py) or
          move anything (routers/admin_draft_merge.py). Never tells the owner
          about a draft before the admin merged it.
Related:  services/auth_notifications.py notify_admin_draft_claimed (the same
          admin email shape) · services/auth_emails.py send_welcome_email
          (the owner greeting).
History:  MEH-3865 (creation). Copy: approved table on MEH-3865.
          MEH-3884: notify_admin_identity_matches — a business that looks like
          ANY existing one (with an owner or without), at signup and at
          submit-for-review. Copy: table on MEH-3883.
"""

import logging
from typing import TYPE_CHECKING

from app.config import settings
from app.services.auth_notifications import _sanitize_wa_param, _skip_test_cause
from app.services.email import send_email

if TYPE_CHECKING:  # MEH-3884: business_identity imports this module lazily
    from app.services.business_identity import IdentityMatch

logger = logging.getLogger(__name__)

# One short label per reason code of services/draft_twins.py.
REASON_LABELS = {
    "phone": "אותו טלפון",
    "email": "אותו מייל",
    "instagram": "אותו אינסטגרם",
    "website": "אותו אתר",
    "facebook": "אותו פייסבוק",
    "name_city": "אותו שם, אותה עיר",
    "name_contains_city": "שם דומה, אותה עיר",
}


def reasons_text(reasons: list[str]) -> str:
    return " · ".join(REASON_LABELS.get(r, r) for r in reasons)


def notify_admin_draft_twin(
    target_name: str,
    draft_name: str,
    reasons: list[str],
    test_cause: bool = False,
) -> None:
    """A business was sent for review, and a draft without an owner matches it."""
    if test_cause:
        _skip_test_cause("notify_admin_draft_twin", None)
        return
    # Both names were typed outside Mehamakor (the owner's one certainly):
    # flatten each so a crafted value cannot add a line to the message.
    safe_target = _sanitize_wa_param(target_name) or "ללא שם"
    safe_draft = _sanitize_wa_param(draft_name) or "ללא שם"
    subject = f"מהמקור - ייתכן שיש טיוטה מוכנה ל{safe_target}"
    message = (
        f"{safe_target} נשלח לבדיקה, ויש טיוטה בלי בעלים שנראית כמו אותו עסק: {safe_draft}."
        f"\nלמה: {reasons_text(reasons)}"
        f"\nאפשר להעביר אותה אליו מהאדמין: {settings.frontend_url}/admin/producers"
    )
    try:
        if settings.admin_email:
            send_email(settings.admin_email, subject, message, test_cause=test_cause)
    except Exception as e:  # noqa: BLE001 — fire-and-forget, log with context
        logger.error("[NOTIFY] Draft-twin email FAILED for '%s': %s", safe_target, e)


# MEH-3884: where the new business was noticed.
IDENTITY_MOMENTS = {
    "signup": "נרשם עכשיו",
    "submit": "נשלח עכשיו לבדיקה",
}


# MEH-3884: at most this many businesses are named in one email; the rest
# are counted (one common phone must not flood the admin's inbox).
MAX_IDENTITY_MATCHES_LISTED = 5


def notify_admin_identity_matches(
    new_name: str,
    matches: "list[IdentityMatch]",
    moment: str,
    test_cause: bool = False,
) -> None:
    """One email: a business that looks like one or more we already have."""
    if test_cause:
        _skip_test_cause("notify_admin_identity_matches", None)
        return
    # Every name and email was typed outside Mehamakor: flatten each so a
    # crafted value cannot add a line to the message (as notify_admin_draft_twin).
    safe_new = _sanitize_wa_param(new_name) or "ללא שם"
    lines = []
    for m in matches[:MAX_IDENTITY_MATCHES_LISTED]:
        existing = _sanitize_wa_param(m.name or "") or "ללא שם"
        owner = _sanitize_wa_param(m.owner_email or "") or "אין בעלים"
        lines.append(f"- {existing} (חשבון: {owner}). למה: {reasons_text(m.reasons)}")
    extra = len(matches) - MAX_IDENTITY_MATCHES_LISTED
    if extra > 0:
        lines.append(f"ועוד {extra}.")
    subject = f"מהמקור - ייתכן שיש כבר עמוד ל{safe_new}"
    message = (
        f"{safe_new} {IDENTITY_MOMENTS.get(moment, moment)}, ונראה כמו עסק שכבר יש באתר:\n"
        + "\n".join(lines)
        + f"\nכדאי לבדוק באדמין: {settings.frontend_url}/admin/producers"
    )
    try:
        if settings.admin_email:
            send_email(settings.admin_email, subject, message, test_cause=test_cause)
    except Exception as e:  # noqa: BLE001 — fire-and-forget, log with context
        logger.error("[NOTIFY] Identity-match email FAILED for '%s': %s", safe_new, e)


def send_owner_draft_merged(
    email: str,
    name: str | None,
    draft_name: str,
    test_cause: bool = False,
) -> None:
    """The owner's prepared page is now the page in his account."""
    first_name = ((name or "").split() or [""])[0]
    greeting = f"שלום {first_name}," if first_name else "שלום,"
    safe_draft = _sanitize_wa_param(draft_name) or "העסק"
    body = (
        f"{greeting}\n\n"
        f"הכנו מראש עמוד ל{safe_draft} במהמקור, וחיברנו אותו לחשבון שלכם.\n"
        f"המוצרים והפרטים שהוספתם עברו אליו, ואין יותר עמוד כפול.\n\n"
        f"אפשר לבדוק את העמוד ולהשלים אותו בלוח הבקרה: "
        f"{settings.frontend_url}/producer/dashboard\n\n"
        f"יש שאלה? אפשר פשוט להשיב למייל הזה.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    try:
        send_email(
            email,
            "מהמקור - העמוד שהכנו לכם חובר לחשבון",
            body,
            test_cause=test_cause,
        )
    except Exception as e:  # noqa: BLE001 — fire-and-forget, log with context
        logger.error("[EMAIL] Draft-merged email FAILED: %s", e)
