"""
Module:   rescue_business_emails
Purpose:  The business hears about each surprise-bag reservation: one email to
          every owner login with the quantity, the pickup code and the window,
          so the counter knows a buyer is coming before she arrives.
Touches:  Resend (via send_email) — read-only on users.
Does NOT: email the buyer (rescue_emails.send_reservation_email) or decide
          whether a reservation stands (routers/rescue.py::create_order).
          The task gets plain values only; it never sees the Session.
Related:  app/routers/rescue.py::create_order (the caller, after the commit),
          app/services/booking_cancellations.py::owner_emails
History:  MEH-3313 (creation)
"""

from dataclasses import dataclass
from datetime import date

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import RescueOffer, RescueOrder
from app.services.booking_cancellations import owner_emails
from app.services.email import send_email
from app.services.rescue_emails import day_word, israel_hhmm, shekels


@dataclass(frozen=True)
class BusinessReservation:
    """What the business email shows — read while the Session was open."""

    producer_name: str
    qty: int
    pickup_code: str
    total_agorot: int
    pickup_from: str
    pickup_until: str
    # MEH-3702: a bag reserved a day ahead says «מחר» (copy approved 24/11).
    tomorrow: bool = False


def _qty_line(qty: int) -> str:
    return "נשמר סל אחד" if qty == 1 else f"נשמרו {'שני' if qty == 2 else qty} סלים"


def send_business_reservation_email(
    to: str, m: BusinessReservation, test_cause: bool = False
) -> None:
    """MEH-3313 — one email per owner login (text body; send_email adds the branded HTML part, MEH-3587)."""
    name = " ".join(m.producer_name.split())
    subject = f"נשמר סל הפתעה ב{name}"
    day = "מחר" if m.tomorrow else "היום"
    which = "של היום ושל מחר" if m.tomorrow else "של היום"
    body = (
        "שלום,\n\n"
        f"{_qty_line(m.qty)} עכשיו מסלי ההפתעה של {day}.\n"
        f"קוד האיסוף: {m.pickup_code}. בקופה אומרים את הקוד ומשלמים "
        f"{shekels(m.total_agorot)} ₪.\n"
        f"איסוף {day} {m.pickup_from}–{m.pickup_until}.\n\n"
        f"את כל השריונים {which} אפשר לראות בלוח הבקרה:\n"
        f"{settings.frontend_url}/producer/dashboard/rescue\n\n"
        "צוות מהמקור"
    )
    send_email(to, subject, body, test_cause=test_cause)


def queue_business_reservation_email(
    background_tasks: BackgroundTasks,
    db: Session,
    offer: RescueOffer,
    order: RescueOrder,
    today: date | None = None,
) -> int:
    """Queue one email per owner login, AFTER the reservation's commit.
    Returns how many were queued (0 = no owner with an email)."""
    location = offer.location
    producer = location.producer if location else None
    if producer is None:
        return 0
    facts = BusinessReservation(
        producer_name=str(producer.name or ""),
        qty=int(order.qty),
        pickup_code=str(order.pickup_code),
        total_agorot=int(offer.price_agorot) * int(order.qty),
        pickup_from=israel_hhmm(offer.pickup_start),  # type: ignore[arg-type]
        pickup_until=israel_hhmm(offer.pickup_end),  # type: ignore[arg-type]
        tomorrow=today is not None and day_word(offer.date, today) == "מחר",  # type: ignore[arg-type]
    )
    recipients = owner_emails(db, producer)
    for to in recipients:
        background_tasks.add_task(
            send_business_reservation_email,
            to,
            facts,
            test_cause=bool(producer.is_test),  # MEH-2952
        )
    return len(recipients)
