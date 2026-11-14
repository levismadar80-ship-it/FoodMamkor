"""
Module:   billing_ledger
Purpose:  Write the billable-events ledger: one row when a business gets a
          booking through the site, and a void when that booking is cancelled
          in time. Nothing is charged — the ledger only counts (ADR-042).
Touches:  billable_events (insert / status update), inside the caller's
          transaction, behind a SAVEPOINT.
Does NOT: commit, send anything, or ever fail the caller: a ledger error is
          rolled back to the savepoint and reported to Sentry, and the sign-up
          / handover / status change goes through. Does NOT read personal data.
          Monthly totals and the threshold are MEH-3181, not here.
Related:  app/models/billing.py · app/pricing.py ·
          routers/registrations.py (sign-up, cancel) ·
          routers/group_buys.py (fulfilled) · routers/rescue.py (handed).
History:  MEH-3179 (creation, 2026-11-14).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.billing import BillableEvent
from app.pricing import (
    AGOROT_PER_SHEKEL,
    booking_fee_agorot,
    current_price_list,
    rescue_bag_fee_agorot,
)
from app.sentry import capture_background_exception
from app.utils.clock import utc_now

logger = logging.getLogger(__name__)


def shekels_to_agorot(amount: Any) -> int:
    """A shekel price (int, Decimal or None) as whole agorot; None / <=0 → 0."""
    if amount is None:
        return 0
    agorot = (Decimal(str(amount)) * AGOROT_PER_SHEKEL).quantize(
        Decimal("1"), rounding=ROUND_HALF_UP
    )
    return max(int(agorot), 0)


@dataclass(frozen=True)
class _Booking:
    producer_id: UUID | None
    kind: str
    source_id: UUID
    quantity: int
    base_amount_agorot: int
    fee_agorot: int


def _record(db: Session, booking: _Booking) -> None:
    """Insert one ledger row unless (kind, source_id) is already there.

    Runs behind a SAVEPOINT in the caller's transaction, so the row commits
    or rolls back together with the booking, and a failure here never breaks
    the booking itself.
    """
    if booking.producer_id is None:
        return  # an experience hosted by a user with no business: not billable
    try:
        with db.begin_nested():
            exists = (
                db.query(BillableEvent.id)
                .filter(
                    BillableEvent.kind == booking.kind,
                    BillableEvent.source_id == booking.source_id,
                )
                .first()
            )
            if exists:
                return
            db.add(
                BillableEvent(
                    producer_id=booking.producer_id,
                    kind=booking.kind,
                    source_id=booking.source_id,
                    occurred_at=utc_now(),
                    quantity=max(booking.quantity, 1),
                    base_amount_agorot=booking.base_amount_agorot,
                    fee_agorot=booking.fee_agorot,
                    price_list_version=current_price_list().version,
                    status="counted",
                )
            )
            db.flush()
    except Exception as exc:  # noqa: BLE001 — the ledger must never break a booking
        logger.exception(
            "billing ledger: could not record %s %s", booking.kind, booking.source_id
        )
        capture_background_exception(exc, task="billing_ledger.record")


def record_event_registration(db: Session, registration: Any, event: Any) -> None:
    base = shekels_to_agorot(event.price)
    _record(
        db,
        _Booking(
            producer_id=event.producer_id,
            kind="event_registration",
            source_id=registration.id,
            quantity=1,
            base_amount_agorot=base,
            fee_agorot=booking_fee_agorot(base),
        ),
    )


def record_experience_registration(
    db: Session, registration: Any, experience: Any, producer_id: UUID | None
) -> None:
    base = shekels_to_agorot(experience.price_per_person)
    _record(
        db,
        _Booking(
            producer_id=producer_id,
            kind="experience_registration",
            source_id=registration.id,
            quantity=1,
            base_amount_agorot=base,
            fee_agorot=booking_fee_agorot(base),
        ),
    )


def record_group_buy_fulfilled(db: Session, group_buy: Any, commits: Any) -> None:
    """One row per participant's order, when the business marks the group fulfilled."""
    unit = shekels_to_agorot(group_buy.price_per_unit_group)
    for commit in commits:
        base = unit * max(commit.quantity or 1, 1)
        _record(
            db,
            _Booking(
                producer_id=group_buy.producer_id,
                kind="group_buy_order",
                source_id=commit.id,
                quantity=max(commit.quantity or 1, 1),
                base_amount_agorot=base,
                fee_agorot=booking_fee_agorot(base),
            ),
        )


def count_bag_and_commit(db: Session, order: Any) -> None:
    """Count a rescue order that was just marked handed, then commit.

    The commit lives here only because routers/rescue.py sits at the 1,500-line
    file cap (exec §16) and has room for one line, not two.
    """
    offer = order.offer
    location = offer.location if offer is not None else None
    qty = max(order.qty or 1, 1)
    _record(
        db,
        _Booking(
            producer_id=location.producer_id if location is not None else None,
            kind="rescue_bag",
            source_id=order.id,
            quantity=qty,
            base_amount_agorot=max((offer.price_agorot if offer else 0) or 0, 0) * qty,
            fee_agorot=rescue_bag_fee_agorot(qty),
        ),
    )
    db.commit()


def void(db: Session, *, kind: str, source_id: UUID) -> None:
    """Mark a counted row voided (a booking cancelled before it took place)."""
    try:
        with db.begin_nested():
            db.query(BillableEvent).filter(
                BillableEvent.kind == kind,
                BillableEvent.source_id == source_id,
                BillableEvent.status == "counted",
            ).update(
                {"status": "voided", "voided_at": utc_now()},
                synchronize_session=False,
            )
            db.flush()
    except Exception as exc:  # noqa: BLE001 — the ledger must never break a cancel
        logger.exception("billing ledger: could not void %s %s", kind, source_id)
        capture_background_exception(exc, task="billing_ledger.void")
