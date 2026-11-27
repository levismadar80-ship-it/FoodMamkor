"""
Module:   rescue_notify
Purpose:  Queue what the rescue-bags routes tell people after a commit: the
          follower alert on a bag for today, the buyer's reservation and
          cancel emails, and one email per buyer when the business cancels.
Touches:  BackgroundTasks only. Every value is read here, while the
          request's Session is open, and handed to the task as plain values
          (the MEH-1651 convention); the sends themselves live in
          services/rescue_emails.py and routers/alerts.py `fire_alerts`.
Does NOT: commit, lock or change any row (services/rescue_writes.py), decide
          whether a mail failure may fail the request (the router's try
          blocks: a committed write never turns into a 500), or read the
          clock: the router passes `today` / `now`, so a test that pins the
          router's clock pins these too.
Related:  app/routers/rescue.py create_offer · create_order · cancel_order ·
          cancel_offer · skip_my_day (the callers);
          app/services/rescue_business_emails.py (the business's own mail).
History:  MEH-3537 (moved verbatim from routers/rescue.py; the clock became a
          parameter). Originally MEH-2715 · MEH-2737 · MEH-2738 · MEH-3117 ·
          MEH-3593 · MEH-3702.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
import logging

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.models.models import Producer, RescueOffer, RescueOrder, User
from app.services.prepay_copy import prepay_from_info
from app.services.address_line import address_line  # MEH-3959
from app.services.prepay_refunds import bag_business_cancel_mails, queue_mails
from app.services.rescue_emails import (
    ReservationEmail,
    day_word,
    israel_date,
    israel_hhmm,
    send_business_cancel_email,
    send_cancel_email,
    send_reservation_email,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RescueClock:
    """The router's clock at the moment it queues a message (MEH-3537)."""

    today: date
    now: datetime


def queue_new_rescue_alert(
    background_tasks: BackgroundTasks,
    db: Session,
    producer: Producer,
    offer: RescueOffer,
    clock: RescueClock,
) -> None:
    """MEH-3117: tell the people who saved this business that it has bags today.

    Only for an offer dated TODAY on the Israel clock — the approved title
    says «היום», so a bag published tonight for tomorrow sends nothing (a
    morning-of send would need a scheduler job; not in the pilot). Fired
    here only, after the commit: never on cancel, reservation or handover.
    Same fan-out, channels and 24h cap as the other alert types.
    """
    if offer.date != clock.today or offer.pickup_end <= clock.now:
        return  # not today, or the pickup window is already over
    from app.routers.alerts import AlertContent, fire_alerts

    # Approved copy, Sapir 14/11 (MEH-3117 rows 2 and 3).
    background_tasks.add_task(
        fire_alerts,
        db,
        producer.id,  # type: ignore[arg-type]
        "new_rescue",
        AlertContent(
            title=f"סלי הפתעה היום ב{producer.name}",
            body=(
                f"{offer.qty_total} סלים, איסוף "
                f"{israel_hhmm(offer.pickup_start)}–{israel_hhmm(offer.pickup_end)}"  # type: ignore[arg-type]
            ),
            url="/rescue",
        ),
    )


def queue_business_cancel_emails(
    background_tasks: BackgroundTasks,
    db: Session,
    offer: RescueOffer,
    buyer_ids: set[Any],
    today: date,
) -> None:
    """MEH-2738: one email per buyer whose reservation the business cancelled.

    Values are read here, while the Session is open, and handed to the task
    as plain strings (the MEH-1651 convention). One per buyer, not per order:
    a buyer may hold two orders on one offer.
    """
    if not buyer_ids:
        return
    location = offer.location
    producer = location.producer if location else None
    if producer is None:
        return
    emails = sorted(
        {
            email
            for (email,) in db.query(User.email).filter(User.id.in_(buyer_ids))
            if email
        }
    )
    for email in emails:
        background_tasks.add_task(
            send_business_cancel_email,
            email,
            producer.name or "",
            test_cause=bool(producer.is_test),  # MEH-2952
            tomorrow=day_word(offer.date, today) == "מחר",  # type: ignore[arg-type]  # MEH-3702
        )
    # MEH-3897: a business that takes the money ahead is told what to return.
    queue_mails(background_tasks, bag_business_cancel_mails(db, offer, buyer_ids))


def pickup_note(offer: RescueOffer) -> str | None:
    """MEH-3593: «הוראות איסוף» of the bag's pickup point, read while the
    request's Session is still open (before the task is queued)."""
    try:
        note: str | None = offer.location.pickup_note
    except Exception:  # noqa: BLE001 — a note must never cost the buyer the code email
        logger.warning("rescue: pickup note read failed for offer %s", offer.id)
        return None
    return note


def queue_reservation_email(
    background_tasks: BackgroundTasks,
    user: User,
    offer: RescueOffer,
    order: RescueOrder,
    clock: RescueClock,
) -> None:
    """MEH-2715: queue the buyer's confirmation email, after the commit.

    Everything is read HERE, while the request's Session is open, and handed
    to the task as plain values — a background task must never touch `db`
    (the group_buys MEH-1651 convention). Queued only after the commit, so a
    refused or rolled-back reservation sends nothing.
    """
    location = offer.location
    producer = location.producer if location else None
    if not user.email or producer is None:
        return
    address = address_line(location.address, location.city)  # type: ignore[arg-type]
    today = clock.today
    background_tasks.add_task(
        send_reservation_email,
        user.email,  # type: ignore[arg-type]
        ReservationEmail(
            producer_name=producer.name or "",
            producer_id=str(producer.id),
            pickup_code=order.pickup_code,  # type: ignore[arg-type]
            total_agorot=offer.price_agorot * order.qty,  # type: ignore[arg-type]
            pickup_from=israel_hhmm(offer.pickup_start),  # type: ignore[arg-type]
            pickup_until=israel_hhmm(offer.pickup_end),  # type: ignore[arg-type]
            address=address,
            # MEH-2737: reserved after the free-cancel cutoff → the email says
            # nothing about cancelling (no line, no button).
            cancel_until=(
                israel_hhmm(offer.cancel_until)  # type: ignore[arg-type]
                if offer.cancel_until > clock.now
                else None
            ),
            pickup_note=pickup_note(offer),
            # MEH-3702: tomorrow's bag says «מחר», and so does its cutoff.
            pickup_day=day_word(offer.date, today) or "היום",  # type: ignore[arg-type]
            cancel_day=(
                ""
                if israel_date(offer.cancel_until) == today  # type: ignore[arg-type]
                else day_word(israel_date(offer.cancel_until), today)  # type: ignore[arg-type]
            ),
            prepay=prepay_from_info(producer.payment_info),  # MEH-3897
        ),
        # MEH-2952: a test business or a test buyer → dropped and logged.
        test_cause=bool(producer.is_test or user.is_test),
    )


def queue_cancel_email(
    background_tasks: BackgroundTasks, user: User, offer: RescueOffer
) -> None:
    """MEH-2737: tell the buyer the cancel went through.

    Same rules as `queue_reservation_email`: plain values only, queued after
    the commit, nothing when the buyer has no email.
    """
    location = offer.location
    producer = location.producer if location else None
    if not user.email or producer is None:
        return
    background_tasks.add_task(
        send_cancel_email,
        user.email,  # type: ignore[arg-type]
        producer.name or "",
        test_cause=bool(producer.is_test or user.is_test),  # MEH-2952
    )
