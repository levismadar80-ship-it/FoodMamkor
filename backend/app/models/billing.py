"""
Module:   billing
Purpose:  The `billable_events` table — one row per booking a business got
          through the site (ADR-042), kept so the count survives after the
          booking itself is purged or deleted.
Touches:  billable_events.
Does NOT: hold personal data (no name, phone, email or user id — only the
          business, what kind of booking, and amounts), and does NOT charge:
          `fee_agorot` is what the price list WOULD ask, nothing is billed in
          the launch phase. Writing rows is app/services/billing_ledger.py.
Related:  app/pricing.py · app/services/billing_ledger.py ·
          alembic/versions/20261114_1700_d5b8f2a6c341_meh3179_billable_events.py
History:  MEH-3179 (creation, 2026-11-14). Lives in its own module, not in
          models.py, which is at its file-size baseline (exec §16).
"""

from __future__ import annotations

import uuid

from sqlalchemy import (
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
from app.utils.clock import utc_now

BILLABLE_KINDS = (
    "event_registration",
    "experience_registration",
    "group_buy_order",
    "rescue_bag",
)
BILLABLE_STATUSES = ("counted", "voided")


class BillableEvent(Base):
    __tablename__ = "billable_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    kind = Column(String(30), nullable=False)
    # The id of the registration / group-buy commit / rescue order this row
    # counts. NOT a foreign key on purpose: registrations are purged 30 days
    # after the item's date and the count must outlive them.
    source_id = Column(UUID(as_uuid=True), nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)
    quantity = Column(Integer, nullable=False, default=1)
    base_amount_agorot = Column(Integer, nullable=False, default=0)
    fee_agorot = Column(Integer, nullable=False, default=0)
    price_list_version = Column(Integer, nullable=False)
    status = Column(String(10), nullable=False, default="counted")
    voided_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=utc_now)

    __table_args__ = (
        # One booking is counted once, however many times the hook runs.
        UniqueConstraint("kind", "source_id", name="uq_billable_events_kind_source"),
        CheckConstraint(
            "kind IN ('event_registration','experience_registration',"
            "'group_buy_order','rescue_bag')",
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
