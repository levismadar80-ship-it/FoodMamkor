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
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

from app.models.models import (
    RESCUE_MAX_QTY_PER_OFFER,
    RESCUE_MAX_QTY_PER_ORDER,
)

# The wire-level status vocabularies. Spelled as Literals rather than built
# from the model tuples because Pydantic needs them at class-definition time,
# and tests/test_rescue_migration.py asserts the two spellings stay equal — so
# there is one authority (the model tuples) and a guard, not two copies drifting.
RescueOfferStatus = Literal["active", "cancelled"]
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
    pickup_start: datetime
    pickup_end: datetime
    cancel_until: datetime

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
    pickup_start: datetime
    pickup_end: datetime
    cancel_until: datetime
    status: RescueOfferStatus
    created_at: datetime

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
    handed_at: datetime | None = None
    cancelled_at: datetime | None = None
    created_at: datetime

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
    created_at: datetime

    model_config = {"from_attributes": True}


class RescueTypicalItemsIn(BaseModel):
    """«בדרך כלל: …» — the list a business edits once. Bounded so the line
    stays one line on a phone."""

    items: list[str] = Field(default_factory=list, max_length=12)


class RescueTypicalItemsOut(BaseModel):
    producer_id: UUID
    items: list[str]
    updated_at: datetime

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
    pickup_start: datetime
    pickup_end: datetime
    cancel_until: datetime
    producer: RescueProducerSummary
    typical_items: list[str] = Field(default_factory=list)
    distance_km: float | None = None


class RescueOrderCreatedOut(RescueOrderOut):
    """What a successful reservation returns. Same shape as RescueOrderOut
    plus the two numbers the confirmation screen shows without a second
    request — the price to pay at the counter and when the free cancel ends.
    """

    price_agorot: int
    cancel_until: datetime
    pickup_start: datetime
    pickup_end: datetime


class RescueNoShowStateOut(BaseModel):
    """What the admin reset returns, so the operator can see the effect.

    `active_no_shows` is the windowed count the 422 gate actually reads — not
    the lifetime `no_show_count`. After a reset it is 0 by construction, and
    showing both is what makes the reset verifiable rather than hopeful.
    """

    user_id: UUID
    no_show_count: int
    active_no_shows: int
    block_cleared_at: datetime | None = None
    blocked: bool
