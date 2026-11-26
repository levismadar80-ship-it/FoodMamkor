"""
Module:   rescue_payment
Purpose:  The business marks a surprise-bag reservation as paid ahead, or
          undoes the mark (MEH-3897). The money went to its own Bit / PayBox
          link (MEH-3895), so this is the business's word, the way Shopify
          and WooCommerce leave a manual-payment order unpaid until the
          merchant marks it.
Touches:  rescue_orders.paid_at
Does NOT: move, check or refund money. Not the handover (rescue_writes.hand_over)
          and not the billing ledger, which counts handed bags only.
Related:  backend/app/services/rescue_writes.py require_offer_owner ·
          backend/app/schemas/payment_link.py (the link itself)
History:  MEH-3897 (creation)
"""

from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import User
from app.models.rescue import RescueOrder
from app.services.rescue_writes import order_or_404, require_offer_owner
from app.utils.clock import utc_now

# A cancelled or no-show reservation is over: there is nothing to mark, and a
# paid cancelled one is a refund (the MEH-3895 email), not a payment.
MARKABLE = ("reserved", "handed")


def set_paid(db: Session, *, user: User, order_id: UUID, paid: bool) -> RescueOrder:
    """Mark or unmark; owner (or admin) only; commits. Idempotent: marking a
    paid order keeps its first time, unmarking an unpaid one is a no-op."""
    order = order_or_404(db, order_id)
    require_offer_owner(user, order.offer)
    if order.status not in MARKABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="אפשר לסמן תשלום רק על שריון פעיל או על סל שנמסר",
        )
    if paid and order.paid_at is None:
        order.paid_at = utc_now()  # type: ignore[assignment]
    elif not paid:
        order.paid_at = None  # type: ignore[assignment]
    db.commit()
    db.refresh(order)
    return order
