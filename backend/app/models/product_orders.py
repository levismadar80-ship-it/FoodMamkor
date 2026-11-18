"""
Module:   product_orders
Purpose:  The tables behind on-site ordering («בקשת הזמנה»): a business's
          ordering settings, an order, its lines, and the log of its status
          changes.
Touches:  DB tables producer_order_settings / product_orders /
          product_order_items / product_order_events. No other side effects.
Does NOT: change an order's status — services/product_order_state.py is the
          only writer of `status` and of the event log. Does NOT record a
          payment: customer money never passes through the site (ADR-042 §5).
          Does NOT hold the product price — that stays on `products.price_min`
          / `price_max` (models.py), copied onto the order line at order time.
Related:  app/models/models.py (Product.price_unit / is_orderable / in_stock /
          contains_alcohol; its last line imports this module so Alembic's
          env.py, which imports models.py only, sees these tables), backend/alembic/versions/
          20261114_2130_d5a7c3e9f1b4_meh3218_product_orders.py (the CHECKs
          these tuples mirror), tests/test_meh3218_product_orders.py
History:  MEH-3218 (creation; stage 1 of MEH-3216); MEH-3262 (stage 2a:
          producer_order_windows, slot_minutes, lead_time_hours)

Lives in its own module, not in models.py, because models.py is on the
file-size baseline and does not grow (code-execution.md §16).
"""

import uuid

