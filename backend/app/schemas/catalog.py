"""
Module:    schemas/catalog
Purpose:   Categories, cities, delivery areas, locations, offers and
           products as the API reads and writes them.
Does NOT:  Describe the business page itself (producer.py).
Split out of schemas/schemas.py (MEH-3270); the code is moved verbatim and
every name is still importable from app.schemas.schemas.
"""

import re
from datetime import date
from decimal import Decimal
from typing import Any, Literal, Self
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from app.allergens import normalize_allergens
from app.utils.clock import israel_today
from app.schemas.schemas import (
    DeliveryDayField,
    MAX_DELIVERY_MONEY,
    PhoneNumberField,
    SanitizedAddressField,
    SanitizedDescriptionField,
    SanitizedLabelField,
    _image_url_validator,
    _min_letters_validator,
)


# --- Category ---
class CategoryOut(BaseModel):
    id: int
    name: str
    # MEH-2139: the STABLE identity. ADR-006 R1 — a new non-internal column
    # belongs in the matching *Out.
    #
    # `str | None` is NOT a description of the DDL. The column is **NOT NULL**
    # in the database as of revision c9f2a41e8b03 (chunk 2); a7c3e91d5f28
    # (chunk 1) added it nullable, and the optional type here is left
    # deliberately lenient for CONSUMERS — an older client, a cached response,
    # or a fixture built before the backfill must not 500 on a missing key.
    # Tightening this to `str` would buy nothing and would turn any such
    # payload into a validation error at the serializer.
    #
    # (This comment read "NOT NULL is deferred to the switch step" until chunk
    # 2, which IS that step — the future tense outlived the event it described
    # and told the next reader the column was still nullable. Caught by the CI
    # reviewer on PR #3052.)
    slug: str | None = None
    emoji: str | None = None
    # MEH-1456 chunk A: the seeded-row ownership flag, on the same ADR-006 R1
    # reasoning as `slug` above — a new non-internal column rides the matching
    # *Out in the SAME PR (the CI reviewer flagged its absence on PR #3392).
    # Read-only on every surface; chunk 2b gates rename/delete on it in
    # update_category / delete_category and the admin UI reads it from here.
    # `False` default (not Optional) because the column is NOT NULL two-state.
    # Deliberately NOT on CategoryHit: a search hit never gates an edit.
    is_system: bool = False
    # MEH-3255 (D10): manufacturer licence required for this category. Same
    # ADR-006 R1 reasoning as `is_system` — the new column rides CategoryOut.
    requires_license: bool
    # MEH-1034: query-time count over producer_categories, populated only by
    # GET /admin/categories. Optional so public consumers (GET /categories,
    # ProducerOut.categories) serialize unchanged — NOT a DB column.
    producer_count: int | None = None

    model_config = {"from_attributes": True}


class ProducerCityOut(BaseModel):
    """MEH-970 — one row of GET /producers/cities: live approved-producer
    count for a single city, consumed by the /map region control."""

    city: str
    count: int


class ProducerRandomOut(BaseModel):
    """MEH-1288 — GET /producers/random: minimal identity of one random
    approved producer, just enough for the homepage "הפתיעו אותי" button to
    navigate (slug preferred, id fallback — mirrors ProducerCard's href)."""

    id: UUID
    slug: str | None = None


# --- Delivery Area ---
class DeliveryAreaCreate(BaseModel):
    city: str
    min_order: int | None = None
    # MEH-1644: whitelist (DELIVERY_DAYS) on the write path. Every row-write
    # flows through this schema — ProducerRegister.delivery_areas (auth.py
    # apple/google + producer_queries.register_producer) and
    # ProducerUpdate.delivery_areas (producer_me PUT) — so one field covers
    # them all. None allowed = "בתיאום מראש".
    delivery_day: DeliveryDayField | None = None
    # MEH-1772: per-area override of producers.delivery_fee. NULL = inherit.
    # Same three-value semantics as the producer-level field (MEH-1577):
    # None = not stated, 0 = "משלוח חינם", positive = the fee.
    delivery_fee: int | None = None

    # REUSES: backend/app/schemas/schemas.py:1604 (ProducerUpdate.
    # _validate_delivery_fee, MEH-1577) — identical bounds and identical
    # Hebrew copy, deliberately. The two live on different models (this one
    # validates a row inside a list; that one a producer field), so Pydantic
    # cannot share the validator without a mixin that would drag
    # free_delivery_above — a producer-level-only field — onto this row.
    #
    # The upper bound is not decoration: the column is Postgres INTEGER, and
    # without it a larger value passes validation and raises
    # NumericValueOutOfRange at flush — a 500, which is exactly what the
    # no-DB-CHECK design exists to avoid.
    @field_validator("delivery_fee")
    @classmethod
    def _validate_area_delivery_fee(cls, v: int | None) -> int | None:
        if v is None:
            return None
        # 0 is legal and load-bearing — "משלוח חינם" to this area, distinct
        # from NULL ("inherit the producer's fee"). Only negatives rejected.
        if v < 0:
            raise ValueError("עלות משלוח לא יכולה להיות שלילית")
        if v > MAX_DELIVERY_MONEY:
            raise ValueError("עלות משלוח גבוהה מדי")
        return v


