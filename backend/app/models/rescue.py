"""
Module:    models/rescue
Purpose:   The rescue-bags pilot: offers, orders, reviews and the typical
           items a business lists for its bags.
Does NOT:  Take or record any payment; the buyer pays at the counter.
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    CHAR,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import relationship
from app.database import Base
from app.utils.clock import utc_now


# MEH-2644: the statuses a rescue bag offer and a reservation can hold. One
# list each, mirrored by the DB CHECKs in Alembic revision a1c9f3e8d204 — a new
# status means a new revision AND an entry here, never one without the other
# (the SAVED_ITEM_TYPES precedent, models.py:1384).
#
# `paid` is deliberately absent from RESCUE_ORDER_STATUSES: the 03/11 pilot has
# no payment at all (buyers pay the business at the counter), so an order can
# never be in it. Re-adding it is an expand-phase CHECK widening, not a rewrite.
RESCUE_OFFER_STATUSES = ("active", "cancelled")
RESCUE_ORDER_STATUSES = ("reserved", "handed", "no_show", "cancelled")

# Pilot caps, held at the database by the CHECKs below as well as in the
# chunk-2 validators: at most 20 bags in one offer, at most 2 per buyer.
RESCUE_MAX_QTY_PER_OFFER = 20
RESCUE_MAX_QTY_PER_ORDER = 2


def _check_in(column: str, values: tuple[str, ...]) -> str:
    """`col IN ('a', 'b')` built from one Python tuple, so the model holds a
    single copy of the list. The revision's literal CHECK is pinned against
    these tuples by tests/test_rescue_migration.py.
    """
    return "{} IN ({})".format(column, ", ".join(f"'{v}'" for v in values))


class RescueOffer(Base):
    """MEH-2644 — one day's rescue bags at one physical pickup point.

    Hangs off `producer_locations`, not `producers`: a bag is collected at a
    place, and chunk 2 refuses a location whose `location_precision` is not
    `exact` (the MEH-829 exception that lets the full address be shown while a
    bag is live). A business with three branches publishes three offers.

    `qty_left` is the live counter. Chunk 2 decrements it under
    `with_for_update` exactly as group_buys.py does (MEH-773); the
    `0 <= qty_left <= qty_total` CHECK is what turns a lost race into a failed
    transaction instead of a negative stock number.

    Money is integer agorot throughout — never Float, never Numeric here: these
    are whole-shekel pilot prices and the frontend formats them.

    `status` carries only active | cancelled. Sold out is `qty_left == 0` and
    finished is `pickup_end` in the past, so neither earns a status value; a
    second owner for a derivable fact is the MEH-271 smell.

    Does NOT: serve anything. No router reads this table until chunk 2, and
              nothing renders it until chunk 4 — the whole feature is behind
              RESCUE_BAGS_ENABLED.
    History:  MEH-2644 (creation, chunk 1/4 of the rescue-bags pilot)
    """

    __tablename__ = "rescue_offers"
    __table_args__ = (
        CheckConstraint(
            _check_in("status", RESCUE_OFFER_STATUSES),
            name="rescue_offers_status_check",
        ),
        CheckConstraint(
            f"qty_total >= 1 AND qty_total <= {RESCUE_MAX_QTY_PER_OFFER}",
            name="rescue_offers_qty_total_check",
        ),
        CheckConstraint(
            "qty_left >= 0 AND qty_left <= qty_total",
            name="rescue_offers_qty_left_check",
        ),
        CheckConstraint("price_agorot >= 0", name="rescue_offers_price_check"),
        CheckConstraint(
            "pickup_end > pickup_start", name="rescue_offers_pickup_window_check"
        ),
        CheckConstraint(
            "qty_donated >= 0 AND qty_donated <= qty_total",
            name="rescue_offers_qty_donated_check",
        ),
        Index("ix_rescue_offers_location_date", "producer_location_id", "date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_location_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producer_locations.id", ondelete="CASCADE"),
        nullable=False,
    )
    date = Column(Date, nullable=False)
    qty_total = Column(Integer, nullable=False)
    qty_left = Column(Integer, nullable=False)
    price_agorot = Column(Integer, nullable=False)
    value_min_agorot = Column(Integer, nullable=True)
    value_max_agorot = Column(Integer, nullable=True)
    pickup_start = Column(DateTime, nullable=False)
    pickup_end = Column(DateTime, nullable=False)
    cancel_until = Column(DateTime, nullable=False)
    status = Column(String(20), default="active", nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    # MEH-2703: bags the business reports it gave away free after the pickup
    # window — never reserved, or reserved and not collected. Owner-reported;
    # the API caps it at that leftover, the CHECK only at qty_total (the
    # no-show half lives on rescue_orders, out of a row CHECK's reach).
    qty_donated = Column(Integer, nullable=False, default=0, server_default=text("0"))
    # MEH-2756: when the pickup_start WhatsApp digest of this offer's codes was
    # sent to the business. NULL = not sent, and it is the ONLY duplicate-send
    # guarantee the digest has. Delivery is at-least-once: the send is an
    # outbound HTTP call and the commit follows it, so a failed commit after
    # Meta accepted leaves this NULL and the next tick re-sends. Deliberate —
    # for counter codes a duplicate is cheaper than a miss.
    #
    # Deliberately INTERNAL: no `*Out` schema carries it and no endpoint reads
    # or writes it (ADR-006 R1/R2 — a new column reaches the schema unless it is
    # internal, and this one is). Its only reader and writer is
    # services/rescue_digest.py. A buyer has no use for it and the dashboard
    # shows the codes themselves, not when they were messaged.
    # DO NOT backfill: an existing offer was never digested, which is what NULL
    # says. TIMESTAMPTZ here while pickup_start/pickup_end/created_at above are
    # naive-UTC — deliberate, see the revision docstring and docs/DATA.md.
    codes_sent_at = Column(DateTime(timezone=True), nullable=True)

    location = relationship("ProducerLocation")
    # passive_deletes defers to the DB ON DELETE CASCADE — without it a
    # db.delete(offer) tries to NULL the NOT NULL orders.offer_id (the MEH-816
    # class, fixed for group_buys in MEH-2503).
    orders = relationship(
        "RescueOrder",
        back_populates="offer",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RescueNoShowTombstone(Base):
    """MEH-3225 — one no-show of a deleted account, so the two-no-shows block
    survives deleting the account. Only a keyed hash of the email
    (services/rescue_no_show.py::email_hash) and the bag's pickup_end: no
    email, name, business or order, and no FK. Kept 30 days from
    ``pickup_end`` (the rule's own window), then deleted by
    services/retention_purge.py."""

    __tablename__ = "rescue_no_show_tombstones"
    __table_args__ = (
        Index("ix_rescue_no_show_tombstones_email_hash", "email_hash"),
        Index("ix_rescue_no_show_tombstones_pickup_end", "pickup_end"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # hex HMAC-SHA256 of the normalised email, keyed with settings.secret_key
    email_hash = Column(String(64), nullable=False)
    pickup_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class RescueOrder(Base):
    """MEH-2644 — one buyer's reservation of one offer's bags.

    `pickup_code` is four digits the buyer reads aloud at the counter.
    UNIQUE (offer_id, pickup_code) is what lets the business type 4 digits and
    land on exactly one order. It is unique per OFFER, not globally: two
    businesses may both issue 0431 on the same evening, and a globally unique
    4-digit code would exhaust after 10k rows.

    No `amount_agorot`, no `paid_at`: the 03/11 pilot has no payment. The price
    lives on the offer; the money changes hands at the counter and this table
    never records it.

    `handed_by` is SET NULL, not CASCADE — deleting the staff account that
    handed a bag over must not delete the evidence that it was handed over.

    Does NOT: enforce the two-no-shows-in-30-days block. That gate is chunk 2,
              reading `status` over a window and `User.rescue_no_show_count`.
    History:  MEH-2644 (creation)
    """

    __tablename__ = "rescue_orders"
    __table_args__ = (
        UniqueConstraint("offer_id", "pickup_code", name="uq_rescue_orders_code"),
        CheckConstraint(
            _check_in("status", RESCUE_ORDER_STATUSES),
            name="rescue_orders_status_check",
        ),
        CheckConstraint(
            f"qty >= 1 AND qty <= {RESCUE_MAX_QTY_PER_ORDER}",
            name="rescue_orders_qty_check",
        ),
        CheckConstraint(
            "pickup_code ~ '^[0-9]{4}$'", name="rescue_orders_pickup_code_check"
        ),
        Index("ix_rescue_orders_user_id", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    offer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("rescue_offers.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    qty = Column(Integer, nullable=False)
    pickup_code = Column(CHAR(4), nullable=False)
    status = Column(String(20), default="reserved", nullable=False)
    handed_at = Column(DateTime, nullable=True)
    handed_by = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    cancelled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    offer = relationship("RescueOffer", back_populates="orders")
    # Two FKs point at `users`, so the join condition has to be spelled out or
    # SQLAlchemy raises AmbiguousForeignKeysError on first use.
    user = relationship("User", foreign_keys=[user_id])
    hander = relationship("User", foreign_keys=[handed_by])
    review = relationship(
        "RescueReview",
        back_populates="order",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RescueReview(Base):
    """MEH-2644 — the buyer's review of one collected bag. One per order.

    `contents_tags` / `highlight_tags` are JSONB (not JSON) so a later
    containment query stays cheap, matching producers.order_window
    (models.py:434). Chunk 4 writes the contents chips into the first.

    Does NOT: feed the public business rating. `ProducerReview` owns that;
              this is bag feedback for the pilot and is read by the chunk-5
              metrics endpoint only.
    History:  MEH-2644 (creation)
    """

    __tablename__ = "rescue_reviews"
    __table_args__ = (
        UniqueConstraint("order_id", name="uq_rescue_reviews_order"),
        CheckConstraint(
            "rating >= 1 AND rating <= 5", name="rescue_reviews_rating_check"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(
        UUID(as_uuid=True),
        ForeignKey("rescue_orders.id", ondelete="CASCADE"),
        nullable=False,
    )
    rating = Column(Integer, nullable=False)
    contents_tags = Column(JSONB, nullable=True)
    highlight_tags = Column(JSONB, nullable=True)
    photo_url = Column(String(500), nullable=True)
    comment = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)

    order = relationship("RescueOrder", back_populates="review")


class RescueTypicalItems(Base):
    """MEH-2644 — «בדרך כלל: …», what this business usually packs in a bag.

    One row per business, hence `producer_id` UNIQUE. Keyed on the producer and
    not on a location because what a bakery typically packs does not change
    between its branches.

    `items` is a JSONB list of strings, written once by the chunk-5 editor and
    read by the chunk-4 bag section. NOT NULL with a `[]` default so a read
    never has to distinguish "no row" from "empty list" — only the first.
    History:  MEH-2644 (creation)
    """

    __tablename__ = "rescue_typical_items"
    __table_args__ = (
        UniqueConstraint("producer_id", name="uq_rescue_typical_items_producer"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    items = Column(JSONB, nullable=False, default=list)
    # MEH-2752: the 14-code allergen list this business declares for its bag.
    # NULL = nothing filled; [] is NEVER stored, because an empty list reads as
    # "contains none of them", which is a food-safety claim nobody made.
    # `normalize_allergens` collapses both to None on the way in.
    # Annotated like the products column at models.py:1117 (MEH-2662): mypy
    # --strict reaches this file transitively from app/auth.py and asks for an
    # annotation on a generic ARRAY column (`var-annotated`). The six unannotated
    # ones above are grandfathered in backend/mypy-baseline.txt; a NEW one is
    # annotated rather than added to the baseline.
    allergens: Column[list[str]] = Column(ARRAY(Text), nullable=True)
    created_at = Column(DateTime, default=utc_now, nullable=False)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    producer = relationship("Producer")
