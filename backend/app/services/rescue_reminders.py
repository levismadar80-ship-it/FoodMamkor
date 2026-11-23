"""
Module:   rescue_reminders
Purpose:  MEH-3702 — on the morning of the pickup day, remind every buyer who
          reserved a bag on an EARLIER day: the code, the window, the free
          cancel. A bag can be reserved the day before since MEH-3702, and a
          reservation with nothing paid is easy to forget.
Touches:  DB rescue_orders / rescue_offers / producer_locations / users (read),
          email_outbox (insert, committed here).
Does NOT: send anything — services/email_outbox.py dispatches the rows. Does
          not schedule itself: app/startup.py registers the 08:00
          Asia/Jerusalem cron. Does not remind a buyer who reserved on the
          pickup day itself: the code email reached her that same day.
          Email only, no WhatsApp: a reminder is not urgent
          (.claude/rules/notifications.md, MEH-3596).
Related:  services/rescue_emails.py::render_reservation_email (the same card,
          another subject) · services/rescue_digest.py (the business's
          morning-of message)
History:  MEH-3702 (creation)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, time, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from app.models.email_outbox import EmailOutbox
from app.models.models import ProducerLocation, RescueOffer, RescueOrder
from app.services.email_outbox import enqueue_email
from app.services.rescue_emails import (
    ReservationEmail,
    israel_hhmm,
    render_reservation_email,
)
from app.utils.clock import ISRAEL_TZ

logger = logging.getLogger(__name__)

# The schedule is RESCUE_REMINDER_CRON in services/job_heartbeat.py (08:00
# Israel, registered in app/startup.py). Once a day, so one process sends each
# reminder once. DO NOT turn it into an interval tick: nothing stamps an order
# as reminded (that would be a column and an Alembic revision), so a second
# run on the same day would queue every reminder again.
REMINDER_KIND = "rescue_reminder"


def _day_start_utc(today: date) -> datetime:
    """00:00 on the Israel clock, as the naive UTC the columns store."""
    start = datetime.combine(today, time.min, tzinfo=ISRAEL_TZ)
    return start.astimezone(timezone.utc).replace(tzinfo=None)


def _due_orders(db: Session, today: date, now: datetime) -> list[RescueOrder]:
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
            RescueOffer.date == today,
            RescueOffer.status == "active",
            RescueOffer.pickup_end > now,
            RescueOrder.status == "reserved",
            RescueOrder.created_at < _day_start_utc(today),
        )
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
    )


def queue_morning_reminders(
    db: Session, *, today: date, now: datetime
) -> dict[str, int]:
    """Queue today's reminders and commit. `now` is naive UTC, like the columns.

    Returns counters for the job log: `due` orders found, `queued` rows added.
    A buyer without an email, a bag whose business has no row, and a test
    business or buyer are not queued.
    """
    # MEH-3702: one run per Israel day. Nothing stamps an order as reminded,
    # so a second replica or a manual re-run would send every email twice.
    # The lock serialises two runs; the outbox row (its kind and created_at
    # outlive the content clear) tells the second that the day is done.
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
        {"k": REMINDER_KIND},
    )
    if (
        db.query(EmailOutbox.id)
        .filter(
            EmailOutbox.kind == REMINDER_KIND,
            EmailOutbox.created_at >= _day_start_utc(today),
        )
        .first()
    ):
        db.commit()
        return {"due": 0, "queued": 0, "already_ran": 1}
    due = _due_orders(db, today, now)
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
            card, subject=f"היום אוספים את הסל ב{name}"
        )
        # MEH-2952: a test business or a test buyer queues nothing.
        test_cause = bool(location.producer.is_test or user.is_test)
        enqueue_email(
            db,
            REMINDER_KIND,
            user.email,
            subject,
            body,
            html=html,
            test_cause=test_cause,
        )
        queued += 0 if test_cause else 1
    db.commit()
    return {"due": len(due), "queued": queued}
