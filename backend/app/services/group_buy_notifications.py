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
point at the public group page; the participant message also links the public
business page (MEH-2453), which shows what that page already shows anyone. No
contact detail is ever written INTO a body. The
guard for this is an absence assertion over the rendered bodies in
tests/test_group_buys_api.py — extend it alongside any new template here.

# DO NOT interpolate a participant list, phone, or email into any body below.
#        That is the Eventbrite model the MEH-1651 ruling explicitly rejected.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.config import settings
from app.services.email import send_email
from app.utils.clock import ISRAEL_TZ

logger = logging.getLogger(__name__)


def _send_email(
    to_email: str, subject: str, body: str, test_cause: bool = False
) -> None:
    send_email(to_email, subject, body, test_cause=test_cause)


def _group_buy_url(group_buy_id: str) -> str:
    return f"{settings.frontend_url}/group-buys/{group_buy_id}"


def _producer_url(producer_id: str) -> str:
    # The UUID route, not the slug: it always resolves, and the email has no
    # DB access to read a slug (see the module header).
    return f"{settings.frontend_url}/producer/{producer_id}"


# --- Templates ---


def notify_producer_funded(
    producer_email: str,
    title: str,
    participant_count: int,
    group_buy_id: str,
    test_cause: bool = False,
) -> None:
    """Fired on the open->funded transition, to the business account email.

    Carries a COUNT, never a roster — see the module PRIVACY CONTRACT.
    """
    subject = f'מהמקור — קבוצת הרכישה "{title}" הגיעה ליעד'
    body = (
        f"שלום,\n\n"
        f'קבוצת הרכישה "{title}" הגיעה ליעד.\n'
        f"מספר הצטרפויות: {participant_count}\n\n"
        f"נשלחה הודעה לכל מי שהצטרף, ופניות לתיאום ההזמנה יגיעו ישירות לעסק.\n\n"
        f"לצפייה בקבוצה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(producer_email, subject, body, test_cause=test_cause)


def notify_participant_funded(  # noqa: PLR0913 — +test_cause, the MEH-2952 send-layer switch
    participant_email: str,
    title: str,
    producer_name: str,
    group_buy_id: str,
    producer_id: str,
    test_cause: bool = False,
    pickup: str = "",
) -> None:
    """Fired on the open->funded transition, once per participant.

    MEH-3597: `pickup` = the group's pickup time and pickup / delivery notes
    (group_buy_pickup_text.pickup_lines), so she knows when and where.

    Direction of contact is participant -> business, matching MEH-1650's
    wording and every other contact surface on the site. The business name is
    not a contact detail; no number or address is carried. The pickup and
    delivery notes are the business's own public text from the group page
    (MEH-3597), not its contact record.
    """
    subject = f'מהמקור — הקבוצה "{title}" הגיעה ליעד'
    body = (
        f"שלום,\n\n"
        f'הקבוצה שהצטרפתם אליה, "{title}", הגיעה ליעד.\n'
        f"לתיאום ההזמנה צרו קשר עם {producer_name}.\n\n"
        + (f"{pickup}\n" if pickup else "")
        # MEH-2453: the business page shows its delivery areas and pickup
        # points. A link to the page, never its contact record.
        + f"לדף העסק: {_producer_url(producer_id)}\n"
        f"לצפייה בקבוצה ובפרטי ההזמנה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(participant_email, subject, body, test_cause=test_cause)


# noqa below: a BackgroundTasks entry point takes plain data only (no DB access,
# see the module header), so every value the two templates need is an argument.
def send_funded_notifications(  # noqa: PLR0913
    producer_email: str | None,
    participant_emails: list[str],
    title: str,
    producer_name: str,
    group_buy_id: str,
    producer_id: str,
    test_cause: bool = False,
    late_joiner: bool = False,
    pickup: str = "",
) -> None:
    """BackgroundTasks entry point — dispatches both sides, never raises.

    MEH-3289: ``late_joiner`` = one participant joined a group that was
    already funded; only she is mailed, the business was told at funding.

    MEH-2952: `test_cause` — the business is a seeded test row; every mail
    this group buy causes (business and participants) is dropped and logged.

    MEH-1533: Sentry has no capture_exception wired into background tasks, so an
    exception escaping here would vanish with no trace anywhere. send_email() is
    already fail-open per-call (MEH-1613), but template interpolation and the
    loop itself are not — hence the explicit try/except + logger.exception at
    every level. One participant's failure must not cost the rest their email.
    """
    if producer_email and not late_joiner:
        try:
            notify_producer_funded(
                producer_email,
                title,
                len(participant_emails),
                group_buy_id,
                test_cause=test_cause,
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
                participant_email,
                title,
                producer_name,
                group_buy_id,
                producer_id,
                test_cause=test_cause,
                pickup=pickup,
            )
        except Exception:  # noqa: BLE001 — one failure must not stop the rest
            logger.exception(
                "[group-buy] funded notification to a participant failed "
                "(group_buy=%s)",
                group_buy_id,
            )


# --- Cancel (MEH-2435 chunk 4) ---


def notify_participant_joined(  # noqa: PLR0913 — +test_cause, the MEH-2952 send-layer switch
    participant_email: str,
    title: str,
    quantity: int,
    joined: int,
    goal: int,
    deadline: datetime,
    group_buy_id: str,
    test_cause: bool = False,
) -> None:
    """MEH-3591: the joiner's confirmation, for a join that did not fund the group.

    A join that funds it (or joins an already-funded group) gets the funded
    email instead, so she never gets two. Counts only, no roster and no
    contact details — see the module PRIVACY CONTRACT. `deadline` is naive
    UTC, as stored; it is shown as the Israel date.
    """
    # MEH-1533: an exception escaping a background task leaves no trace, so
    # the formatting is inside the guard too, as in send_funded_notifications.
    try:
        day = deadline.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)
        subject = f'מהמקור — ההצטרפות לקבוצה "{title}" נקלטה'
        body = (
            f"שלום,\n\n"
            f'ההצטרפות לקבוצה "{title}" נקלטה. הכמות שנבחרה: {quantity}.\n'
            f"עד עכשיו הצטרפו {joined} מתוך {goal} שצריך כדי שהקבוצה תצא לדרך.\n\n"
            f"נעדכן במייל כשהקבוצה תגיע ליעד, או אם עד {day:%d.%m.%Y} היא לא תגיע אליו.\n"
            f"אפשר לבטל את ההצטרפות מדף הקבוצה עד המועד הזה.\n\n"
            f"לצפייה בקבוצה: {_group_buy_url(group_buy_id)}\n\n"
            f"בברכה,\nצוות מהמקור"
        )
        _send_email(participant_email, subject, body, test_cause=test_cause)
    except Exception:
        logger.exception(
            "[GROUP_BUY] join confirmation failed group_buy_id=%s", group_buy_id
        )


def notify_participant_cancelled(
    participant_email: str, title: str, producer_name: str, test_cause: bool = False
) -> None:
    """Fired when the business cancels or closes its group buy, once per participant.

    Wording approved by Sapir 27/10/2026. No link: a cancelled group is off the
    site. Same direction of contact as the funded email (participant ->
    business), by NAME only — see the module PRIVACY CONTRACT.
    """
    subject = f'מהמקור — הקבוצה "{title}" בוטלה'
    body = (
        f"שלום,\n\n"
        f'הקבוצה שהצטרפתם אליה, "{title}", בוטלה על ידי {producer_name}.\n'
        f"לשאלות צרו קשר עם {producer_name}.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(participant_email, subject, body, test_cause=test_cause)


def notify_participant_cancelled_delisted(
    participant_email: str, title: str, producer_name: str, test_cause: bool = False
) -> None:
    """MEH-2498: the group was cancelled because the SITE took the business off.

    Not the business's own cancel, so the wording of notify_participant_cancelled
    («בוטלה על ידי {name}. לשאלות צרו קשר עם {name}») would be false here. Same
    subject and shape; no link (the group is off the site) and no contact
    details (PRIVACY CONTRACT); the reason for the delisting is not given.
    Decided under Sapir's delegation 28/10/2026.
    """
    subject = f'מהמקור — הקבוצה "{title}" בוטלה'
    body = (
        f"שלום,\n\n"
        f'הקבוצה שהצטרפתם אליה, "{title}", בוטלה כי בית העסק {producer_name} '
        f"כבר לא מופיע במהמקור.\n"
        f"אם סיכמתם משהו ישירות מול בית העסק, אפשר להמשיך מולו כרגיל.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(participant_email, subject, body, test_cause=test_cause)


def send_cancelled_notifications(  # noqa: PLR0913 — +test_cause, the MEH-2952 send-layer switch
    participant_emails: list[str],
    title: str,
    producer_name: str,
    group_buy_id: str,
    *,
    delisted: bool = False,
    test_cause: bool = False,
) -> None:
    """BackgroundTasks entry point for the cancel email — never raises.

    Same reasoning as send_funded_notifications: nothing captures an exception
    that escapes a background task, and one participant's failure must not cost
    the rest their email. group_buy_id is for the log line only. ``delisted``
    picks the MEH-2498 wording (the site took the business off) over the
    business-cancelled one.
    """
    notify = (
        notify_participant_cancelled_delisted
        if delisted
        else notify_participant_cancelled
    )
    for participant_email in participant_emails:
        if not participant_email:
            continue
        try:
            notify(participant_email, title, producer_name, test_cause=test_cause)
        except Exception:  # noqa: BLE001 — one failure must not stop the rest
            logger.exception(
                "[group-buy] cancel notification to a participant failed "
                "(group_buy=%s)",
                group_buy_id,
            )


# --- Deadline passed below the minimum (MEH-3287) ---


def notify_participant_expired(
    participant_email: str, title: str, producer_name: str, test_cause: bool = False
) -> None:
    """MEH-3287: the deadline passed before the group reached its minimum.

    Nobody cancelled it, so neither cancel wording above is true here. No link
    (the group is off the site) and no contact details (PRIVACY CONTRACT).
    Wording approved 14/11/2026 by the stronger-model review standing in for
    Sapir; «לא נגבה ממך כלום» was cut — the site takes no payment, and a buyer
    may have paid the business directly.
    """
    subject = f'מהמקור — הקבוצה "{title}" לא הגיעה ליעד'
    body = (
        f"שלום,\n\n"
        f'הקבוצה שהצטרפתם אליה, "{title}" של {producer_name}, לא הגיעה '
        f"למספר המשתתפים הנדרש עד המועד האחרון, ולכן היא לא יוצאת לפועל.\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(participant_email, subject, body, test_cause=test_cause)


# --- MEH-3592: a late joiner (to the business) and a freed place (waitlist) ---


def notify_producer_late_joiner(  # noqa: PLR0913 — plain data for a BackgroundTasks entry
    producer_email: str,
    title: str,
    participant_count: int,
    units_total: int,
    group_buy_id: str,
    test_cause: bool = False,
) -> None:
    """A join after the goal: the business plans stock, so it hears of each
    one (Etsy / Shopify notify the seller per order). A COUNT and a unit
    total, never a name — see the module PRIVACY CONTRACT."""
    subject = f'מהמקור — הצטרפות חדשה לקבוצת הרכישה "{title}"'
    body = (
        f"שלום,\n\n"
        f'יש הצטרפות נוספת לקבוצת הרכישה "{title}", שכבר הגיעה ליעד.\n'
        f"מספר הצטרפויות עכשיו: {participant_count}\n"
        f"סך הכמות שהוזמנה: {units_total}\n\n"
        f"לצפייה בקבוצה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(producer_email, subject, body, test_cause=test_cause)


def notify_waitlist_place(
    email: str, title: str, group_buy_id: str, test_cause: bool = False
) -> None:
    """A place freed in a full group buy: the first on its waitlist is told.
    The place is not held (the events waitlist, MEH-3314, works the same)."""
    subject = f'מהמקור — התפנה מקום בקבוצת הרכישה "{title}"'
    body = (
        f"שלום,\n\n"
        f'התפנה מקום בקבוצת הרכישה "{title}", שנרשמתם לרשימת ההמתנה שלה.\n'
        f"המקום לא שמור: הוא הולך להצטרפות הראשונה.\n\n"
        f"להצטרפות: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(email, subject, body, test_cause=test_cause)


def send_late_joiner_to_producer(  # noqa: PLR0913 — BackgroundTasks entry, plain data
    producer_email: str | None,
    title: str,
    participant_count: int,
    units_total: int,
    group_buy_id: str,
    test_cause: bool = False,
) -> None:
    if not producer_email:
        return
    try:
        notify_producer_late_joiner(
            producer_email,
            title,
            participant_count,
            units_total,
            group_buy_id,
            test_cause=test_cause,
        )
    except Exception:  # best-effort, like every send in this module
        logger.exception("late-joiner email to the business failed (%s)", group_buy_id)


def send_waitlist_place(
    email: str, title: str, group_buy_id: str, test_cause: bool = False
) -> None:
    try:
        notify_waitlist_place(email, title, group_buy_id, test_cause=test_cause)
    except Exception:  # best-effort
        logger.exception("waitlist place email failed (%s)", group_buy_id)


def notify_pickup_changed(  # noqa: PLR0913 — plain data for a BackgroundTasks entry
    email: str,
    title: str,
    group_buy_id: str,
    window: str,
    notes: str,
    first: bool = False,
    test_cause: bool = False,
) -> None:
    """MEH-3597: the business set, changed or removed the pickup time of a
    group she joined. `window` = pickup_window_he(); "" = removed."""
    if not window:
        news = f'בית העסק הסיר את מועד האיסוף בקבוצת הרכישה "{title}". את מועד האיסוף מתאמים ישירות מול בית העסק.\n'
    elif first:
        news = f'בית העסק קבע מועד איסוף לקבוצת הרכישה "{title}": {window}.\n'
    else:
        news = f'בית העסק שינה את מועד האיסוף בקבוצת הרכישה "{title}". המועד החדש: {window}.\n'
    subject = f'מהמקור — מועד האיסוף בקבוצה "{title}" עודכן'
    body = (
        f"שלום,\n\n{news}"
        + (f"\n{notes}" if notes else "")
        + f"\nלדף הקבוצה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(email, subject, body, test_cause=test_cause)


def send_pickup_changed(  # noqa: PLR0913 — BackgroundTasks entry, plain data
    emails: list[str],
    title: str,
    group_buy_id: str,
    window: str,
    notes: str,
    first: bool = False,
    test_cause: bool = False,
) -> None:
    for email in emails:
        try:
            notify_pickup_changed(
                email,
                title,
                group_buy_id,
                window,
                notes,
                first=first,
                test_cause=test_cause,
            )
        except Exception:  # best-effort, one failure must not stop the rest
            logger.exception("pickup-changed email failed (%s)", group_buy_id)


def notify_allergens_changed(
    email: str, title: str, group_buy_id: str, test_cause: bool = False
) -> None:
    """MEH-3610: the business changed the allergens of a group she joined.
    No list in the mail (the codes' Hebrew names live in the frontend); the
    page shows the current one."""
    subject = f'מהמקור — האלרגנים של "{title}" עודכנו'
    body = (
        f"שלום,\n\n"
        f'בית העסק עדכן את רשימת האלרגנים בקבוצת הרכישה "{title}" שהצטרפתם אליה.\n'
        f"כדאי לבדוק אותה בדף הקבוצה לפני האיסוף: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(email, subject, body, test_cause=test_cause)


def send_allergens_changed(
    emails: list[str], title: str, group_buy_id: str, test_cause: bool = False
) -> None:
    for email in emails:
        try:
            notify_allergens_changed(email, title, group_buy_id, test_cause=test_cause)
        except Exception:  # best-effort, one failure must not stop the rest
            logger.exception("allergens-changed email failed (%s)", group_buy_id)


def notify_pickup_reminder(  # noqa: PLR0913 — plain data from the daily job
    email: str,
    title: str,
    producer_name: str,
    group_buy_id: str,
    pickup: str,
    test_cause: bool = False,
) -> None:
    """MEH-3610: the reminder before pickup, once per group (the daily job,
    group_buy_pickup_reminder). «תזכורת», not «מחר»: a group whose pickup is
    later today gets the same mail, and «מחר» would be wrong there. `pickup` =
    the time, the place and the notes (pickup_lines + place_line)."""
    subject = f'מהמקור — תזכורת לאיסוף: "{title}"'
    body = (
        f"שלום,\n\n"
        f'תזכורת: מתקרב האיסוף של קבוצת הרכישה "{title}" של {producer_name}.\n\n'
        + (f"{pickup}\n" if pickup else "")
        + f"לדף הקבוצה: {_group_buy_url(group_buy_id)}\n\n"
        f"בברכה,\nצוות מהמקור"
    )
    _send_email(email, subject, body, test_cause=test_cause)
