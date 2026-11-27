"""
Module:   product_order_offer
Purpose:  Request/response shapes for what a business offers for on-site
          ordering: its weekly windows, a product's ordering fields, and the
          public order menu.
Touches:  No side effects. Pure Pydantic.
Does NOT: model an order — those shapes arrive with the order route (stage
          2b of MEH-3216). Does NOT carry a price in any request: the price
          lives on the product and is read by the server.
Related:  app/routers/product_order_offer.py, app/models/product_orders.py
History:  MEH-3262 (creation; stage 2a of MEH-3216); MEH-3216 gaps (the
          owner's product list for the two ordering switches)
"""

from datetime import date, datetime, time
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.limits import MAX_VARIANTS_PER_PRODUCT, cap_list
from app.models.product_orders import PRODUCT_ORDER_MAX_WINDOWS

TOO_MANY_WINDOWS_DETAIL = f"אפשר להגדיר עד {PRODUCT_ORDER_MAX_WINDOWS} חלונות זמן"
WINDOW_ENDS_BEFORE_START_DETAIL = "שעת הסיום צריכה להיות אחרי שעת ההתחלה"
WINDOWS_OVERLAP_DETAIL = "יש שני חלונות זמן חופפים באותו יום"

Fulfilment = Literal["pickup", "delivery"]
# MEH-2936: equal to models.product_orders.PRODUCT_PRICE_UNITS
# (tests/test_meh2936_product_unit.py compares them).
PriceUnit = Literal["unit", "kg", "100g", "bottle", "box", "pack"]


class OrderWindowIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # 0 = Sunday ... 6 = Saturday, as in producers.order_window.
    weekday: int = Field(..., ge=0, le=6)
    start_time: time
    end_time: time
    fulfilment: Fulfilment

    @field_validator("start_time", "end_time")
    @classmethod
    def _whole_minutes_no_zone(cls, value: time) -> time:
        return value.replace(second=0, microsecond=0, tzinfo=None)

    @model_validator(mode="after")
    def _ends_after_it_starts(self) -> "OrderWindowIn":
        if self.end_time <= self.start_time:
            raise ValueError(WINDOW_ENDS_BEFORE_START_DETAIL)
        return self


class OrderWindowsIn(BaseModel):
    """The whole week. PUT replaces every window of the business."""

    model_config = ConfigDict(extra="forbid")

    windows: list[OrderWindowIn] = Field(..., max_length=PRODUCT_ORDER_MAX_WINDOWS)

    @field_validator("windows", mode="before")
    @classmethod
    def _cap_in_hebrew(cls, value: Any) -> Any:
        return cap_list(value, PRODUCT_ORDER_MAX_WINDOWS, TOO_MANY_WINDOWS_DETAIL)

    @model_validator(mode="after")
    def _no_overlap_within_a_day(self) -> "OrderWindowsIn":
        # Two overlapping windows of the same kind would offer the same slot
        # twice; pickup and delivery may share an hour.
        ordered = sorted(
            self.windows, key=lambda w: (w.weekday, w.fulfilment, w.start_time)
        )
        for earlier, later in zip(ordered, ordered[1:]):
            same_lane = (earlier.weekday, earlier.fulfilment) == (
                later.weekday,
                later.fulfilment,
            )
            if same_lane and later.start_time < earlier.end_time:
                raise ValueError(WINDOWS_OVERLAP_DETAIL)
        return self


class OrderWindowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekday: int
    start_time: time
    end_time: time
    fulfilment: Fulfilment


class OrderWindowsOut(BaseModel):
    windows: list[OrderWindowOut]


