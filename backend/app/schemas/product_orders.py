"""
Module:   product_orders
Purpose:  Request/response shapes for a business's on-site ordering settings.
Touches:  No side effects. Pure Pydantic; the table is
          producer_order_settings (app/models/product_orders.py).
Does NOT: carry `alcohol_licensed` on the owner's update shape — only an admin
          may set it (ProducerOrderAlcoholIn). Does NOT model an order yet:
          the order shapes arrive with the public order route (a later stage
          of MEH-3216).
Related:  app/routers/product_orders.py (the three routes),
          app/models/product_orders.py (the bounds these mirror)
History:  MEH-3218 (creation; stage 1 of MEH-3216); MEH-3262 (slot_minutes,
          lead_time_hours)
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.product_orders import (
    PRODUCT_ORDER_MAX_CUTOFF_HOURS,
    PRODUCT_ORDER_MAX_LEAD_HOURS,
    PRODUCT_ORDER_SLOT_MINUTES,
)

# Upper bounds that exist only so a typo cannot store nonsense: 500 orders in
# one pickup window, or a 100,000 ₪ minimum order.
MAX_AUTO_CONFIRM_SLOT_CAP = 500
MAX_MIN_ORDER_AGOROT = 10_000_000

SLOT_MINUTES_DETAIL = "אורך מועד יכול להיות חצי שעה, שעה או שעתיים"

AUTO_CONFIRM_NEEDS_CAP_DETAIL = (
    "כדי לאשר הזמנות אוטומטית צריך לקבוע כמה הזמנות אפשר לקבל לכל מועד"
)


# MEH-3216 — Sapir approved NEEDS_ID 19/11 06:05Z.
BUSINESS_ID_NEEDED_DETAIL = "כדי לקבל הזמנות באתר צריך למלא מספר עוסק."
BUSINESS_ID_FORMAT_DETAIL = "מספר עוסק או ח״פ הוא 9 ספרות."
BUSINESS_ID_DIGITS = 9
_BUSINESS_ID_SHORT = 8  # a ת״ז-based number typed without its leading zero
_BUSINESS_ID_SEPARATORS = str.maketrans("", "", " -")


class ProducerOrderSettingsIn(BaseModel):
    """What the owner may change. Every field is required: the settings screen
    saves the whole form, so a missing field is a client bug, not "leave it"."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool
    auto_confirm: bool
    # `...` = required, including the nullable ones: omitting a field must not
    # silently clear a saved minimum or reset the cutoff to its default.
    auto_confirm_slot_cap: int | None = Field(..., ge=1, le=MAX_AUTO_CONFIRM_SLOT_CAP)
    cancel_cutoff_hours: int = Field(..., ge=0, le=PRODUCT_ORDER_MAX_CUTOFF_HOURS)
    shabbat_observant: bool
    min_order_agorot: int | None = Field(..., ge=0, le=MAX_MIN_ORDER_AGOROT)
    # MEH-3262: how long one slot is, and how early an order must be sent.
    slot_minutes: int
    lead_time_hours: int = Field(..., ge=0, le=PRODUCT_ORDER_MAX_LEAD_HOURS)
    # MEH-3216: «מספר עוסק או ח״פ». Required in the body like the rest, so an
    # older client cannot clear it by leaving it out; null or blank = none.
    business_id_number: str | None = Field(..., max_length=20)

    @field_validator("business_id_number")
    @classmethod
    def _nine_digits(cls, value: str | None) -> str | None:
        """Spaces and dashes are dropped, and an 8-digit number gets its
        leading zero back, so «51-234567-8» and «12345678» are accepted."""
        if value is None:
            return None
        digits = value.translate(_BUSINESS_ID_SEPARATORS)
        if not digits:
            return None
        if not digits.isdigit() or not (
            _BUSINESS_ID_SHORT <= len(digits) <= BUSINESS_ID_DIGITS
        ):
            raise ValueError(BUSINESS_ID_FORMAT_DETAIL)
        return digits.zfill(BUSINESS_ID_DIGITS)

    @field_validator("slot_minutes")
    @classmethod
    def _slot_minutes_is_one_of_three(cls, value: int) -> int:
        if value not in PRODUCT_ORDER_SLOT_MINUTES:
            raise ValueError(SLOT_MINUTES_DETAIL)
        return value

    @model_validator(mode="after")
    def _auto_confirm_needs_a_cap(self) -> "ProducerOrderSettingsIn":
        # Sapir, 14/11: auto-confirm is "up to N per slot". Without N it would
        # confirm without limit, which is the thing the cap exists to prevent.
        if self.auto_confirm and self.auto_confirm_slot_cap is None:
            raise ValueError(AUTO_CONFIRM_NEEDS_CAP_DETAIL)
        return self

    @model_validator(mode="after")
    def _ordering_needs_a_business_id(self) -> "ProducerOrderSettingsIn":
        # MEH-3216: the order form must show the seller's number (distance-
        # selling disclosure), so ordering cannot be on without it.
        if self.enabled and not self.business_id_number:
            raise ValueError(BUSINESS_ID_NEEDED_DETAIL)
        return self


class ProducerOrderAlcoholIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alcohol_licensed: bool


class ProducerOrderSettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    producer_id: UUID
    enabled: bool
    auto_confirm: bool
    auto_confirm_slot_cap: int | None
    cancel_cutoff_hours: int
    shabbat_observant: bool
    min_order_agorot: int | None
    slot_minutes: int
    lead_time_hours: int
    alcohol_licensed: bool
    business_id_number: str | None
