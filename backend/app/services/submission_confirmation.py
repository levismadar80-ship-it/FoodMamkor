"""
Module:   submission_confirmation
Purpose:  Confirm in writing, to the business owner, that a profile reached the
          review queue — fixing the submission timestamp and the "עד 3 ימי
          עסקים" promise the SLA is counted from.
Touches:  Resend (via services.email.send_email). No DB writes, no reads —
          every value it needs is passed in by the caller.
Does NOT: decide whether the submission was valid (submission_gate.py owns
          that), notify the admin (auth_notifications.notify_admin_new_producer,
          fired from the same endpoint), or nudge a business that has NOT
          submitted (pending_nudge.py).
Related:  app/routers/producer_me.py submit_for_review (the only caller),
          app/utils/clock.py (Israel-local date), MEH-2110's badge — the same
          promise, rendered on the admin's side of the queue.
History:  MEH-2112 (creation).

ON THE REPLY-TO, because the copy depends on it and the default sender cannot
honour it. The body invites the owner to "פשוט להשיב למייל הזה", but
`settings.email_from_address` is `מהמקור <noreply@mehamakor.online>`
(config.py:81) and Phase 0 found NO reply-to configured anywhere in the
backend. Sending this copy from that address would promise a channel that
bounces. Every send therefore sets an explicit reply-to (ruling 18/08), which
`send_email` gained an optional parameter for.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app.services.email import send_email
from app.utils.clock import ISRAEL_TZ

# The producer-facing support inbox. Same address the dashboard's support modal
# offers (frontend .../producer/dashboard/page.js:137), so a reply lands where
# a business owner asking for help would already have been sent.
#
# Deliberately a module constant and NOT a new env var: regression rule 8
# requires env additions to be listed and confirmed first, and this address is
# already hardcoded on the surface it mirrors.
SUPPORT_REPLY_TO = "support@mehamakor.online"

# Copy is Sapir-approved (17/08) and reproduced VERBATIM. Rule 22 makes
# user-facing copy her gate — do not reword, re-punctuate or "improve" it here.
_SUBJECT = "קיבלנו את הפרופיל — תשובה עד 3 ימי עסקים"

_BODY = """הפרופיל של {business_name} נשלח לבדיקה ב-{submitted_date}.
מה עכשיו? הצוות שלנו עובר על הפרטים ומאשר עד 3 ימי עסקים. ברגע שהעסק מאושר — הוא עולה לאתר ונעדכן אתכם במייל.
בינתיים אפשר להמשיך לעדכן את הפרופיל בלוח הבקרה — כל שינוי נשמר.
יש שאלה? אפשר פשוט להשיב למייל הזה."""


def _format_date(submitted_at: datetime) -> str:
    """Render the submission date as dd/mm/yyyy in ISRAEL local time.

    The house format for a Hebrew-facing date is `%d/%m/%Y`
    (admin_kashrut.py:220). The timezone conversion is the part that matters:
    the caller stamps `datetime.now(timezone.utc)`, and a submission at 23:30
    UTC is already the NEXT day in Israel — rendering the UTC date would tell
    the owner she submitted on a day she did not.

    A tz-naive value is treated as UTC, matching utils/clock: the column is
    `DateTime(timezone=True)`, but SQLite hands naive values back in tests and
    a raise here would be a fail-open promise broken over a formatting detail.
    """
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    return submitted_at.astimezone(ISRAEL_TZ).strftime("%d/%m/%Y")


def build_submission_confirmation(
    business_name: str, submitted_at: datetime
) -> tuple[str, str]:
    """Render (subject, body). Split out from the send so the copy can be
    asserted in tests without patching the mail transport."""
    return _SUBJECT, _BODY.format(
        business_name=business_name,
        submitted_date=_format_date(submitted_at),
    )


def send_submission_confirmation(
    to: str, business_name: str, submitted_at: datetime
) -> None:
    """Email the owner that her profile is in the review queue.

    Fail-open by construction: `send_email` never raises and never returns a
    value any caller inspects (see its module docstring). The submission has
    already been committed by the time this runs, so a Resend outage must not
    — and cannot — turn a successful submit into an error for the owner.
    """
    subject, body = build_submission_confirmation(business_name, submitted_at)
    send_email(to, subject, body, reply_to=SUPPORT_REPLY_TO)