class ProductOrderingIn(BaseModel):
    """The ordering fields of one product. is_orderable, in_stock and
    contains_alcohol are required: the screen saves the whole row.

    MEH-2936: price_unit is optional and omitted means "keep". The owner's
    product form writes it now too, so an orders tab loaded before that edit
    must not send the old unit back over it. An explicit null is refused."""

    model_config = ConfigDict(extra="forbid")

    is_orderable: bool
    in_stock: bool
    price_unit: PriceUnit | None = None
    contains_alcohol: bool
    # Daily stock (27/11): omitted = keep; null = no limit. Same for each
    # listed variant (an id not of this product is refused by the route).
    daily_limit: int | None = Field(default=None, ge=1, le=999)
    variant_limits: list["VariantLimitIn"] | None = Field(
        default=None, max_length=MAX_VARIANTS_PER_PRODUCT
    )
    # MEH-3932: days ahead it must be ordered. Omitted = keep; null = none.
    lead_days: int | None = Field(default=None, ge=1, le=14)

    @field_validator("price_unit")
    @classmethod
    def _no_null_unit(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("price_unit cannot be null")
        return value


class VariantLimitIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: UUID
    daily_limit: int | None = Field(default=None, ge=1, le=999)


class VariantLimitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    daily_limit: int | None = None


class ProductOrderingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_orderable: bool
    in_stock: bool
    price_unit: PriceUnit
    contains_alcohol: bool
    daily_limit: int | None = None
    lead_days: int | None = None
    variants: list[VariantLimitOut] = []


class MyProductOrderingOut(ProductOrderingOut):
    """One of the owner's own products, as the orders tab lists it: enough
    to tell the products apart and to know a price is set."""

    name: str
    has_price: bool


class MyProductsOrderingOut(BaseModel):
    products: list[MyProductOrderingOut]


class OrderMenuVariantOut(BaseModel):
    """MEH-3617: one size or flavour, with the price the order route stores."""

    id: UUID
    name: str
    price_agorot: int
    price_is_estimate: bool
    in_stock: bool


class OrderMenuProductOut(BaseModel):
    id: UUID
    name: str
    image_url: str | None
    # Agorot. Equal min and max = an exact price; otherwise the buyer sees an
    # estimate and the business sets the final sum when it confirms.
    price_min_agorot: int
    price_max_agorot: int
    price_unit: PriceUnit
    price_is_estimate: bool
    in_stock: bool
    contains_alcohol: bool
    # MEH-3618: the days the product is made, Sunday = 1 … Saturday = 64;
    # NULL = every day. The sheet offers only slots on days every line is made.
    available_weekdays: int | None = None
    # MEH-3932: the pickup day is at least today + lead_days (Israel clock);
    # NULL = no product rule. The sheet offers only such slots.
    lead_days: int | None = None
    # MEH-3617: empty = no choice. One = applied without a choice. Many = the
    # buyer must pick one; `in_stock` above is false when all are out.
    variants: list[OrderMenuVariantOut] = []


class OrderMenuStockOut(BaseModel):
    """Daily stock: units left of a product (variant_id null, counted across
    its variants) or of one variant, on one offered Israel day. Only limited
    products and variants have rows; no row = no limit."""

    day: date
    product_id: UUID
    variant_id: UUID | None = None
    left: int


class OrderMenuSlotOut(BaseModel):
    start: datetime  # UTC, with offset
    end: datetime
    fulfilment: Fulfilment
    alcohol_ok: bool


class OrderMenuOut(BaseModel):
    producer_id: UUID
    min_order_agorot: int | None
    cancel_cutoff_hours: int
    lead_time_hours: int
    # MEH-3216: the seller's «מספר עוסק או ח״פ», for the order form's seller
    # line (distance-selling disclosure). Always set for a buyer:
    # takes_orders() needs it. MEH-3746: the owner's preview, readable before
    # that, sends "" while she has not filled it in.
    business_id_number: str
    products: list[OrderMenuProductOut]
    slots: list[OrderMenuSlotOut]
    stock: list[OrderMenuStockOut] = []


class PrepLineOut(BaseModel):
    product_id: UUID | None = None
    variant_id: UUID | None = None
    name: str
    variant_name: str | None = None
    confirmed: int
    waiting: int
    limit: int | None = None
    product_limit: int | None = None


class PrepDayOut(BaseModel):
    day: date
    lines: list[PrepLineOut]


class PrepListOut(BaseModel):
    """The owner's «מה להכין»: today and the next six Israel days."""

    days: list[PrepDayOut]


ProductOrderingIn.model_rebuild()
