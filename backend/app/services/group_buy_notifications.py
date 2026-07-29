"""Email notifications for the group-buy open->funded transition.

Module:   group_buy_notifications
Purpose:  Tell both sides that a group buy reached its goal — the business that
          it is funded and by how many participants, each participant that they
          should reach out to arrange the order.
Touches:  Resend (via app.services.email.send_email). No DB access: every
          recipient address and count is resolved by the router while the
          request-scoped Session is still open, then passed in as plain data.
Does NOT: resolve recipients, own idempotency, or expose a participant roster.
          The `funded_notified_at` latch lives in the router
          (routers/group_buys.py); the deliberate absence of a participant-list
          endpoint is the MEH-1651 ruling, not an oversight.
Related:  backend/app/services/experience_notifications.py (same best-effort
          shape); backend/app/routers/group_buys.py:_maybe_notify_funded
History:  MEH-1651 (creation)

All sends are best-effort via the shared send_email() helper (Resend HTTP API).
The group_buys router must never fail because an email didn't go out — a
participant's join is confirmed by the 201, not by the notification.

PRIVACY CONTRACT (MEH-1651, Amendment 13 to the Privacy Protection Law):
no message body composed here may carry a phone number or an email address of
any party. The business learns a participant COUNT, never a roster; each
participant learns the business NAME, never its contact record. Both messages
point at the public group page, which is the only place contact happens. The
guard for this is an absence assertion over the rendered bodies in
tests/test_group_buys_api.py — extend it alongside any new template here.

# DO NOT interpolate a participant list, phone, or email into any body below.
#        That is the Eventbrite model the MEH-1651 ruling explicitly rejected.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.services.email import send_email

logger = logging.getLogger(__name__)


def _send_email(to_email: str, subject: str, body: str) -> None:
    send_email(to_email, subject, body)


def _group_buy_url(group_buy_id: str) -> str:
    return f"{settings.frontend_url}/group-buys/{group_buy_id}"


# --- Templates ---


def notify_producer_funded(
    producer_email: str, title: str, participant_count: int, group_buy_id: str
) -> None:
    """Fired on the open->funded transition, to the business account email.

    Carries a COUNT, never a roster — see the module PRIVACY CONTRACT.
    """
    subject = f'מהמקור — קבוצת הרכש "{title}" הגיעה ליעד'
    body = (
        f"שלום,\n\n"
        f'קבוצת הרכש "{title}" הגיעה ליעד.\n'
        f"מספר משתתפות: {participant_count}\n\n"
        f"המשתתפות קיבלו הודעה ויפנו אליך לתיאום ההזמנה.\n\n"
        f"לצפייה בקבוצה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(producer_email, subject, body)


def notify_participant_funded(
    participant_email: str, title: str, producer_name: str, group_buy_id: str
) -> None:
    """Fired on the open->funded transition, once per participant.

    Direction of contact is participant -> business, matching MEH-1650's
    wording and every other contact surface on the site. The business name is
    not a contact detail; no number or address is carried.
    """
    subject = f'מהמקור — הקבוצה "{title}" הגיעה ליעד'
    body = (
        f"שלום,\n\n"
        f'הקבוצה שהצטרפת אליה, "{title}", הגיעה ליעד.\n'
        f"לתיאום ההזמנה צרו קשר עם {producer_name}.\n\n"
        f"לצפייה בקבוצה ובפרטי ההזמנה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(participant_email, subject, body)


def send_funded_notifications(
    producer_email: str | None,
    participant_emails: list[str],
    title: str,
    producer_name: str,
    group_buy_id: str,
) -> None:
    """BackgroundTasks entry point — dispatches both sides, never raises.

    MEH-1533: Sentry has no capture_exception wired into background tasks, so an
    exception escaping here would vanish with no trace anywhere. send_email() is
    already fail-open per-call (MEH-1613), but template interpolation and the
    loop itself are not — hence the explicit try/except + logger.exception at
    every level. One participant's failure must not cost the rest their email.
    """
    if producer_email:
        try:
            notify_producer_funded(
                producer_email, title, len(participant_emails), group_buy_id
            )
        except Exception:  # noqa: BLE001 — best-effort; router already returned
            logger.exception(
                "[group-buy] funded notification to business failed (group_buy=%s)",
                group_buy_id,
            )
    else:
        logger.warning(
            "[group-buy] no account email for the business — funded notification "
            "skipped (group_buy=%s)",
            group_buy_id,
        )

    for participant_email in participant_emails:
        if not participant_email:
            continue
        try:
            notify_participant_funded(
                participant_email, title, producer_name, group_buy_id
            )
        except Exception:  # noqa: BLE001 — one failure must not stop the rest
            logger.exception(
                "[group-buy] funded notification to a participant failed "
                "(group_buy=%s)",
                group_buy_id,
            )
