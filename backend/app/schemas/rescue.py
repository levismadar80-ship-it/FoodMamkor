"""
Module:   rescue
Purpose:  Request/response shapes for the rescue-bags pilot — what a business
          sends to publish a bag, what a buyer sends to reserve one, and what
          the three tables serialize back.
Touches:  No side effects. Pure Pydantic; DB tables rescue_offers /
          rescue_orders / rescue_reviews / rescue_typical_items are owned by
          app/models/models.py.
Does NOT: hold any endpoint, permission check or stock arithmetic — those are
          chunk 2 (backend/app/routers/rescue.py). It also does NOT model
          payment: the 03/11 pilot has none, so no amount or paid_at field
          exists anywhere in this module.
Related:  app/models/models.py (RescueOffer and siblings, the status tuples
          these Literals are built from), backend/alembic/versions/
          20261104_0020_a1c9f3e8d204_meh2644_rescue_bags.py (the CHECKs these
          bounds mirror)
History:  MEH-2644 (creation, chunk 1/4 of the rescue-bags pilot)
"""

from datetime import date as date_type
from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, field_validator, model_validator

from app.allergens import normalize_allergens
from app.models.models import (
    RESCUE_MAX_QTY_PER_OFFER,
    RESCUE_MAX_QTY_PER_ORDER,
)

# The wire-level status vocabularies. Spelled as Literals rather than built
# from the model tuples because Pydantic needs them at class-definition time,
# and tests/test_rescue_migration.py asserts the two spellings stay equal — so
# there is one authority (the model tuples) and a guard, not two copies drifting.
RescueOfferStatus = Literal["active", "cancelled"]


# MEH-2679: the rescue tables use naive `DateTime` columns holding UTC (the
# repo convention, utils/clock.py `utc_now`). Serialised as-is they come out
# as "2026-11-05T16:00:00" — no zone — which the generated
# `zod.iso.datetime({offset: true})` rejects (so /rescue showed no bags at
# all) and which `new Date()` reads as Israel local time (two hours early).
def _as_utc(value: datetime) -> datetime:
    """Output side: a naive value is UTC; say so, so the JSON carries `Z`."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _to_naive_utc(value: datetime) -> datetime:
    """Input side: whatever offset the caller wrote, store the UTC instant in
    the naive column, and compare naive with naive (a mixed pair raises)."""
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


UtcDatetimeOut = Annotated[datetime, AfterValidator(_as_utc)]
UtcDatetimeIn = Annotated[datetime, AfterValidator(_to_naive_utc)]


RescueOrderStatus = Literal["reserved", "handed", "no_show", "cancelled"]


class RescueOfferCreate(BaseModel):
    """What a verified business POSTs to publish one day's bags.

    `qty_left` is not accepted: it is initialised to `qty_total` server-side,
    so a client cannot publish an offer that is already half sold. `status` is
    not accepted either — a new offer is always `active`.
    """

    producer_location_id: UUID
    date: date_type
    qty_total: int = Field(ge=1, le=RESCUE_MAX_QTY_PER_OFFER)
    price_agorot: int = Field(ge=0)
    value_min_agorot: int | None = Field(default=None, ge=0)
    value_max_agorot: int | None = Field(default=None, ge=0)
    pickup_start: UtcDatetimeIn
    pickup_end: UtcDatetimeIn
    cancel_until: UtcDatetimeIn

    @model_validator(mode="after")
    def _window_order(self) -> "RescueOfferCreate":
        # Mirrors rescue_offers_pickup_window_check so the caller gets a 422
        # naming the field instead of a 500 from a CHECK violation.
        if self.pickup_end <= self.pickup_start:
            raise ValueError("שעת סיום האיסוף חייבת להיות אחרי שעת ההתחלה")
        if self.cancel_until > self.pickup_start:
            raise ValueError("מועד הביטול חייב להיות לפני תחילת האיסוף")
        if (
            self.value_min_agorot is not None
            and self.value_max_agorot is not None
            and self.value_min_agorot > self.value_max_agorot
        ):
            raise ValueError("הערך המינימלי גדול מהערך המקסימלי")
        return self


class RescueOfferOut(BaseModel):
    """One offer as the public list and the dashboard both serialize it.

    `qty_left` is the only stock number published: `qty_total` is included so
    the UI can say "נותרו 2 מתוך 6", and nothing here reveals who reserved.
    """

    id: UUID
    producer_location_id: UUID
    date: date_type
    qty_total: int
    qty_left: int
    price_agorot: int
    value_min_agorot: int | None = None
    value_max_agorot: int | None = None
    pickup_start: UtcDatetimeOut
    pickup_end: UtcDatetimeOut
    cancel_until: UtcDatetimeOut
    status: RescueOfferStatus
    created_at: UtcDatetimeOut

    model_config = {"from_attributes": True}


class RescueOrderCreate(BaseModel):
    """What a logged-in buyer POSTs to reserve. `qty` is capped at the pilot's
    two bags per order — the same bound as rescue_orders_qty_check."""

    offer_id: UUID
    qty: int = Field(default=1, ge=1, le=RESCUE_MAX_QTY_PER_ORDER)


class RescueOrderOut(BaseModel):
    """One reservation, as returned to its own buyer.

    `pickup_code` IS included: the buyer has to read it aloud at the counter,
    and chunk 4 renders it at 56px. The business sees the same field for its
    own offers' orders; nobody else can reach either route (chunk 2).
    """

    id: UUID
    offer_id: UUID
    user_id: UUID
    qty: int
    pickup_code: str = Field(min_length=4, max_length=4, pattern=r"^[0-9]{4}$")
    status: RescueOrderStatus
    handed_at: UtcDatetimeOut | None = None
    cancelled_at: UtcDatetimeOut | None = None
    created_at: UtcDatetimeOut

    model_config = {"from_attributes": True}


class RescueReviewCreate(BaseModel):
    """The buyer's review of a collected bag. Every field but `rating` is
    optional — chunk 4's screen submits one star row and nothing else."""

    rating: int = Field(ge=1, le=5)
    contents_tags: list[str] | None = None
    highlight_tags: list[str] | None = None
    photo_url: str | None = Field(default=None, max_length=500)
    comment: str | None = None


