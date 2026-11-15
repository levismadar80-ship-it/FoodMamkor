"""
Module:   product_order_sweeper
Purpose:  Close the requests nobody answered in time: a `pending` or
          `change_proposed` order past its `expires_at` becomes `expired`,
          moved by the system, and the buyer is told (through the outbox).
Touches:  DB table product_orders (through product_order_state) and, through
          it, product_order_events and product_order_notifications.
Does NOT: count the 24 hours: `expires_at` is set where the order is written
          or the change proposed (product_order_clock, which already pauses on
          Shabbat and the festivals), so there is never anything to expire
          inside a rest window.
Related:  app/services/product_order_state.py, app/startup.py (the job)
History:  MEH-3296 (creation; stage 3 of MEH-3216)
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from app.models.product_orders import ProductOrder
from app.services.product_order_state import SYSTEM, apply_transition
from app.utils.clock import utc_now

log = logging.getLogger(__name__)

EXPIRABLE = ("pending", "change_proposed")
BATCH = 50


def expire_due(db: Session, now: datetime | None = None, limit: int = BATCH) -> int:
    """Expire up to `limit` lapsed requests, one transaction each. An order a
    business is confirming at this moment is locked and skipped, and its
    status is checked again under the lock."""
    now = now or utc_now()
    ids = [
        order_id
        for (order_id,) in db.query(ProductOrder.id)
        .filter(ProductOrder.status.in_(EXPIRABLE), ProductOrder.expires_at <= now)
        .order_by(ProductOrder.expires_at)
        .limit(limit)
    ]
    db.rollback()  # end the read; each order gets its own transaction
    expired = 0
    for order_id in ids:
        order = (
            db.query(ProductOrder)
            .filter(ProductOrder.id == order_id)
            .populate_existing()
            .with_for_update(skip_locked=True)
            .first()
        )
        if order is None or order.status not in EXPIRABLE or order.expires_at > now:
            db.rollback()
            continue
        apply_transition(db, order, "expired", SYSTEM)
        db.commit()
        expired += 1
    if expired:
        log.info("product orders: %d unanswered request(s) expired", expired)
    return expired
