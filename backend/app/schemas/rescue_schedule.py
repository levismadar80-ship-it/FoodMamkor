"""
Module:   rescue_schedule (schemas)
Purpose:  The shape of a pickup point's weekly surprise-bag routine — what the
          business sends, what is stored in producer_locations.rescue_schedule,
          and what the dashboard reads back.
Touches:  No side effects. Pure Pydantic.
Does NOT: publish anything (services/rescue_schedule.py) or check ownership
          (routers/rescue.py).
Related:  backend/alembic/versions/20261124_1530_b7d9f1a3c5e8_meh3703_rescue_schedule.py
          (the column) · app/schemas/rescue.py RescueOfferCreate (the bag each
          scheduled day becomes, whose rules these bounds mirror)
History:  MEH-3703 (creation)
"""

from datetime import date as date_type
from uuid import UUID

from pydantic import BaseModel, Field, StrictInt, model_validator

from app.models.models import RESCUE_MAX_QTY_PER_OFFER

# Sunday = 1 … Saturday = 64, the products.available_weekdays convention
# (MEH-3618), so one mask means the same days everywhere.
ALL_WEEKDAYS = 127
# How far ahead a day may be skipped. The settings page shows two weeks.
SKIP_DAYS_AHEAD = 14
# 12 hours: the longest «cancel up to N before pickup» a business is offered.
MAX_CANCEL_MINUTES = 12 * 60
# ₪10,000. A bound, so an absurd price is a 422 at save and never an
# integer overflow in the hourly job (the columns are INTEGER).
MAX_AGOROT = 1_000_000
_HHMM = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"


def weekday_bit(day: date_type) -> int:
    """The mask bit of a date: Sunday 1, Monday 2 … Saturday 64."""
    return 1 << ((day.weekday() + 1) % 7)


class RescueScheduleIn(BaseModel):
    """What the business sets once. Hours are the Israel wall clock."""

    weekdays: StrictInt = Field(ge=1, le=ALL_WEEKDAYS)
    pickup_start: str = Field(pattern=_HHMM)
    pickup_end: str = Field(pattern=_HHMM)
    cancel_minutes: StrictInt = Field(default=60, ge=0, le=MAX_CANCEL_MINUTES)
    qty: StrictInt = Field(ge=1, le=RESCUE_MAX_QTY_PER_OFFER)
    price_agorot: StrictInt = Field(ge=0, le=MAX_AGOROT)
    value_min_agorot: StrictInt | None = Field(default=None, ge=0, le=MAX_AGOROT)
    value_max_agorot: StrictInt | None = Field(default=None, ge=0, le=MAX_AGOROT)
    paused: bool = False

    @model_validator(mode="after")
    def _window(self) -> "RescueScheduleIn":
        # Same day only: a window past midnight would put the bag on two dates.
        if self.pickup_end <= self.pickup_start:
            raise ValueError("שעת סיום האיסוף חייבת להיות אחרי שעת ההתחלה")
        if (
            self.value_min_agorot is not None
            and self.value_max_agorot is not None
            and self.value_min_agorot > self.value_max_agorot
        ):
            raise ValueError("הערך המינימלי גדול מהערך המקסימלי")
        return self


class RescueScheduleStored(RescueScheduleIn):
    """The column's JSON: the routine plus the days the business skipped."""

    skip_dates: list[date_type] = Field(
        default_factory=list, max_length=SKIP_DAYS_AHEAD + 2
    )


class RescueScheduleRow(BaseModel):
    """One pickup point on the settings page: its routine, or none."""

    producer_location_id: UUID
    label: str | None = None
    address: str | None = None
    city: str | None = None
    exact: bool
    # False when the routine cannot publish right now (business not approved,
    # town outside the pilot, paid tool closed): the strip then promises nothing.
    publishing: bool = False
    # Days the routine will not publish although they are on it: a bag there
    # was cancelled (by hand or by a skip), and a cancelled day never comes back.
    closed_days: list[date_type] = Field(default_factory=list)
    schedule: RescueScheduleStored | None = None