class RescueReviewOut(BaseModel):
    id: UUID
    order_id: UUID
    rating: int
    contents_tags: list[str] | None = None
    highlight_tags: list[str] | None = None
    photo_url: str | None = None
    comment: str | None = None
    created_at: UtcDatetimeOut

    model_config = {"from_attributes": True}


class RescueTypicalItemsIn(BaseModel):
    """«בדרך כלל: …» — the list a business edits once. Bounded so the line
    stays one line on a phone."""

    items: list[str] = Field(default_factory=list, max_length=12)
    # MEH-2752: the allergens this business declares for its bag. `None` and
    # `[]` both mean "nothing filled" and are stored as NULL — see the
    # validator and backend/app/allergens.py for why [] must never persist.
    allergens: list[str] | None = None

    @field_validator("allergens")
    @classmethod
    def _known_codes_only(cls, value):
        """Normalise through the shared helper so the bag and the product
        sheet cannot drift on what a valid code is.

        An unknown code raises → 422, rather than being dropped silently: a
        typo that vanishes would leave the business believing it declared an
        allergen it did not.
        """
        try:
            return normalize_allergens(value)
        except ValueError as exc:
            raise ValueError(str(exc)) from exc


class RescueTypicalItemsOut(BaseModel):
    producer_id: UUID
    items: list[str]
    # None means the business declared nothing. The UI must say that in words
    # rather than render an empty list, which would read as "no allergens".
    allergens: list[str] | None = None
    updated_at: UtcDatetimeOut

    model_config = {"from_attributes": True}


class RescueProducerSummary(BaseModel):
    """The business fields the public bag list needs, and no more.

    Deliberately NOT `ProducerListOut`: a bag row shows a name, a photo, a
    town and a pickup point, and nothing on this list should carry the badge
    block, the rating aggregate or the contact details — chunk 4's row has no
    place to put them and serializing them would publish more than the screen
    needs.
    """

    id: UUID
    name: str
    slug: str | None = None
    city: str | None = None
    image_url: str | None = None
    # The pickup point itself. `address` is only ever filled for a location
    # whose precision is `exact` (the MEH-829 carve-out that lets a full
    # address show while a bag is live); an approximate point cannot host an
    # offer at all, so there is no case where this leaks a fuzzy address.
    location_city: str | None = None
    location_address: str | None = None

    model_config = {"from_attributes": True}


class RescueOfferPublicOut(BaseModel):
    """One row of `GET /rescue/offers` — the offer, who is selling it, what is
    usually in it, and how far away it is.

    `distance_km` is None unless the caller sent lat/lng; chunk 4 renders it
    only when present rather than inventing a zero.
    """

    id: UUID
    date: date_type
    qty_left: int
    qty_total: int
    price_agorot: int
    value_min_agorot: int | None = None
    value_max_agorot: int | None = None
    pickup_start: UtcDatetimeOut
    pickup_end: UtcDatetimeOut
    cancel_until: UtcDatetimeOut
    producer: RescueProducerSummary
    typical_items: list[str] = Field(default_factory=list)
    # MEH-2752: None = the business declared nothing. Deliberately nullable
    # rather than defaulting to [], so the card can tell "not declared" from
    # "declared none" — the second is a food-safety claim and nobody made it.
    allergens: list[str] | None = None
    distance_km: float | None = None


