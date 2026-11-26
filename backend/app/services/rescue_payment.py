"""
Module:   rescue_payment
Purpose:  The business marks a surprise-bag reservation as paid ahead, or
          undoes the mark (MEH-3897). The money went to its own Bit / PayBox
          link (MEH-3895), so this is the business's word, the way Shopify
          and WooCommerce leave a manual-payment order unpaid until the
          merchant marks it.
Touches:  rescue_orders.paid_at
Does NOT: move, check or refund money (a paid order that is cancelled gets
          the owners' refund email, rescue_business_emails). Not the handover
          (rescue_writes.hand_over) and not the billing ledger, which counts
          handed bags only.
Related:  backend/app/services/rescue_writes.py require_offer_owner ·
          backend/app/schemas/payment_link.py (the link itself)
History:  MEH-3897 (creation)
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import User
from app.models.rescue import RescueOrder
from app.schemas.payment_link import prepay_link
from app.services.rescue_writes import OfferLock, order_or_404, require_offer_owner
from app.utils.clock import utc_now

# A cancelled or no-show reservation is over: there is nothing to mark, and a
# paid cancelled one is a refund (the MEH-3895 email), not a payment.
MARKABLE = ("reserved", "handed")


def set_paid(
    db: Session, *, user: User, order_id: UUID, paid: bool, lock: OfferLock
) -> RescueOrder:
    """Mark or unmark; owner (or admin) only; commits. Idempotent: marking a
    paid order keeps its first time, unmarking an unpaid one is a no-op."""
    order = order_or_404(db, order_id)
    require_offer_owner(user, order.offer)
    # Lock the offer, then the order, and read the status again (MEH-2865, as
    # hand_over): a buyer's cancel in the same instant must not end with a
    # cancelled order stamped paid after its refund email went out.
    lock(db, order.offer_id)  # type: ignore[arg-type]
    db.refresh(order, with_for_update=True)
    if order.status not in MARKABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן תשלום רק על שריון פעיל או על סל שנמסר",
        )
    location = order.offer.location
    producer = location.producer if location else None
    # Only a business that takes payment ahead marks one: a bag paid at the
    # counter would otherwise tell its buyer «בית העסק אישר שהתשלום התקבל».
    # Undo stays open, so a mark survives the link being removed later.
    if (
        paid
        and order.paid_at is None
        and (producer is None or prepay_link(producer.payment_info) is None)
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן תשלום רק כשבית העסק מקבל תשלום מראש בקישור",
        )
    if paid and order.paid_at is None:
        order.paid_at = utc_now()
    elif not paid:
        order.paid_at = None  # type: ignore[assignment]
    db.commit()
    db.refresh(order)
    return order


def paid_open_order_ids(db: Session, offer_id: UUID) -> list[UUID]:
    """The reserved orders on an offer that the business marked paid, read
    just before a whole-offer cancel, so each gets the refund email after."""
    return [
        oid
        for (oid,) in db.query(RescueOrder.id).filter(
            RescueOrder.offer_id == offer_id,
            RescueOrder.status == "reserved",
            RescueOrder.paid_at.isnot(None),
        )
    ]
