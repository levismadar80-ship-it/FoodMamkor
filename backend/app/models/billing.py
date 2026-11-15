"""
Module:   billing
Purpose:  The `billable_events` table — one row per booking a business got
          through the site (ADR-042), kept so the count survives after the
          booking itself is purged or deleted.
Touches:  billable_events, business_billing.
Does NOT: hold personal data (no name, phone, email or user id — only the
          business, what kind of booking, and amounts), and does NOT charge:
          `fee_agorot` is what the price list WOULD ask, nothing is billed in
          the launch phase. Writing rows is app/services/billing_ledger.py.
Related:  app/pricing.py · app/services/billing_ledger.py ·
          alembic/versions/20261114_1700_d5b8f2a6c341_meh3179_billable_events.py ·
          alembic/versions/20261114_2100_e6c9a3b7d452_meh3208_ledger_outlives_business.py
History:  MEH-3179 (creation, 2026-11-14) · MEH-3208 (rows outlive the
          business: SET NULL + `producer_ref`, 2026-11-14). Lives in its own module, not in
          models.py, which is at its file-size baseline (exec §16).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base

BILLABLE_KINDS = (
    "event_registration",
    "experience_registration",
    "group_buy_order",
    "rescue_bag",
    # MEH-3216: an order of products through the site, counted when handed
    # over. Written by the product-orders work once it lands; nothing yet.
    "product_order",
)
BILLABLE_STATUSES = ("counted", "voided")

# MEH-3180: where a business stands in billing. No row = "launch".
# What each state may do is decided in app/services/capabilities.py only.
BILLING_STATES = ("launch", "notice", "active", "page_only", "unpaid")


class BusinessBilling(Base):
    """One row per business that has LEFT the launch default (MEH-3180).

    Its own table, not columns on `producers`: the page of a business and its
    billing account are different things with different readers, the way a
    payments system keeps a customer / subscription apart from the user row.
    No payment details and no personal data. A change of state will also be
    written to a history table when the billing stage builds the transitions.
    DO NOT read this table in a route — ask app/services/capabilities.py.
    """

    __tablename__ = "business_billing"

    # CASCADE: this is the business's CURRENT state and has no meaning without
    # it. What it was billed is the ledger below, and that is kept (MEH-3208).
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        primary_key=True,
    )
    state = Column(String(12), nullable=False)
    state_since = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    # The price list the business joined billing under (app/pricing.py).
    price_list_version = Column(Integer, nullable=True)
    subscribed = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "state IN ('launch','notice','active','page_only','unpaid')",
            name="ck_business_billing_state",
        ),
    )


class BillableEvent(Base):
    __tablename__ = "billable_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # NULL once the business is deleted: the row stays (MEH-3208). Records of
    # what a business was, or would be, billed are kept seven years from the
    # end of the tax year (income-tax bookkeeping rules), so deleting a
    # business must not delete them.
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="SET NULL"),
        nullable=True,
    )
    # The same id, kept after the business is gone. NOT a foreign key on
    # purpose, like `source_id`: it says which rows belonged together, and to
    # which invoice, without pointing at a person or a page.
    producer_ref = Column(
        UUID(as_uuid=True),
        nullable=False,
        # A writer that sets only `producer_id` still gets the kept copy.
        default=lambda ctx: ctx.get_current_parameters()["producer_id"],
    )
    kind = Column(String(30), nullable=False)
    # The id of the registration / group-buy commit / rescue order this row
    # counts. NOT a foreign key on purpose: registrations are purged 30 days
    # after the item's date and the count must outlive them.
    source_id = Column(UUID(as_uuid=True), nullable=False)
    occurred_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    quantity = Column(Integer, nullable=False, default=1)
    # BigInteger: units x price of a group-buy order can pass 2^31 agorot.
    base_amount_agorot = Column(BigInteger, nullable=False, default=0)
    fee_agorot = Column(BigInteger, nullable=False, default=0)
    price_list_version = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="counted")
    voided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        # One booking is counted once, however many times the hook runs.
        UniqueConstraint("kind", "source_id", name="uq_billable_events_kind_source"),
        CheckConstraint(
            "kind IN ('event_registration','experience_registration',"
            "'group_buy_order','rescue_bag','product_order')",
            name="ck_billable_events_kind",
        ),
        CheckConstraint(
            "status IN ('counted','voided')", name="ck_billable_events_status"
        ),
        CheckConstraint("quantity >= 1", name="ck_billable_events_quantity"),
        CheckConstraint(
            "base_amount_agorot >= 0 AND fee_agorot >= 0",
            name="ck_billable_events_amounts",
        ),
        # The monthly summary reads one business over a time window.
        Index("ix_billable_events_producer_occurred", "producer_id", "occurred_at"),
    )
