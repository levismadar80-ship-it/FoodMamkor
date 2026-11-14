"""
Module:    models/catalog
Purpose:   What a business sells and where: products, delivery areas,
           locations (branches and sale points) and offers.
Does NOT:  Hold the business row itself (models.py) or home-kitchen
           products (home_products.py).
Split out of models/models.py (MEH-3269); the code is moved verbatim and
every name is still importable from app.models.models.
"""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import relationship, validates
from app.data.cities import canonical_city
from app.database import Base
from app.utils.clock import utc_now


class Product(Base):
    __tablename__ = "products"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    name = Column(String(200), nullable=False)
    description = Column(Text)
    # LEGACY(2026-11-30, MEH-2064)
    # MEH-2145: the swap MEH-1857 asked for. That marker pointed at ITSELF
    # because the "MEH-295 follow-up" the line below promised had never been
    # opened, and it said in as many words: "whoever opens it should swap the
    # id here." MEH-2064 was opened on 13/08 and is the real removal ticket,
    # so the marker now names it. **The DATE is unchanged** — swapping the
    # owner is not an extension, and extending an expiry is Sapir's call made
    # deliberately in a reviewed PR, never a side effect of re-pointing it.
    #
    # MEH-2064 is RED and carries its own entry conditions (a count of rows
    # with price_range set and price_min NULL, and the removal of the frontend
    # fallbacks) — naming it here records who removes this column, not that
    # the removal is ready.
    #
    # Separate instance from the producer-level price alias MEH-1855 retired
    # (chunk 2, 9849fab1637a) — same class, different column.
    price_range = Column(String(50))  # legacy: removal tracked in MEH-2064
    image_url = Column(Text)
    price_min = Column(Numeric(10, 2), nullable=True)
    price_max = Column(Numeric(10, 2), nullable=True)
    # MEH-293: per-product dietary flags. Old producer-level columns
    # (producers.gluten_free / vegan / lactose_free) preserved during the
    # 7-day overlap; reads aggregate `any(p.is_X for p in producer.products)`
    # and the public filter switches to an EXISTS subquery on these.
    is_gluten_free = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    is_vegan = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    # MEH-1438: vegetarian axis (4th dietary flag). A vegan product is
    # vegetarian by definition, so the public ?vegetarian filter matches
    # `is_vegetarian OR is_vegan` (producer_listing.py) and the aggregation
    # counts is_vegan too — the owner needn't mark both. Mirrors MEH-293.
    is_vegetarian = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    is_lactose_free = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    # MEH-1934: fifth + sixth dietary axes — "ללא סוכר מוסף" / "דל פחמימות".
    # Same any-product, self-declared mechanic as the four above. Unlike
    # MEH-1438's is_vegetarian these are NOT backfilled from any existing flag:
    # nothing in the catalog implies "no added sugar" or "low carb", so seeding
    # would invent a nutrition claim on the business's behalf. The owner's
    # product form is the only writer.
    is_no_added_sugar = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    is_low_carb = Column(
        Boolean, default=False, nullable=False, server_default=text("false")
    )
    # MEH-2662: owner-declared, optional — free-text ingredient list and
    # allergen codes from the closed list in app/allergens.py. NULL = not
    # filled (the sheet shows nothing), never "contains none".
    ingredients = Column(Text, nullable=True)
    # MEH-3055: owner order (NULL = never ordered) + group id from
    # producers.product_groups (no FK; cleared by routers/product_organize.py).
    position = Column(Integer, nullable=True)
    group_id = Column(String(36), nullable=True)
    allergens: Column[list[str]] = Column(ARRAY(Text), nullable=True)

    # MEH-2137: the other half of the same disambiguation — see the comment on
    # Producer.products. Without it this side raises the same error.
    producer = relationship(
        "Producer", back_populates="products", foreign_keys="Product.producer_id"
    )
    # MEH-588: M2M back-ref so a Product can list the producer's recipes
    # that promote it. `secondary` points to the link Table defined in models/recipes.py.
    recipes = relationship(
        "ProducerRecipe",
        secondary="producer_recipe_products",
        back_populates="products",
    )

    # idx_products_dietary — added in MEH-293 migration 1afe844d11f4
    # (2026-05-07). Partial index covers products with at least one
    # dietary flag set; mirrors EXISTS-subquery filter pattern.
    # MEH-1438: predicate extended with is_vegetarian (the MEH-1438 migration
    # drops + recreates the index). Keep this text byte-identical to the
    # migration's create_index predicate so `alembic check` stays drift-free.
    # MEH-1934: extended again with is_no_added_sugar + is_low_carb (revision
    # a2f7d4c8e153 drops + recreates). Without them in the predicate, a product
    # marked ONLY low-carb falls outside the partial index and the ?low_carb
    # EXISTS subquery seq-scans products.
    __table_args__ = (
        Index(
            "idx_products_dietary",
            "producer_id",
            postgresql_where=text(
                "is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free "
                "OR is_no_added_sugar OR is_low_carb"
            ),
        ),
    )