class DeliveryAreaOut(BaseModel):
    id: UUID
    city: str
    min_order: int | None = None
    delivery_day: str | None = None
    # MEH-1772: emitted so the public page can render the per-area fee and
    # fall back to the producer-level one when this is NULL. The fallback is
    # resolved on the CLIENT (chunk 3), not here — serializing an already
    # coalesced value would erase the difference between "this area overrides
    # with the same number" and "this area inherits", which is the one thing
    # the "משלוח מ-X₪" variance line needs to distinguish.
    delivery_fee: int | None = None

    model_config = {"from_attributes": True}


class ProducerLocationOut(BaseModel):
    """MEH-1402 (MEH-1388 chunk 2): one physical presence point (branch /
    pickup / market_stand) serialized on `ProducerListOut.locations[]`. Read
    straight off the `ProducerLocation` ORM rows (selectinload'd in
    producer_listing.py — no N+1). Since MEH-1938 chunk 5a these rows are the
    ONLY source of a business's position: `ProducerListOut.lat/lng` are
    derived from the `is_primary` row here, and the `Producer.lat/lng`
    columns are a legacy mirror ahead of the chunk-5b drop (the map UI
    consumes this array). `precision` is emitted from the ORM's `location_precision`
    column (serialization_alias) to match the epic's map contract shape.
    Street `address` is intentionally NOT exposed here — MEH-829 keeps the
    exact address admin/owner-only; the map pins on lat/lng + city and
    navigation is built from lat/lng.

    Field set: kind, label, city, lat, lng, is_primary, precision (the epic's
    locked map contract) plus `opening_hours` + `phone`. MEH-1509 (chunk-1
    backend) added the latter two so the public business page can render real
    pickup / market_stand rows — "where and when" (opening_hours) and
    click-to-call (phone) — instead of a single generic boolean line. The
    columns already existed on the ORM `ProducerLocation` (models.py; revision
    a9f4c2e7b1d3); this is serialization only, no migration. (Chunk 2 renders
    them in DeliveryBlock.) Street `address` stays OFF this public shape.
    """

    kind: str
    label: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    is_primary: bool = False
    # MEH-1509 (MEH-1388, chunk-1 backend): serialized so the business page can
    # show a pickup point's hours + phone. address stays off (MEH-829).
    opening_hours: str | None = None
    phone: str | None = None
    # Field name matches the ORM attribute (from_attributes reads it directly);
    # serialization_alias emits the epic's contract key `precision` on the wire
    # (FastAPI dumps response models with by_alias=True).
    location_precision: str = Field(default="exact", serialization_alias="precision")

    model_config = {"from_attributes": True}


# MEH-1421 (MEH-1388 chunk 4a): shared enums — same value sets as the ORM CHECK
# constraints (models.py:536) so an invalid kind/precision is a clean 422 at the
# write boundary, not an IntegrityError at commit.
_LOCATION_KIND = Literal["branch", "pickup", "market_stand"]
_LOCATION_PRECISION = Literal["exact", "approximate"]


def _optional_label_letters(value: str | None) -> str | None:
    # MEH-1421: label is optional, but a supplied label is shown in the map
    # tooltip + drives the same-city disambiguation rule, so a punctuation-only
    # or 1-2 char label is meaningless. Empty/whitespace → None (treated as "no
    # label"); a real value must clear the ≥3-letter floor.
    # REUSES: backend/app/schemas/schemas.py:17 (_min_letters_validator)
    if value is None or value.strip() == "":
        return None
    return _min_letters_validator(value)


class ProducerLocationCreate(BaseModel):
    """MEH-1421 (MEH-1388 chunk 4a): owner-supplied physical presence point —
    the write side of ProducerLocationOut (schemas.py:414). `kind`/`precision`
    are the same CHECK-constrained enums as the ORM (models.py:536). Coordinates
    are optional (an owner may add a point before she has exact lat/lng — manual
    entry, no geocoding this chunk) but bounded when supplied. `label` reuses the
    MEH-555 letters floor. The single-primary invariant + same-city-label rule
    are enforced in the service layer (producer_me.py), not here — they are
    cross-row and need the DB session.
    """

    kind: _LOCATION_KIND
    label: str | None = None
    city: str | None = Field(None, max_length=100)
    # MEH-1626 chunk 1: these two were the 🔴 public asymmetry — the same
    # address/phone pair is validated on ProducerRegister but was raw here,
    # and producer_me.py:1271 persists this shape wholesale via **model_dump().
    address: SanitizedAddressField | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    opening_hours: str | None = None
    phone: PhoneNumberField | None = None
    is_primary: bool = False
    location_precision: _LOCATION_PRECISION = "exact"

    @field_validator("label")
    @classmethod
    def _validate_label(cls, v: str | None) -> str | None:
        return _optional_label_letters(v)


class ProducerLocationUpdate(BaseModel):
    """MEH-1421: partial update — every field optional; the endpoint applies with
    `exclude_unset=True` so an unsupplied field is left untouched (products
    precedent, producer_me.py:1109). Sending `label: ""` clears the label."""

    kind: _LOCATION_KIND | None = None
    label: str | None = None
    city: str | None = Field(None, max_length=100)
    # MEH-1626 chunk 1: parity with the Create twin above. `exclude_unset=True`
    # at producer_me.py:1291 means a supplied-but-emptied value still reaches
    # setattr, so ""→None here CLEARS the column as before (unlike ProfileUpdate,
    # whose handler gates on `is not None` — see the Phase 0 skip note in the PR).
    address: SanitizedAddressField | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lng: float | None = Field(None, ge=-180, le=180)
    opening_hours: str | None = None
    phone: PhoneNumberField | None = None
    is_primary: bool | None = None
    location_precision: _LOCATION_PRECISION | None = None

    @field_validator("label")
    @classmethod
    def _validate_label(cls, v: str | None) -> str | None:
        return _optional_label_letters(v)


class ProducerLocationOwnerOut(BaseModel):
    """MEH-1421: owner-facing read of her OWN location rows. Unlike the public
    ProducerLocationOut (schemas.py:414, which withholds street `address` per
    MEH-829 and trims to the map contract), the owner sees the full editable row
    (address / opening_hours / phone) in the dashboard editor. Emits the raw
    `location_precision` key (no `precision` alias) so the editor round-trips the
    same field name it POSTs. Returned by the /producers/me/locations CRUD."""

    id: UUID
    kind: str
    label: str | None = None
    city: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    opening_hours: str | None = None
    phone: str | None = None
    is_primary: bool = False
    location_precision: str = "exact"

    model_config = {"from_attributes": True}


# --- Producer offers (MEH-1823 chunk 2) ---
# Closed vocabularies, mirrored from the DB CHECKs on producer_offers
# (models.py `ProducerOffer.__table_args__`, revision b6e1d94a3f27). Kept as
# module constants so the router, the tests and the 422 message all read the
# same list — a second hand-written copy is how MEH-272 happened.
# MEH-1898 added the fifth member, `custom`. It is a plain member of the same
# tuple and gets NO special handling anywhere in this file: the 422 message
# below interpolates the tuple, so it names the new type for free, and every
# other validator stays type-blind. `custom` carries no typed sentence, so its
# text is the owner's `headline` — a rendering fact, enforced on the consumer
# surface (OfferBadge.jsx), never a conditional branch here.
OFFER_TYPES = (
    "free_delivery_above",
    "gift_above",
    "first_order",
    "pickup_discount",
    "custom",
)
THRESHOLD_UNITS = ("ils", "units", "liters", "kg")
MAX_OFFER_HEADLINE = 60

