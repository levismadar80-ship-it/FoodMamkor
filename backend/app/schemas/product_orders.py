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
