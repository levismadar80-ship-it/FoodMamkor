"""
Module:   product_order_buy
Purpose:  Request/response shapes for an on-site order: asking for a phone
          code, sending the order, the buyer's status view, and what a
          business sends when it acts on an order.
Touches:  No side effects. Pure Pydantic.
Does NOT: carry a price in any buyer request — the server reads every price
          from the product. Does NOT expose the buyer's full phone or street
          address on the buyer view: that page opens with a token alone.
Related:  app/routers/product_order_buyer.py, app/routers/
          product_order_business.py, app/models/product_orders.py
History:  MEH-3263 (creation; stage 2b of MEH-3216)
"""

import re
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.limits import cap_list
from app.models.product_orders import (
    PRODUCT_ORDER_MAX_LINES,
    PRODUCT_ORDER_MAX_QTY_PER_ITEM,
)
from app.schemas.product_orders import MAX_MIN_ORDER_AGOROT

Fulfilment = Literal["pickup", "delivery"]

TOO_MANY_LINES_DETAIL = f"אפשר להזמין עד {PRODUCT_ORDER_MAX_LINES} מוצרים בהזמנה אחת"
DUPLICATE_PRODUCT_DETAIL = "אותו מוצר מופיע פעמיים בהזמנה"
NAME_DETAIL = "צריך למלא שם"
DELIVERY_NEEDS_ADDRESS_DETAIL = "למשלוח צריך למלא עיר וכתובת"
DELIVERY_NEEDS_CITY_DETAIL = "למשלוח צריך לבחור עיר"
PROPOSAL_EMPTY_DETAIL = "צריך להציע מועד אחר או סכום אחר"
NOTE_DETAIL = "צריך לכתוב הסבר קצר"

_LETTER = re.compile(r"[א-תa-zA-Z]")
_MIN_NAME_LETTERS = 2
_MIN_NOTE_LETTERS = 3


def _naive_utc(value: datetime) -> datetime:
    """The repo stores naive UTC. An aware time is converted; a naive one is
    taken as UTC (what the order menu hands out, minus the zone)."""
    if value.tzinfo is not None:
        value = value.astimezone(UTC).replace(tzinfo=None)
    return value.replace(microsecond=0)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = " ".join(value.split())
    return cleaned or None


class PhoneCodeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    producer_id: UUID
    phone: str = Field(..., min_length=9, max_length=20)


class OrderLineIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    product_id: UUID
    # MEH-3617: the chosen size or flavour. None for a product with no
    # variants, or with one (the server applies it). Never a price.
    variant_id: UUID | None = None
    qty: int = Field(..., ge=1, le=PRODUCT_ORDER_MAX_QTY_PER_ITEM)


def _no_twin_lines(items: list[OrderLineIn]) -> None:
    """One line per product and variant: two sizes of one cake are two lines
    (MEH-3617), the same size twice is a mistake."""
    keys = [(line.product_id, line.variant_id) for line in items]
    if len(set(keys)) != len(keys):
        raise ValueError(DUPLICATE_PRODUCT_DETAIL)


class OrderCreateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    producer_id: UUID
    items: list[OrderLineIn] = Field(
        ..., min_length=1, max_length=PRODUCT_ORDER_MAX_LINES
    )
    fulfilment: Fulfilment
    slot_start: datetime
    customer_name: str = Field(..., max_length=120)
    phone: str = Field(..., min_length=9, max_length=20)
    # MEH-3680: optional only for a logged-in buyer whose account phone is
    # verified and equals `phone`; create_order demands it from everyone else.
    code: str | None = Field(default=None, pattern=r"^[0-9]{6}$")
    delivery_city: str | None = Field(default=None, max_length=100)
    delivery_address: str | None = Field(default=None, max_length=300)
    note: str | None = Field(default=None, max_length=500)
    age_declared: bool = False
    # Chosen by the client once per attempt (a UUID): a double tap or a retry
    # after a lost answer creates one order, not two.
    idempotency_key: UUID
    # MEH-3933: «להזמין את זה שוב כל שבוע» — the same order on the same
    # weekday and time, made by the daily job (services/product_order_repeat).
    repeat_weekly: bool = False

    @field_validator("items", mode="before")
    @classmethod
    def _cap_in_hebrew(cls, value: Any) -> Any:
        return cap_list(value, PRODUCT_ORDER_MAX_LINES, TOO_MANY_LINES_DETAIL)

    @field_validator("slot_start")
    @classmethod
    def _slot_as_stored(cls, value: datetime) -> datetime:
        return _naive_utc(value)

    @field_validator("customer_name")
    @classmethod
    def _real_name(cls, value: str) -> str:
        cleaned = _clean(value) or ""
        if len(_LETTER.findall(cleaned)) < _MIN_NAME_LETTERS:
            raise ValueError(NAME_DETAIL)
        return cleaned

    @field_validator("delivery_city", "delivery_address", "note")
    @classmethod
    def _collapse(cls, value: str | None) -> str | None:
        return _clean(value)

    @model_validator(mode="after")
    def _whole_order(self) -> "OrderCreateIn":
        _no_twin_lines(self.items)
        if self.fulfilment == "delivery" and not (
            self.delivery_city and self.delivery_address
        ):
            raise ValueError(DELIVERY_NEEDS_ADDRESS_DETAIL)
        return self