# MEH-1823: Emoji LOCK on the owner-supplied headline. Ranges mirror
# routers/alerts.py:376-383, including the MEH-1373 lesson — ZWJ and VS16 are
# written as explicit \u escapes, never as invisible literals in the class,
# because copy-paste / linters / merges silently drop or duplicate those.
# Unanchored (the alerts one is `^`-anchored): an emoji anywhere in a headline
# is rejected, not stripped, so the owner sees a 422 and fixes her own copy
# rather than having it silently altered.
_ZWJ = "\u200d"  # zero-width joiner
_VS16 = "\ufe0f"  # variation selector-16 (emoji presentation)
_EMOJI_ANYWHERE = re.compile(
    "[" + _ZWJ + _VS16 + "\U0001f300-\U0001faff"
    "\U00002600-\U000027bf"
    "\U0001f1e6-\U0001f1ff"
    "]"
)


class ProducerOfferCreate(BaseModel):
    """MEH-1823: the owner's declaration of her single active offer.

    Validation mirrors the five DB CHECKs rather than replacing them — the
    CHECKs guard direct-SQL paths (seed / import / psql), this layer turns the
    same violations into a 422 with a Hebrew message instead of a 500 from a
    constraint violation. Two rules exist ONLY here because they are not
    expressible as a CHECK against a moving "today": the future-expiry rule and
    the headline rules.

    **The threshold pair is optional for EVERY offer_type and is deliberately
    NOT gated by type** (Sapir, 02/08). "10% off pickup over ₪100" and "first
    order over ₪150" are both real offers, so which types may carry a threshold
    is a product question, not a validation one. Do not add a type-conditional
    branch here — see the note on ProducerOffer in models.py.

    **MEH-1898 extends that same rule to `custom`, and the tempting exception
    is the headline.** `custom` has no typed sentence, so on the consumer
    surface its `headline` IS the offer text — which reads like an argument for
    `if offer_type == "custom" and not headline: raise`. There is no such
    branch, and adding one would be the first type-conditional rule in this
    model. Two reasons it stays out. (1) It buys nothing a caller can rely on:
    the headline is `str | None` for every other type, the dashboard already
    requires it client-side before the request is ever sent, and OfferBadge
    renders nothing for a headline-less `custom` — so the empty case is already
    handled where it is visible, by showing no offer rather than an empty one.
    (2) It costs the uniformity that makes this model auditable: one
    type-conditional branch is the precedent for the cross-constraint Sapir
    rejected on 02/08, arriving through a side door.

    So `{"offer_type": "custom", "headline": null}` is a **200**, deliberately,
    and `tests/test_producer_offers.py` asserts exactly that. A future reader
    who reads it as a bug should read this paragraph first.

    **`is_active` is deliberately NOT a field here.** It used to be, defaulting
    to True, and `_sync_active_offer` passed it through — so a caller could send
    `is_active: false` and get the deactivate-then-insert path to write a row
    that had never been active. That is a fourth state on top of the documented
    three (omit / null / object), and its visible effect is identical to `null`,
    which is exactly why nobody would notice it. Activation is the replace
    logic's business, not the caller's: `_sync_active_offer` hardcodes True.

    **A stray `is_active` is IGNORED, not 422'd, and that is deliberate — do
    not "harden" this with `extra="forbid"`** (Sapir, 02/08). The frontend
    (Vercel) and the backend (Railway) deploy independently, so a forbid here
    turns any frontend-first deploy that still sends the field into a hard 422
    on save — a self-inflicted outage on the owner's dashboard, in exchange for
    rejecting a key no client sends. It is also the repo's near-universal
    convention: `extra="forbid"` appears exactly ONCE in first-party backend
    code (`services/whatsapp_templates.py:56`, where Meta's exact template
    contract justifies it) and zero times in this file. Making this one model
    the exception would buy nothing.
    """

    offer_type: str
    threshold_value: int | None = None
    threshold_unit: str | None = None
    headline: str | None = None
    starts_at: date | None = None
    expires_at: date

    @field_validator("offer_type")
    @classmethod
    def _validate_offer_type(cls, v: str) -> str:
        if v not in OFFER_TYPES:
            raise ValueError(f"סוג הטבה חייב להיות אחד מ: {', '.join(OFFER_TYPES)}")
        return v

    @field_validator("threshold_unit")
    @classmethod
    def _validate_threshold_unit(cls, v: str | None) -> str | None:
        if v is not None and v not in THRESHOLD_UNITS:
            raise ValueError(
                f"יחידת המידה חייבת להיות אחת מ: {', '.join(THRESHOLD_UNITS)}"
            )
        return v

    @field_validator("threshold_value")
    @classmethod
    def _validate_threshold_value(cls, v: int | None) -> int | None:
        # `is not None`, never truthiness: 0 must reach this check and be
        # rejected explicitly, not slip through as "absent".
        if v is not None and v <= 0:
            raise ValueError("הסכום או הכמות חייבים להיות גדולים מאפס")
        return v

    @field_validator("headline")
    @classmethod
    def _validate_headline(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip()
        if not v:
            return None
        if len(v) > MAX_OFFER_HEADLINE:
            raise ValueError(f"כותרת ההטבה מוגבלת ל-{MAX_OFFER_HEADLINE} תווים")
        if _EMOJI_ANYWHERE.search(v):
            raise ValueError("אין להשתמש באימוג'י בכותרת ההטבה")
        return v

    @model_validator(mode="after")
    def _validate_offer_shape(self) -> Self:
        # Both-or-neither, same equality form as the DB CHECK.
        if (self.threshold_value is None) != (self.threshold_unit is None):
            raise ValueError(
                "הסכום או הכמות ויחידת המידה נקבעים יחד — או שניהם או אף אחד"
            )
        # Israel-tz "today", not server UTC — the MEH-1543 / _validate_vacation_until
        # precedent, so an owner in Israel isn't blocked on a date still valid
        # locally. `<` and not `<=`: an offer expiring today is still live today.
        if self.expires_at < israel_today():
            # The message states the rule the line above actually enforces.
            # "חייב להיות עתידי" described a stricter rule than the code has —
            # today is accepted — so an owner who entered a past date was told
            # today would fail too. Wording per the PR review.
            raise ValueError("תאריך הסיום חייב להיות היום או מאוחר יותר")
        if self.starts_at is not None and self.expires_at <= self.starts_at:
            raise ValueError("תאריך הסיום חייב להיות אחרי תאריך ההתחלה")
        return self


class ProducerOfferOut(BaseModel):
    """Public read of an active, unexpired offer. The server never emits an
    expired one (producer_listing / producers.py filter on expires_at), so a
    consumer holding this object can render it without re-checking the date."""

    id: UUID
    offer_type: str
    threshold_value: int | None = None
    threshold_unit: str | None = None
    headline: str | None = None
    starts_at: date | None = None
    expires_at: date

    model_config = {"from_attributes": True}


# --- Product ---
# MEH-295: price_min/price_max are the canonical pricing fields.
# price_range is kept Optional for legacy back-compat — drop tracked as
# follow-up. Cross-field check (price_max >= price_min) is enforced via
# model_validator. ProductUpdate validator only fires when BOTH fields
# are present in the same payload; cross-payload merges (e.g. POST sets
# min=50, later PUT sends only max=30) are NOT validated against
# persisted state — frontend always sends both fields together.
class ProductCreate(BaseModel):
    name: SanitizedLabelField
    description: SanitizedDescriptionField | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal = Field(..., ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags (moved from producer level).
    is_gluten_free: bool = False
    is_vegan: bool = False
    # MEH-1438: vegetarian axis. Owner marks it independently; the public
    # ?vegetarian filter also matches vegan products (is_vegetarian OR is_vegan).
    is_vegetarian: bool = False
    is_lactose_free: bool = False
    # MEH-1934: no-added-sugar + low-carb axes. Owner-declared, any-product
    # scope; no implication from any other flag, so no defaulting-from.
    is_no_added_sugar: bool = False
    is_low_carb: bool = False
    # MEH-2662: optional, owner-declared.
    ingredients: SanitizedDescriptionField | None = None  # capped at 2000 by the type
    allergens: list[str] | None = Field(
        None, max_length=50
    )  # 14 codes + headroom for dupes

    @field_validator("allergens")
    @classmethod
    def _validate_allergens(cls, v: list[str] | None) -> list[str] | None:
        return normalize_allergens(v)

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        return None if v == "" else v

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    @model_validator(mode="after")
    def check_price_max_gte_min(self) -> Self:
        if self.price_max is not None and self.price_max < self.price_min:
            raise ValueError("price_max must be greater than or equal to price_min")
        return self


class ProductUpdate(BaseModel):
    name: SanitizedLabelField | None = None
    description: SanitizedDescriptionField | None = None
    price_range: str | None = None  # legacy: removal tracked in MEH-295 follow-up
    image_url: str | None = Field(None, max_length=500)
    price_min: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    price_max: Decimal | None = Field(None, ge=Decimal("1"), le=Decimal("10000"))
    # MEH-293: per-product dietary flags. Optional on update — exclude_unset
    # in producer_me.update_my_product means an unsupplied field stays put.
    is_gluten_free: bool | None = None
    is_vegan: bool | None = None
    is_vegetarian: bool | None = None  # MEH-1438
    is_lactose_free: bool | None = None
    is_no_added_sugar: bool | None = None  # MEH-1934
    is_low_carb: bool | None = None  # MEH-1934
    # MEH-2662: exclude_unset → unsent stays put; an explicit null clears.
    ingredients: SanitizedDescriptionField | None = None  # capped at 2000 by the type
    allergens: list[str] | None = Field(
        None, max_length=50
    )  # 14 codes + headroom for dupes

    @field_validator("allergens")
    @classmethod
    def _validate_allergens(cls, v: list[str] | None) -> list[str] | None:
        return normalize_allergens(v)

    @field_validator("image_url", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any) -> Any:
        return None if v == "" else v

    # MEH-1222: reject malformed image URLs at the write boundary.
    @field_validator("image_url")
    @classmethod
    def _validate_image_url(cls, v: str | None) -> str | None:
        return _image_url_validator(v)

    @model_validator(mode="after")
    def check_price_max_gte_min(self) -> Self:
        if (
            self.price_min is not None
            and self.price_max is not None
            and self.price_max < self.price_min
        ):
            raise ValueError("price_max must be greater than or equal to price_min")
        return self


class ProductOut(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    price_range: str | None = None
    image_url: str | None = None
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    # MEH-293: per-product dietary flags (moved from producer level).
    is_gluten_free: bool = False
    is_vegan: bool = False
    is_vegetarian: bool = False  # MEH-1438
    is_lactose_free: bool = False
    is_no_added_sugar: bool = False  # MEH-1934
    is_low_carb: bool = False  # MEH-1934
    ingredients: str | None = None  # MEH-2662
    allergens: list[str] | None = None  # MEH-2662
    position: int | None = None  # MEH-3055: owner order, NULL = never ordered
    group_id: str | None = None  # MEH-3055: id in producers.product_groups

    model_config = {"from_attributes": True}


class ProductGroupOut(BaseModel):
    """MEH-3055: one owner-defined product group (producers.product_groups)."""

    id: str
    name: str


# ---------------------------------------------------------------------------
# MEH-2312 — admin catalog import (drafts). Rows are LOOSE on purpose: each row
# is validated one by one through ProductCreate in services/product_import.py,
# so one bad price is reported for that row instead of 422-ing the whole batch.
# ---------------------------------------------------------------------------


class ProductImportRow(BaseModel):
    name: str | None = Field(None, max_length=500)
    description: str | None = Field(None, max_length=5000)
    price: str | float | None = None
    unit: str | None = Field(None, max_length=40)
    source_image_url: str | None = Field(None, max_length=2000)


class ProductImportRequest(BaseModel):
    # MEH-3022: a bounded list. A business can never own more than
    # MAX_PRODUCTS rows anyway, so a longer batch could only be refused.
    rows: list[ProductImportRow] = Field(..., max_length=250)


class ProductImportInvalidRow(BaseModel):
    index: int
    name: str | None
    reason: str


class ProductImportResult(BaseModel):
    created: int
    skipped_duplicates: list[str]
    invalid: list[ProductImportInvalidRow]


class ProductDraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    price_min: Decimal | None = None
    price_unit: str
    # Admin-only: the source store's image URL, kept for a later image import
    # (MEH-1184). Never on a public schema.
    source_image_url: str | None = None


class ProductDraftApproveRequest(BaseModel):
    # None = approve every draft of the business.
    product_ids: list[UUID] | None = Field(None, max_length=250)


class ProductDraftApproveResult(BaseModel):
    approved: int