class RescueOrderCreatedOut(RescueOrderOut):
    """What a successful reservation returns. Same shape as RescueOrderOut
    plus the two numbers the confirmation screen shows without a second
    request — the price to pay at the counter and when the free cancel ends.
    """

    price_agorot: int
    cancel_until: UtcDatetimeOut
    pickup_start: UtcDatetimeOut
    pickup_end: UtcDatetimeOut


class RescueMyOrderOut(RescueOrderCreatedOut):
    """One of the caller's own reservations for today, read back (MEH-2680).

    The confirmation lived only in component state, so a reload lost the code
    the buyer must say at the counter, and the review — offered once the order
    is «handed» — could never appear. `reviewed` says whether to offer it.
    """

    reviewed: bool = False
    # The business the bag belongs to. The public list drops a sold-out offer,
    # so the buyer of the last bag cannot find her order through `offer_id`
    # alone — the business page matches on this instead.
    producer_id: UUID


class RescueNoShowStateOut(BaseModel):
    """What the admin reset returns, so the operator can see the effect.

    `active_no_shows` is the windowed count the 422 gate actually reads — not
    the lifetime `no_show_count`. After a reset it is 0 by construction, and
    showing both is what makes the reset verifiable rather than hopeful.
    """

    user_id: UUID
    no_show_count: int
    active_no_shows: int
    block_cleared_at: UtcDatetimeOut | None = None
    blocked: bool


class RescueOwnerOrderOut(BaseModel):
    """One of today's reservations, as the business's own dashboard sees it.

    Carries `pickup_code` — the business has to read it back against what the
    buyer says at the counter — and the offer's `pickup_end`, because the
    «לא הגיע» control is only legal after that moment and the dashboard must
    decide that without a second request.

    Deliberately NOT the buyer's name, email or phone: handing over a bag
    needs four digits, and a list of today's customers on a dashboard screen
    is more personal data than the job requires.
    """

    id: UUID
    offer_id: UUID
    qty: int
    pickup_code: str
    status: RescueOrderStatus
    handed_at: UtcDatetimeOut | None = None
    cancelled_at: UtcDatetimeOut | None = None
    created_at: UtcDatetimeOut
    pickup_start: UtcDatetimeOut
    pickup_end: UtcDatetimeOut

    model_config = {"from_attributes": True}


class RescueOwnerOfferOut(BaseModel):
    """One of today's bags as the business's dashboard sees it (MEH-2703).

    `leftover` is what was not collected once the window closed: bags never
    reserved (`qty_left`) plus bags reserved by someone who did not come
    (`no_show` orders). It is 0 until `pickup_end` — before that a bag may
    still be reserved or picked up — and 0 for a cancelled offer, which
    never went on sale. `qty_donated` is the business's own report, capped at
    `leftover` by the API.
    """

    id: UUID
    qty_total: int
    qty_left: int
    status: str
    pickup_start: UtcDatetimeOut
    pickup_end: UtcDatetimeOut
    leftover: int
    qty_donated: int


class RescueDonatedIn(BaseModel):
    """How many uncollected bags were given away free. A set, not an
    increment: a second tap with the same number is a no-op, and a mistake is
    corrected by sending the right number."""

    qty: int = Field(ge=0, le=RESCUE_MAX_QTY_PER_OFFER)


class RescueMetricsOut(BaseModel):
    """The pilot's read-only numbers (chunk 5).

    `sell_through` and `no_show_rate` are fractions 0..1, not percentages, so
    the UI decides how to render them and nothing is rounded twice. Both are
    None when their denominator is zero — a pilot with no bags yet has no
    sell-through, and reporting 0% would read as "nothing sold" rather than
    "nothing published".
    """

    days: int
    offers_total: int
    offers_per_day: float
    bags_offered: int
    bags_reserved: int
    sell_through: float | None = None
    orders_total: int
    no_shows: int
    # MEH-2737: out of the reservations that were not cancelled.
    no_show_rate: float | None = None
    # MEH-2737: cancelled reservations (by the buyer or with the bag) and
    # bags the business cancelled. Shown, never part of the two rates.
    orders_cancelled: int
    offers_cancelled: int
    buyers_total: int
    repeat_buyers: int
    # MEH-2703: owner-reported «נמסרו בחינם», summed over the window.
    bags_donated: int = 0