class DeliveryArea(Base):
    __tablename__ = "delivery_areas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    city = Column(String(100), nullable=False)
    min_order = Column(Integer)
    delivery_day = Column(String(50))
    # MEH-1772: per-area OVERRIDE of producers.delivery_fee (MEH-1577).
    # NULL = no override → the public page inherits the producer-level fee.
    # 0 is NOT absence: it means "משלוח חינם" to this area specifically, so
    # every read must gate on `is not None`, never on truthiness.
    # INTEGER to match min_order above AND the producer-level column it
    # overrides — a Decimal/int fork would serialize two JSON shapes for the
    # same rendered "₪" (whole shekels, display-only; Sapir 27/07).
    # DO NOT add the column here without the paired Alembic revision —
    # Alembic is the sole schema authority since MEH-267 (a4f7c2e91b58).
    delivery_fee = Column(Integer)

    producer = relationship("Producer", back_populates="delivery_areas")

    @validates("city")
    def _canonical_city(self, _key: str, value: str | None) -> str | None:
        # MEH-2602 — same one-spelling rule as Producer.city.
        return canonical_city(value)


class ProducerLocation(Base):
    """MEH-1395 (MEH-1388 chunk 1): a physical presence point of a producer —
    a branch, a self-pickup point, or a market stand. One producer can have
    many (evidence: "הלחם של גל" self-pickup from 10 points, MEH-1382). This
    chunk lays the Expand-phase data layer ONLY: no serialization (schemas),
    no routers, no map/geo query wiring — those are MEH-1388 chunks 2-4.

    Conventions mirrored from the recent child models:
      - id / producer_id FK CASCADE / created_at / updated_at follow
        ProducerRecipe (models.py:1328-1365) and DeliveryArea (models.py:511).
      - `opening_hours` is the SAME unbounded free-text String as
        Producer.opening_hours (models.py:166, MEH-102) — the ticket asks for
        parity; not a bounded column.
      - `kind` / `location_precision` CHECK constraints are declared BOTH here
        (so a fresh create_all test DB has them) AND mirrored in the paired
        Alembic revision, matching the Producer MEH-272 precedent
        (models.py:292-306). Alembic autogenerate does not diff CHECK
        conditions, so no canonical-form worry (unlike the MEH-291 index
        predicate at models.py:269-272).

    Delivery *areas* stay in the separate `delivery_areas` table — a delivery
    zone is not a physical location (MEH-1382 constraint). Paired migration:
    drafted in the MEH-1395 PR body, committed by Sapir (alembic/versions is
    CC-deny).

    History: MEH-1395 (creation, chunk 1/5 of the producer_locations epic
    MEH-1388).
    """

    __tablename__ = "producer_locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # branch | pickup | market_stand — CHECK mirrored in the revision.
    kind = Column(String(20), nullable=False)
    label = Column(String(200), nullable=True)
    city = Column(String(100), nullable=True, index=True)
    address = Column(String(255), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    # Same unbounded free-text type as Producer.opening_hours (MEH-102).
    opening_hours = Column(String, nullable=True)
    phone = Column(String(20), nullable=True)
    is_primary = Column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    # exact | approximate — CHECK mirrored in the revision.
    location_precision = Column(
        String(20),
        nullable=False,
        default="exact",
        server_default=text("'exact'"),
    )
    created_at = Column(
        DateTime, nullable=False, default=utc_now, server_default=text("now()")
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("now()"),
    )

    producer = relationship("Producer", back_populates="locations")

    @validates("city")
    def _canonical_city(self, _key: str, value: str | None) -> str | None:
        # MEH-2602 — same one-spelling rule as Producer.city.
        return canonical_city(value)

    __table_args__ = (
        CheckConstraint(
            "kind IN ('branch', 'pickup', 'market_stand')",
            name="producer_location_kind",
        ),
        CheckConstraint(
            "location_precision IN ('exact', 'approximate')",
            name="producer_location_precision",
        ),
    )


class ProducerOffer(Base):
    """MEH-1823 chunk 1: ONE owner-declared, typed, expiring offer per business.

    An offer is a bounded, dated object with its own lifecycle — it expires and
    it is replaced — so it is a table, not columns on `producers`. The five
    types are a closed vocabulary:

      free_delivery_above  — free delivery over a threshold
      gift_above           — a gift with a purchase over a threshold
      first_order          — a first-order benefit
      pickup_discount      — a discount on self-pickup
      custom               — MEH-1898: the owner words the offer herself

    `custom` is the only type with no typed sentence behind it, so on every
    consumer surface its `headline` IS the offer text rather than a secondary
    line under one. That is a RENDERING rule and it lives on the rendering
    side (OfferBadge.jsx), which is also where the empty case resolves: a
    `custom` offer with no headline renders nothing at all, instead of a bare
    gift icon with no words next to it.

    **It is deliberately NOT a sixth CHECK.** "custom implies headline IS NOT
    NULL" is expressible in SQL and was still rejected: the agreed set is five
    CHECKs (02/08), and it would be the first constraint in this table that
    branches on `offer_type` — the exact shape of the cross-constraint that
    decision turned down. The empty-headline row is not corrupt data; it is an
    offer the site declines to display, which the reader never sees either way.
    Full reasoning: ProducerOfferCreate's docstring in schemas.py.

    `threshold_value` + `threshold_unit` exist because the evidence that opened
    the ticket had nowhere to live: a litres/units/kg threshold cannot be stored
    in `producers.free_delivery_above`, which is INTEGER shekels (models.py:262).
    The pair is both-or-neither — a number with no unit is unrenderable, a unit
    with no number is meaningless.

    `expires_at` is NOT NULL, and that is the property protecting the business
    rather than the reader: an always-on offer converges on discounting buyers
    who would have paid full price. An offer that cannot expire is a permanent
    discount nobody decided to give.

    **The threshold is optional for EVERY type, and is deliberately NOT gated by
    offer_type — at this layer or any other.** An automated reviewer proposed a
    cross-constraint forcing a threshold on free_delivery_above / gift_above and
    forbidding it on the other two. It was rejected on 02/08 (Sapir) because the
    forbidden combinations are real offers: "10% off pickup over ₪100" and
    "first order over ₪150". Which types may carry a threshold is a product
    question, not a data invariant, so there is no CHECK here and no
    type-conditional branch in ProducerOfferCreate either. Do not add one
    without a decision that overturns this note — five CHECKs is the agreed set.

    All five CHECKs and the unique partial index are declared BOTH here (so a
    fresh `create_all` test DB has them) AND in the paired Alembic revision —
    the MEH-272 precedent (models.py:380-401) and the same choice
    ProducerLocation made above. Alembic autogenerate does not diff CHECK
    conditions, so there is no canonical-form worry for those; the INDEX
    predicate does round-trip through `alembic check`, so its text is kept
    byte-identical to the revision's `postgresql_where`.

    # DO NOT add a column here without the paired Alembic revision — Alembic is
    #        the sole schema authority since MEH-267 (revision b6e1d94a3f27).

    Does NOT: serialize, validate, or expose anything. Pydantic schemas, the
    owner write path and the public read path are chunk 2 — see
    producer_me.py's delivery_areas pattern for the shape they will take.

    History: MEH-1823 (creation, chunk 1/3).
    """

    __tablename__ = "producer_offers"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    producer_id = Column(
        UUID(as_uuid=True),
        ForeignKey("producers.id", ondelete="CASCADE"),
        nullable=False,
    )
    offer_type = Column(Text, nullable=False)
    # NULL together with threshold_unit = "no threshold"; > 0 when stated.
    threshold_value = Column(Integer, nullable=True)
    threshold_unit = Column(Text, nullable=True)
    headline = Column(Text, nullable=True)
    # NULL = active now. A future date is a scheduled offer; nothing reads it
    # in chunks 2-3.
    starts_at = Column(Date, nullable=True)
    expires_at = Column(Date, nullable=False)
    is_active = Column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at = Column(
        DateTime, nullable=False, default=utc_now, server_default=text("now()")
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=text("now()"),
    )

    producer = relationship("Producer", back_populates="offers")

    __table_args__ = (
        CheckConstraint(
            # MEH-1898 added 'custom'. Kept byte-identical to the condition in
            # revision e4b1c72d9a35, which DROPs and re-ADDs this constraint —
            # Postgres has no ALTER CHECK, and autogenerate does not diff CHECK
            # conditions, so a drift between the two surfaces would be silent.
            "offer_type IN ('free_delivery_above', 'gift_above', "
            "'first_order', 'pickup_discount', 'custom')",
            name="producer_offer_type",
        ),
        CheckConstraint(
            "threshold_unit IN ('ils', 'units', 'liters', 'kg')",
            name="producer_offer_threshold_unit",
        ),
        # Equality form, not two OR'd implications: it is total, so neither
        # direction can be added later and forgotten, and IS NULL always
        # yields true/false (no three-valued-logic edge).
        CheckConstraint(
            "(threshold_value IS NULL) = (threshold_unit IS NULL)",
            name="producer_offer_threshold_pair",
        ),
        # A stated threshold is positive. "Over 0" is not a threshold — it is
        # unconditional, which NULL already spells; rejecting 0 removes a
        # duplicate spelling rather than a meaning.
        CheckConstraint(
            "threshold_value IS NULL OR threshold_value > 0",
            name="producer_offer_threshold_positive",
        ),
        # A dated window runs forwards. Strict `>`: a same-day window would
        # expire on the day it opens.
        CheckConstraint(
            "starts_at IS NULL OR expires_at > starts_at",
            name="producer_offer_date_order",
        ),
        # At most ONE active offer per business — and the lookup index for that
        # active row, which is the same index. A non-unique twin would carry
        # identical columns and predicate: double the write cost, no read gain.
        Index(
            "uq_producer_offers_active_per_producer",
            "producer_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )
