"""
Module:   product_order_repeats
Purpose:  A buyer's weekly repeat of an order (MEH-3933, Fischgrund bakery
          27/11): the same lines, the same weekday and time on the Israel
          clock, the same way to get it. A daily job makes each week's order
          from it, as an ordinary order the business confirms.
Touches:  DB table product_order_repeats. No other side effects.
Does NOT: hold prices — each week's order prices its lines at that day's
          price (services/product_order_create.order_lines). Does NOT make
          orders: services/product_order_repeat.py does.
Related:  app/models/product_orders.py (ProductOrder.repeat_id), alembic
          revision a4c8e2f6b0d1, services/product_order_repeat.py
History:  MEH-3933 (creation, 27/11/2026)
"""

import uuid

from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID

from app.database import Base
from app.utils.clock import utc_now

PRODUCT_ORDER_REPEAT_STATES = ("active", "stopped")
PRODUCT_ORDER_REPEAT_STOPPED_BY = ("customer", "business", "system")


class ProductOrderRepeat(Base):
    """One weekly repeat. `last_slot_start` is the slot of the latest week it
    made or skipped (naive UTC); the next week is 7 Israel days after it, at
    the same Israel time. `skipped_in_row` counts weeks that could not be made
    since the last one that was; at 3 the repeat stops."""

    __tablename__ = "product_order_repeats"
    __table_args__ = (
        CheckConstraint(
            "state IN ('active', 'stopped')", name="product_order_repeats_state_check"
        ),
        CheckConstraint(
            "stopped_by IS NULL OR stopped_by IN ('customer', 'business', 'system')",
            name="product_order_repeats_stopped_by_check",
        ),
        CheckConstraint(
            "fulfilment IN ('pickup', 'delivery')",
            name="product_order_repeats_fulfilment_check",
        ),
        CheckConstraint(
            "skipped_in_row >= 0", name="product_order_repeats_skipped_check"
        ),
        Index("ix_product_order_repeats_producer_state", "producer_id", "state"),
        Index("ix_product_order_repeats_phone", "customer_phone"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    customer_name = Column(String(120), nullable=False)
    customer_phone = Column(String(20), nullable=False)
    fulfilment = Column(String(10), nullable=False)
    delivery_city = Column(String(100), nullable=True)
    delivery_address = Column(Text, nullable=True)
    note = Column(Text, nullable=True)
    # [{"product_id", "variant_id" | null, "qty"}], as the order route takes them.
    items = Column(JSONB, nullable=False)
    last_slot_start = Column(DateTime, nullable=False)
    skipped_in_row = Column(
        SmallInteger, default=0, nullable=False, server_default=text("0")
    )
    state = Column(
        String(10), default="active", nullable=False, server_default=text("'active'")
    )
    stopped_by = Column(String(10), nullable=True)
    stopped_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
