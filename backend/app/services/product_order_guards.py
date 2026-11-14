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
History:  MEH-3262 (creation; stage 2a of MEH-3216); MEH-3263 (locks the
          business row before the check)
"""

from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import Producer
from app.models.product_orders import PRODUCT_ORDER_OPEN_STATUSES, ProductOrder

# An order someone is still waiting on. Deleting the business under it would
# leave a buyer with a confirmed order and nobody to hand it over.
OPEN_ORDER_STATUSES = PRODUCT_ORDER_OPEN_STATUSES

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
    if producer_id is None:
        return
    # MEH-3263: lock the business row first. The order route locks the same
    # row before it writes, so an order cannot slip in between this check and
    # the delete that follows it in the same transaction.
    db.query(Producer.id).filter(Producer.id == producer_id).with_for_update().first()
    if has_open_orders(db, producer_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=OPEN_ORDERS_BLOCK_DELETE_DETAIL,
        )
