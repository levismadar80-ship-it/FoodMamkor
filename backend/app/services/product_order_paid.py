"""
Module:   product_order_paid
Purpose:  MEH-3962 — the business marks that the buyer paid it, or takes the
          mark back (a mis-tap on a phone), and the list's «לא שולם» filter.
Touches:  DB table product_orders, column paid_at only. No outbound message:
          the payment reminder is a WhatsApp link the business opens itself.
Does NOT: move money or record an amount — the buyer pays the business
          directly (ADR-042 §5). Does NOT change `status` or write the event
          log: paid is not a state of the order, and the state service
          (product_order_state.py) stays the only writer of `status`.
Related:  app/routers/product_order_business.py (POST /{id}/paid, ?payment=),
          frontend/components/dashboard/orders/OrderPaidControl.jsx
History:  MEH-3962 (creation, 27/11/2026; idea taken from KAMA)
"""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.models.product_orders import ProductOrder
from app.utils.clock import utc_now

# An order the business has taken on. Before that (pending, a proposed change)
# nothing is owed yet; after a decline, cancellation or expiry nothing is owed.
# no_show may be marked (a buyer who paid ahead and did not come) but is not
# listed as unpaid: nobody is going to pay for it.
PAYABLE_STATUSES = ("confirmed", "ready", "handed", "no_show")
UNPAID_LIST_STATUSES = ("confirmed", "ready", "handed")
NOT_PAYABLE_DETAIL = "אפשר לסמן «שולם» רק בהזמנה שאישרתם"


def set_paid(db: Session, order_id: Any, paid: bool) -> ProductOrder:
    """Mark the order paid (keeps the first time it was marked) or unpaid.

    Taking the mark back is always allowed, so a mis-tap can be undone on an
    order that has since closed.
    """
    order = (
        db.query(ProductOrder)
        .filter(ProductOrder.id == order_id)
        .with_for_update()
        .one()
    )
    if not paid:
        order.paid_at = None  # type: ignore[assignment]
        return order
    if order.status not in PAYABLE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=NOT_PAYABLE_DETAIL
        )
    if order.paid_at is None:
        order.paid_at = utc_now()
    return order


def only_unpaid(query: "Query[ProductOrder]") -> "Query[ProductOrder]":
    """The orders a business is still owed for."""
    return query.filter(
        ProductOrder.paid_at.is_(None),
        ProductOrder.status.in_(UNPAID_LIST_STATUSES),
    )