from sqlalchemy import (
    CHAR,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base
from app.utils.clock import utc_now

# The vocabularies live here once. The DB CHECKs in revision d5a7c3e9f1b4
# mirror them and tests/test_meh3218_product_orders.py pins the two together —
# a new value means a new revision AND an entry here, never one without the
# other (the RESCUE_ORDER_STATUSES precedent).
#
# `payment_status` has ONE value today: the buyer pays the business directly.
# The column exists so on-site payment can be added later as a CHECK widening
# plus new values, not as a rewrite of every query that reads an order.
PRODUCT_PRICE_UNITS = ("unit", "kg", "100g")
PRODUCT_ORDER_STATUSES = (
    "pending",
    "confirmed",
    "change_proposed",
    "ready",
    "handed",
    "declined",
    "cancelled",
    "expired",
    "no_show",
)
PRODUCT_ORDER_FULFILMENTS = ("pickup", "delivery")
PRODUCT_ORDER_PAYMENT_STATUSES = ("direct_to_business",)
PRODUCT_ORDER_ACTORS = ("customer", "business", "admin", "system")
PRODUCT_ORDER_MAX_QTY_PER_ITEM = 99
PRODUCT_ORDER_MAX_CUTOFF_HOURS = 168
PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS = 24
# MEH-3262: how long one pickup/delivery slot is, and how early an order must
# be sent. Mirrored by the CHECKs of revision e6b9d4f1a2c7.
PRODUCT_ORDER_SLOT_MINUTES = (30, 60, 120)
PRODUCT_ORDER_DEFAULT_SLOT_MINUTES = 60
PRODUCT_ORDER_MAX_LEAD_HOURS = 168
PRODUCT_ORDER_DEFAULT_LEAD_HOURS = 24
# Four windows a day, seven days: more than any real week needs, and the
# bound that keeps the table from growing without limit (MEH-3022).
PRODUCT_ORDER_MAX_WINDOWS = 28


def _check_in(column: str, values: tuple[str, ...]) -> str:
    """`col IN ('a', 'b')` from one tuple. REUSES: app/models/models.py
    `_check_in` — repeated here (three lines) instead of imported, so this
    module does not import models.py and models.py can import it at its end
    without a cycle."""
    return "{} IN ({})".format(column, ", ".join(f"'{v}'" for v in values))


class ProducerOrderSettings(Base):
    """One row per business: whether it takes orders on its page, and how.

    No row means ordering is OFF, and so does `enabled = false` — a business
    that never opened the settings screen and one that switched ordering off
    look the same to a buyer. Ordering is opt-in per business (Sapir, 14/11).

    `alcohol_licensed` is written by an admin only; the owner route never
    accepts it. Without it a product flagged `contains_alcohol` is display-only.

    A table of its own rather than seven more columns on `producers`: the
    listing and map queries load `producers` on every request and none of them
    needs these.
    """

    __tablename__ = "producer_order_settings"
    __table_args__ = (
        CheckConstraint(
            "cancel_cutoff_hours >= 0 AND cancel_cutoff_hours <= "
            f"{PRODUCT_ORDER_MAX_CUTOFF_HOURS}",
            name="producer_order_settings_cutoff_check",
        ),
        CheckConstraint(
            "auto_confirm_slot_cap IS NULL OR auto_confirm_slot_cap >= 1",
            name="producer_order_settings_slot_cap_check",
        ),
        CheckConstraint(
            "min_order_agorot IS NULL OR min_order_agorot >= 0",
            name="producer_order_settings_min_order_check",
        ),
        CheckConstraint(
            "slot_minutes IN ({})".format(
                ", ".join(str(m) for m in PRODUCT_ORDER_SLOT_MINUTES)
            ),
            name="producer_order_settings_slot_minutes_check",
        ),
        CheckConstraint(
            "lead_time_hours >= 0 AND lead_time_hours <= "
            f"{PRODUCT_ORDER_MAX_LEAD_HOURS}",
            name="producer_order_settings_lead_time_check",
        ),
    )

    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    enabled = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    auto_confirm = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    auto_confirm_slot_cap = Column(Integer, nullable=True)
    cancel_cutoff_hours = Column(
        Integer,
        default=PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS,
        nullable=False,
        server_default=text(str(PRODUCT_ORDER_DEFAULT_CUTOFF_HOURS)),
    )
    shabbat_observant = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    min_order_agorot = Column(Integer, nullable=True)
    slot_minutes = Column(
        Integer,
        default=PRODUCT_ORDER_DEFAULT_SLOT_MINUTES,
        nullable=False,
        server_default=text(str(PRODUCT_ORDER_DEFAULT_SLOT_MINUTES)),
    )
    lead_time_hours = Column(
        Integer,
        default=PRODUCT_ORDER_DEFAULT_LEAD_HOURS,
        nullable=False,
        server_default=text(str(PRODUCT_ORDER_DEFAULT_LEAD_HOURS)),
    )
    alcohol_licensed = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    producer = relationship("Producer")


class ProducerOrderWindow(Base):
    """One weekly window in which a business hands orders over.

    `producers.opening_hours` is free text and cannot yield a time slot, so
    the business states its ordering windows here: a weekday, a start and an
    end on the Israel clock, and whether the window is for pickup or delivery.
    services/product_order_slots.py cuts these into concrete slots.

    `weekday` is 0 = Sunday ... 6 = Saturday — the convention of
    `producers.order_window` and lib/orderWindow.js, NOT `date.weekday()`.

    Not the same fact as `producers.order_window` (when the owner ANSWERS
    orders, MEH-1543): a row here is when she HANDS one over. A date closed in
    `producers.special_hours` and her vacation close this axis too
    (services/product_order_slots.py::ClosedDays).

    Written only as a whole list (PUT replaces every row of the business),
    capped at PRODUCT_ORDER_MAX_WINDOWS by the request schema.
    """

    __tablename__ = "producer_order_windows"
    __table_args__ = (
        CheckConstraint(
            "weekday >= 0 AND weekday <= 6", name="producer_order_windows_weekday_check"
        ),
        CheckConstraint(
            "end_time > start_time", name="producer_order_windows_time_check"
        ),
        CheckConstraint(
            _check_in("fulfilment", PRODUCT_ORDER_FULFILMENTS),
            name="producer_order_windows_fulfilment_check",
        ),
        Index("ix_producer_order_windows_producer_id", "producer_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    weekday = Column(SmallInteger, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    fulfilment = Column(String(10), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)


class ProductOrder(Base):
    """One buyer's order request to one business.

    Money is integers in agorot. `estimated_total_agorot` is what the buyer saw
    when she sent the request; `final_total_agorot` is set by the business at
    confirmation (weighed goods) and is the figure a commission is computed on.

    `user_id` is nullable and SET NULL: a guest orders with a verified phone
    and no account (Sapir, 14/11), and deleting an account must not delete the
    business's record of what it handed over.
    """

    __tablename__ = "product_orders"
    __table_args__ = (
        CheckConstraint(
            _check_in("status", PRODUCT_ORDER_STATUSES),
            name="product_orders_status_check",
        ),
        CheckConstraint(
            _check_in("fulfilment", PRODUCT_ORDER_FULFILMENTS),
            name="product_orders_fulfilment_check",
        ),
        CheckConstraint(
            _check_in("payment_status", PRODUCT_ORDER_PAYMENT_STATUSES),
            name="product_orders_payment_status_check",
        ),
        CheckConstraint(
            "estimated_total_agorot >= 0 AND delivery_fee_agorot >= 0 AND "
            "(final_total_agorot IS NULL OR final_total_agorot >= 0)",
            name="product_orders_amounts_check",
        ),
        CheckConstraint("slot_end > slot_start", name="product_orders_slot_check"),
        CheckConstraint(
            "pickup_code IS NULL OR pickup_code ~ '^[0-9]{4}$'",
            name="product_orders_pickup_code_check",
        ),
        Index("ix_product_orders_producer_status", "producer_id", "status"),
        Index("ix_product_orders_user_id", "user_id"),
        Index("ix_product_orders_customer_phone", "customer_phone"),
        Index("ix_product_orders_expires_at", "expires_at"),
        Index("ix_product_orders_producer_slot", "producer_id", "slot_start"),
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
    delivery_address = Column(Text, nullable=True)
    slot_start = Column(DateTime, nullable=False)
    slot_end = Column(DateTime, nullable=False)
    note = Column(Text, nullable=True)
    estimated_total_agorot = Column(Integer, nullable=False)
    final_total_agorot = Column(Integer, nullable=True)
    delivery_fee_agorot = Column(
        Integer, default=0, nullable=False, server_default=text("0")
    )
    status = Column(
        String(20), default="pending", nullable=False, server_default=text("'pending'")
    )
    payment_status = Column(
        String(30),
        default="direct_to_business",
        nullable=False,
        server_default=text("'direct_to_business'"),
    )
    pickup_code = Column(CHAR(4), nullable=True)
    age_declared = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    expires_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)
    handed_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    producer = relationship("Producer")
    user = relationship("User", foreign_keys=[user_id])
    items = relationship(
        "ProductOrderItem",
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    events = relationship(
        "ProductOrderEvent",
        back_populates="order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ProductOrderEvent.created_at",
    )


class ProductOrderItem(Base):
    """One line of an order, with the product's name and price COPIED at order
    time.

    The copy is the point: the business may rename the product or change its
    price tomorrow, and the order must still say what the buyer agreed to.
    `product_id` is SET NULL for the same reason — deleting a product does not
    rewrite the orders that contained it.
    """

    __tablename__ = "product_order_items"
    __table_args__ = (
        CheckConstraint(
            f"qty >= 1 AND qty <= {PRODUCT_ORDER_MAX_QTY_PER_ITEM}",
            name="product_order_items_qty_check",
        ),
        CheckConstraint(
            "unit_price_agorot >= 0", name="product_order_items_price_check"
        ),
        CheckConstraint(
            _check_in("price_unit", PRODUCT_PRICE_UNITS),
            name="product_order_items_price_unit_check",
        ),
        Index("ix_product_order_items_order_id", "order_id"),
        Index("ix_product_order_items_product_id", "product_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("product_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = Column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="SET NULL"),
        nullable=True,
    )
    name = Column(String(200), nullable=False)
    unit_price_agorot = Column(Integer, nullable=False)
    price_is_estimate = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    price_unit = Column(
        String(10), default="unit", nullable=False, server_default=text("'unit'")
    )
    qty = Column(Integer, nullable=False)
    contains_alcohol = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )

    order = relationship("ProductOrder", back_populates="items")
    product = relationship("Product")


class ProductOrderEvent(Base):
    """The append-only log of an order's status changes.

    One row per transition: from what, to what, who did it and when. It is what
    answers «the business says it confirmed, the buyer says it never did».
    """

    __tablename__ = "product_order_events"
    __table_args__ = (
        CheckConstraint(
            _check_in("to_status", PRODUCT_ORDER_STATUSES),
            name="product_order_events_to_status_check",
        ),
        CheckConstraint(
            _check_in("actor", PRODUCT_ORDER_ACTORS),
            name="product_order_events_actor_check",
        ),
        Index("ix_product_order_events_order_id", "order_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("product_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_status = Column(String(20), nullable=True)
    to_status = Column(String(20), nullable=False)
    actor = Column(String(10), nullable=False)
    actor_user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    order = relationship("ProductOrder", back_populates="events")
