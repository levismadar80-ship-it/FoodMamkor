"""
Module:   product_order_privacy
Purpose:  What happens to a buyer's orders when she deletes her account: the
          open ones are cancelled, and every one of them loses her name,
          phone, address, note and status link.
Touches:  DB table product_orders (the personal columns) and, through
          product_order_state, the status and the event log of open orders.
          Does not commit — the account deletion owns the transaction.
Does NOT: delete an order row: the business's record that it handed
          something over (and what a commission was computed on) stays,
          without the person.
          Does NOT cover a guest's orders — a guest has no account to delete;
          the timed purge of closed orders is stage 3 of MEH-3216.
Related:  app/services/user_deletion.py (the caller),
          app/services/product_order_guards.py (the business side of delete)
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

from typing import Any

from sqlalchemy.orm import Session

from app.models.product_orders import PRODUCT_ORDER_OPEN_STATUSES, ProductOrder
from app.services.product_order_actions import clear_proposal
from app.services.product_order_outbox import ACCOUNT_DELETED_NOTE as outbox_note
from app.services.product_order_state import SYSTEM, apply_transition

DELETED_BUYER_NAME = "חשבון שנמחק"
# The note the outbox recognises: no message goes to a buyer who left.
ACCOUNT_DELETED_NOTE = outbox_note


def release_buyer_orders(db: Session, user_id: Any) -> int:
    """Cancel the account's open orders and strip the person from all of
    them. Returns how many orders were touched."""
    orders = (
        db.query(ProductOrder)
        .filter(ProductOrder.user_id == user_id)
        .with_for_update()
        .all()
    )
    for order in orders:
        if order.status in PRODUCT_ORDER_OPEN_STATUSES:
            # Logged as the system, with the reason: it was not her tapping
            # «cancel», and a packed (`ready`) order is one she could not
            # cancel herself — her deletion does not wait for the business.
            apply_transition(db, order, "cancelled", SYSTEM, ACCOUNT_DELETED_NOTE)
        order.customer_name = DELETED_BUYER_NAME  # type: ignore[assignment]
        order.customer_phone = ""  # type: ignore[assignment]
        order.delivery_address = None  # type: ignore[assignment]
        order.note = None  # type: ignore[assignment]
        order.status_token_hash = None  # type: ignore[assignment]
        order.idempotency_key = None  # type: ignore[assignment]
        order.pickup_code = None  # type: ignore[assignment]
        clear_proposal(order)
    return len(orders)
