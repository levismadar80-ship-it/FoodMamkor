"""
Module:   rescue_reminders
Purpose:  MEH-3702 — on the morning of the pickup day, remind every buyer who
          reserved a bag on an EARLIER day: the code, the window, the free
          cancel. A bag can be reserved the day before since MEH-3702, and a
          reservation with nothing paid is easy to forget. MEH-3805 — a bag
          whose window ends by 08:00 is reminded the evening before instead
          (20:00), since the morning run comes after its window.
Touches:  DB rescue_orders / rescue_offers / producer_locations / users (read),
          email_outbox (insert, committed here).
Does NOT: send anything — services/email_outbox.py dispatches the rows. Does
          not schedule itself: app/startup.py registers the 08:00 and 20:00
          Asia/Jerusalem crons. Does not remind a buyer who reserved on the
          pickup day itself: the code email reached her that same day.
          Email only, no WhatsApp: a reminder is not urgent
          (.claude/rules/notifications.md, MEH-3596).
Related:  services/rescue_emails.py::render_reservation_email (the same card,
          another subject) · services/rescue_digest.py (the business's
          morning-of message)
History:  MEH-3702 (creation) · MEH-3805 (the evening run for early windows)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Query, Session, selectinload

from app.models.email_outbox import EmailOutbox
from app.models.models import ProducerLocation, RescueOffer, RescueOrder
from app.services.email_outbox import enqueue_email
from app.services.prepay_copy import prepay_from_info
from app.services.rescue_emails import (
    ReservationEmail,
    israel_hhmm,
    render_reservation_email,
)
from app.utils.clock import ISRAEL_TZ

logger = logging.getLogger(__name__)

# The schedules are RESCUE_REMINDER_CRON and RESCUE_EVENING_REMINDER_CRON in
# services/job_heartbeat.py (08:00 and 20:00 Israel, registered in
# app/startup.py). Once a day, so one process sends each
# reminder once. DO NOT turn it into an interval tick: nothing stamps an order
# as reminded (that would be a column and an Alembic revision), so a second
# run on the same day would queue every reminder again.
REMINDER_KIND = "rescue_reminder"
# MEH-3805: the evening-before run, for a bag whose window ends by 08:00.
EVENING_REMINDER_KIND = "rescue_reminder_eve"
# The line between the two runs: a window that ends at or before 08:00 Israel
# is the evening run's, one that ends after it is the morning run's. One
# boundary for both filters, so no order is reminded twice or never.
MORNING_RUN_AT = time(8, 0)


def _israel_utc(day: date, at: time) -> datetime:
    """`at` on `day` on the Israel clock, as the naive UTC the columns store."""
    start = datetime.combine(day, at, tzinfo=ISRAEL_TZ)
    return start.astimezone(timezone.utc).replace(tzinfo=None)


def _day_start_utc(today: date) -> datetime:
    """00:00 on the Israel clock, as the naive UTC the columns store."""
    return _israel_utc(today, time.min)


def _orders_query(db: Session, day: date, now: datetime) -> Query[RescueOrder]:
    return (
        db.query(RescueOrder)
        .join(RescueOffer, RescueOrder.offer_id == RescueOffer.id)
        .options(
            selectinload(RescueOrder.user),
            selectinload(RescueOrder.offer)
            .selectinload(RescueOffer.location)
            .selectinload(ProducerLocation.producer),
        )
        .filter(
            RescueOffer.date == day,
            RescueOffer.status == "active",
            RescueOffer.pickup_end > now,
            RescueOrder.status == "reserved",
        )
    )


def _due_orders(db: Session, today: date, now: datetime) -> list[RescueOrder]:
    """The morning run: reserved on an earlier day, window ends after 08:00
    (a late run must not drop a window the evening run left to it)."""
    return (
        _orders_query(db, today, now)
        .filter(
            RescueOffer.pickup_end > _israel_utc(today, MORNING_RUN_AT),
            RescueOrder.created_at < _day_start_utc(today),
        )
        .all()
    )


def _due_evening_orders(
    db: Session, tomorrow: date, now: datetime
) -> list[RescueOrder]:
    """The evening run: tomorrow's bags whose window ends by 08:00. Any order
    that exists at the run was, by definition, reserved before its day."""
    return (
        _orders_query(db, tomorrow, now)
        .filter(RescueOffer.pickup_end <= _israel_utc(tomorrow, MORNING_RUN_AT))
        .all()
    )


def _reminder_card(order: RescueOrder, now: datetime) -> ReservationEmail:
    offer = order.offer
    location = offer.location
    return ReservationEmail(
        producer_name=location.producer.name or "",
        producer_id=str(location.producer_id),
        pickup_code=order.pickup_code,  # type: ignore[arg-type]
        total_agorot=offer.price_agorot * order.qty,
        pickup_from=israel_hhmm(offer.pickup_start),
        pickup_until=israel_hhmm(offer.pickup_end),
        address=", ".join(p for p in (location.address, location.city) if p),
        cancel_until=(
            israel_hhmm(offer.cancel_until) if offer.cancel_until > now else None
        ),
        pickup_note=location.pickup_note,
        prepay=prepay_from_info(location.producer.payment_info),  # MEH-3897
        paid=order.paid_at is not None,  # MEH-3897 «סמן כשולם»
    )


def _already_ran(db: Session, kind: str, today: date) -> bool:
    """One run per kind per Israel day. Nothing stamps an order as reminded,
    so a second replica or a manual re-run would send every email twice. The
    lock serialises two runs; the outbox row (its kind and created_at outlive
    the content clear) tells the second that the day is done."""
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
        {"k": kind},
    )
    return (
        db.query(EmailOutbox.id)
        .filter(
            EmailOutbox.kind == kind, EmailOutbox.created_at >= _day_start_utc(today)
        )
        .first()
        is not None
    )


def _queue(
    db: Session, kind: str, due: list[RescueOrder], now: datetime, subject_start: str
) -> int:
    queued = 0
    for order in due:
        user = order.user
        location = order.offer.location
        if (
            user is None
            or not user.email
            or location is None
            or location.producer is None
        ):
            continue
        card = _reminder_card(order, now)
        name = " ".join(card.producer_name.split())
        subject, body, html = render_reservation_email(
            card, subject=f"{subject_start}{name}"
        )
        # MEH-2952: a test business or a test buyer queues nothing.
        test_cause = bool(location.producer.is_test or user.is_test)
        enqueue_email(
            db, kind, user.email, subject, body, html=html, test_cause=test_cause
        )
        queued += 0 if test_cause else 1
    return queued


def queue_morning_reminders(
    db: Session, *, today: date, now: datetime
) -> dict[str, int]:
    """Queue today's reminders and commit. `now` is naive UTC, like the columns.

    Returns counters for the job log: `due` orders found, `queued` rows added.
    A buyer without an email, a bag whose business has no row, and a test
    business or buyer are not queued.
    """
    if _already_ran(db, REMINDER_KIND, today):
        db.commit()
        return {"due": 0, "queued": 0, "already_ran": 1}
    due = _due_orders(db, today, now)
    queued = _queue(db, REMINDER_KIND, due, now, "היום אוספים את הסל ב")
    db.commit()
    return {"due": len(due), "queued": queued}


def queue_evening_reminders(
    db: Session, *, today: date, now: datetime
) -> dict[str, int]:
    """MEH-3805: queue the evening-before reminders for tomorrow's early
    windows and commit. Same counters and skips as the morning run."""
    if _already_ran(db, EVENING_REMINDER_KIND, today):
        db.commit()
        return {"due": 0, "queued": 0, "already_ran": 1}
    due = _due_evening_orders(db, today + timedelta(days=1), now)
    queued = _queue(db, EVENING_REMINDER_KIND, due, now, "מחר אוספים את הסל ב")
    db.commit()
    return {"due": len(due), "queued": queued}