class OrderQuoteIn(BaseModel):
    """What the order sheet asks before it sends (MEH-3216 stage 5c): the
    picks, how she gets them, and her city for a delivery. No price."""

    model_config = ConfigDict(extra="forbid")
    producer_id: UUID
    items: list[OrderLineIn] = Field(
        ..., min_length=1, max_length=PRODUCT_ORDER_MAX_LINES
    )
    fulfilment: Fulfilment
    delivery_city: str | None = Field(default=None, max_length=100)

    @field_validator("items", mode="before")
    @classmethod
    def _cap_in_hebrew(cls, value: Any) -> Any:
        return cap_list(value, PRODUCT_ORDER_MAX_LINES, TOO_MANY_LINES_DETAIL)

    @field_validator("delivery_city")
    @classmethod
    def _collapse(cls, value: str | None) -> str | None:
        return _clean(value)

    @model_validator(mode="after")
    def _whole_quote(self) -> "OrderQuoteIn":
        _no_twin_lines(self.items)
        if self.fulfilment == "delivery" and not self.delivery_city:
            raise ValueError(DELIVERY_NEEDS_CITY_DETAIL)
        return self


class OrderQuoteOut(BaseModel):
    subtotal_agorot: int
    delivery_fee_agorot: int
    total_agorot: int
    has_estimate: bool


class BuyerRefIn(BaseModel):
    """How a buyer names her order: the token she got when she sent it, or —
    when she is logged in — the order id. In the body, never in the URL, so
    the token does not land in logs, history or a Referer header."""

    model_config = ConfigDict(extra="forbid")

    token: str | None = Field(default=None, min_length=20, max_length=100)
    order_id: UUID | None = None


class OrderLineOut(BaseModel):
    # MEH-3764: what «להזמין שוב» puts back in the cart. Null once the product
    # (or variant) was deleted — the line is then shown but cannot be re-added.
    product_id: UUID | None = None
    variant_id: UUID | None = None
    name: str
    variant_name: str | None = None  # MEH-3617: «{name} · {variant_name}»
    qty: int
    unit_price_agorot: int
    price_unit: str
    price_is_estimate: bool
    contains_alcohol: bool


class ProposalOut(BaseModel):
    slot_start: datetime | None
    slot_end: datetime | None
    total_agorot: int | None
    note: str | None


class _OrderOut(BaseModel):
    id: UUID
    producer_id: UUID
    status: str
    fulfilment: str
    slot_start: datetime
    slot_end: datetime
    items: list[OrderLineOut]
    estimated_total_agorot: int
    final_total_agorot: int | None
    delivery_fee_agorot: int
    delivery_city: str | None
    customer_name: str
    note: str | None
    proposal: ProposalOut | None
    created_at: datetime
    expires_at: datetime | None
    # MEH-3933: set when the order belongs to a weekly repeat.
    repeat: Literal["active", "stopped"] | None = None


class BuyerOrderOut(_OrderOut):
    producer_name: str
    # MEH-3216 stage 5a: confirmed pickups only; city only for an
    # approximate location (services/product_order_views.pickup_address).
    pickup_address: str | None = None
    phone_masked: str
    # Present only while the order is confirmed or ready.
    pickup_code: str | None
    can_cancel: bool
    # MEH-3620: the verified-review link, only once the order was handed.
    review_url: str | None = None


class OrderCreatedOut(BuyerOrderOut):
    # Shown once. The buyer's only way back to a guest order.
    status_token: str


class BuyerOrdersOut(BaseModel):
    orders: list[BuyerOrderOut]


class BusinessOrderOut(_OrderOut):
    customer_phone: str
    delivery_address: str | None
    age_declared: bool
    has_estimate: bool


class BusinessOrdersOut(BaseModel):
    orders: list[BusinessOrderOut]
    total: int


class BusinessCustomerOut(BaseModel):
    """MEH-3561: one customer of the business, grouped by phone."""

    name: str
    phone: str
    order_count: int
    last_order_at: datetime


class BusinessCustomersOut(BaseModel):
    customers: list[BusinessCustomerOut]


class ConfirmIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Required when a line was an estimate (weighed goods, a price range).
    final_total_agorot: int | None = Field(default=None, ge=0, le=MAX_MIN_ORDER_AGOROT)


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _collapse(cls, value: str | None) -> str | None:
        return _clean(value)


class ProposeChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slot_start: datetime | None = None
    total_agorot: int | None = Field(default=None, ge=0, le=MAX_MIN_ORDER_AGOROT)
    note: str = Field(..., max_length=500)

    @field_validator("slot_start")
    @classmethod
    def _slot_as_stored(cls, value: datetime | None) -> datetime | None:
        return None if value is None else _naive_utc(value)

    @field_validator("note")
    @classmethod
    def _explained(cls, value: str) -> str:
        cleaned = _clean(value) or ""
        if len(_LETTER.findall(cleaned)) < _MIN_NOTE_LETTERS:
            raise ValueError(NOTE_DETAIL)
        return cleaned

    @model_validator(mode="after")
    def _something_changes(self) -> "ProposeChangeIn":
        if self.slot_start is None and self.total_agorot is None:
            raise ValueError(PROPOSAL_EMPTY_DETAIL)
        return self


class HandedIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The four digits the buyer says at the counter. Optional: a delivery has
    # no counter, and a buyer who lost her code is known by name and phone.
    pickup_code: str | None = Field(default=None, pattern=r"^[0-9]{4}$")
