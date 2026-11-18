"""
Module:   registration_waitlist
Purpose:  A full event or one-off workshop takes a waitlist through the same
          on-site form (MEH-3314). When a sign-up is cancelled, the first
          waitlisted visitor not yet offered gets one email with the link to
          sign up — the spot is not held; whoever submits the form first gets
          it, and a waitlisted visitor who signs up keeps her row (promoted).
Touches:  registrations (status 'waitlisted', waitlist_offered_at), Resend via
          registration_emails (queued by the caller after the commit).
Does NOT: decide capacity or visibility (routers/registrations.py does), and
          offers nothing when the host raises the cap — only a cancel frees a
          spot here. A recurring workshop's waitlist is offered like any other.
Related:  routers/registrations.py::register_for_event / ::cancel_registration;
          services/booking_cancellations.py::_active_registrations (an item
          cancelled by its business mails the waitlist too)
History:  MEH-3314 (creation)
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.models.models import Event, Experience, Registration
from app.schemas.schemas import RegistrationCreatedOut
from app.services.booking_cancellations import _host_name_for, _message, is_test_item
from app.services.registration_emails import RegistrantEmail
from app.utils.clock import utc_now

# MEH-3022: nothing grows without bound — a waitlist longer than this would
# never be reached, and every row is a stranger's contact details.
WAITLIST_MAX = 50

_WAITLIST_FULL = {"code": "waitlist_full", "message": "רשימת ההמתנה מלאה"}

WAITLISTED = RegistrationCreatedOut(status="waitlisted")


def active_row(
    db: Session, column: Any, item_id: UUID, email: str
) -> Registration | None:
    """Her registered or waitlisted row on this item, if any."""
    return (
        db.query(Registration)
        .filter(
            column == item_id,
            Registration.email == email,
            Registration.status.in_(("registered", "waitlisted")),
        )
        .first()
    )


def refuse_if_waitlist_full(db: Session, column: Any, item_id: UUID) -> None:
    waiting = (
        db.query(func.count(Registration.id))
        .filter(column == item_id, Registration.status == "waitlisted")
        .scalar()
    )
    if int(waiting or 0) >= WAITLIST_MAX:
        db.rollback()  # releases the FOR UPDATE lock on the item row
        raise HTTPException(status_code=409, detail=_WAITLIST_FULL)


def item_url(item: Event | Experience) -> str:
    kind = "events" if isinstance(item, Event) else "experiences"
    return f"{settings.frontend_url}/{kind}/{item.id}"


def offer_next(
    db: Session, item: Event | Experience
) -> tuple[str, RegistrantEmail, str, bool] | None:
    """Stamp the first waitlisted visitor not yet offered and return what
    send_waitlist_offer needs (plain values), or None. The caller commits,
    then queues the email."""
    column = (
        Registration.event_id if isinstance(item, Event) else Registration.experience_id
    )
    reg = (
        db.query(Registration)
        .filter(
            column == item.id,
            Registration.status == "waitlisted",
            Registration.waitlist_offered_at.is_(None),
        )
        .order_by(Registration.created_at.asc())
        .with_for_update(skip_locked=True)
        .first()
    )
    if reg is None or not reg.email:
        return None
    reg.waitlist_offered_at = utc_now()  # type: ignore[assignment]
    message = _message(reg, item, _host_name_for(item))
    return str(reg.email), message, item_url(item), is_test_item(item)
