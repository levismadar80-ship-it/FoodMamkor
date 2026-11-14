"""
Module:   product_order_guards
Purpose:  Rules about orders that other parts of the app must respect. Today
          one: a business with an open order cannot be hard-deleted.
Touches:  Reads product_orders. Writes nothing.
Does NOT: change an order — services/product_order_state.py is the only
          writer of a status. Does NOT keep closed orders alive: they hold a
          buyer's name, phone and address, and go with the business
          (ON DELETE CASCADE on product_orders.producer_id).
Related:  app/services/user_deletion.py (the owner deletes her account),
          app/routers/admin.py::admin_delete_producer (an admin deletes a
          business) — the two hard-delete paths that call this
History:  MEH-3262 (creation; stage 2a of MEH-3216)
"""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.product_orders import ProductOrder

# An order someone is still waiting on. Deleting the business under it would
# leave a buyer with a confirmed order and nobody to hand it over.
OPEN_ORDER_STATUSES = ("pending", "change_proposed", "confirmed", "ready")

OPEN_ORDERS_BLOCK_DELETE_DETAIL = (
    "אי אפשר למחוק בית עסק שיש לו הזמנות פתוחות. צריך לסגור אותן קודם"
)


def has_open_orders(db: Session, producer_id: Any) -> bool:
    return (
        db.query(ProductOrder.id)
        .filter(
            ProductOrder.producer_id == producer_id,
            ProductOrder.status.in_(OPEN_ORDER_STATUSES),
        )
        .first()
        is not None
    )


def refuse_delete_with_open_orders(db: Session, producer_id: Any) -> None:
    """409 when the business still has an open order. Call it BEFORE the
    first write of a delete flow, so a refusal leaves nothing half-done.

    Not behind the feature flag on purpose: with the flag off there are no
    orders, and if it is switched off while orders are open they still count.
    """
    if producer_id is not None and has_open_orders(db, producer_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=OPEN_ORDERS_BLOCK_DELETE_DETAIL,
        )
