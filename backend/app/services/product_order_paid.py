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
History:  MEH-3962 (creation, 27/11/2026; idea taken from KAMA; review round 1:
          handed orders owed only from OWED_HANDED_SINCE, one is_owed)
"""

from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, or_
from sqlalchemy.orm import Query, Session

from app.models.product_orders import ProductOrder
from app.utils.clock import utc_now

# An order the business has taken on. Before that (pending, a proposed change)
# nothing is owed yet; after a decline, cancellation or expiry nothing is owed.
# no_show may be marked (a buyer who paid ahead and did not come) but is not
# owed: nobody is going to pay for it.
PAYABLE_STATUSES = ("confirmed", "ready", "handed", "no_show")
OPEN_OWED_STATUSES = ("confirmed", "ready")
# DO NOT drop this cutoff — every order handed over before the mark existed has
# paid_at NULL, and without it a business would open the tab to «לא שולמו» on
# orders paid weeks ago (MEH-3962 review). 28/11/2026 00:00 Israel, naive UTC
# like handed_at.
OWED_HANDED_SINCE = datetime(2026, 11, 27, 22, 0)
NOT_PAYABLE_DETAIL = "אפשר לסמן «שולם» רק בהזמנה שאישרתם"


def is_owed(order: ProductOrder) -> bool:
    """Taken on and not marked paid; a handed order only from the cutoff on.
    The one definition: the business view's `owed` and only_unpaid() agree."""
    if order.paid_at is not None:
        return False
    if order.status in OPEN_OWED_STATUSES:
        return True
    return bool(
        order.status == "handed"
        and order.handed_at is not None
        and order.handed_at >= OWED_HANDED_SINCE
    )


def set_order_paid(db: Session, order_id: Any, paid: bool) -> ProductOrder:
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
    """The orders a business is still owed for (is_owed, as SQL)."""
    return query.filter(
        ProductOrder.paid_at.is_(None),
        or_(
            ProductOrder.status.in_(OPEN_OWED_STATUSES),
            and_(
                ProductOrder.status == "handed",
                ProductOrder.handed_at >= OWED_HANDED_SINCE,
            ),
        ),
    )
