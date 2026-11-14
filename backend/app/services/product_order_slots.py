"""
Module:   product_order_slots
Purpose:  Turn a business's weekly ordering windows into the concrete time
          slots a buyer can pick in the coming days.
Touches:  Nothing. A pure function of (windows, settings, now): no DB, no
          clock read, no network. The caller passes `now`.
Does NOT: read `producers.order_window`. That column is when the owner
          ANSWERS orders (the "open for orders now" filter, MEH-1881); a
          window here is when she HANDS an order over, and says pickup or
          delivery. A bakery answers all week and hands over on Friday
          morning — two facts, two owners. What the two share is the
          calendar above them: a date the owner closed in `special_hours`
          and her vacation close this axis too (`ClosedDays`).
          Does NOT count how many orders a slot already holds — the auto-confirm cap
          is checked where the order is written (stage 2b of MEH-3216).
          Does NOT know Jewish holidays yet: `is_rest_time` covers the weekly
          Shabbat only, with a wide fixed margin; stage 3 replaces its body
          with the Hebrew calendar. Until then `shabbat_observant` is not
          offered to businesses in the UI.
Related:  app/models/product_orders.py (ProducerOrderWindow, the settings
          columns), app/routers/product_order_offer.py (the order menu),
          tests/test_meh3262_order_windows.py (frozen-clock cases at both
          DST switches)
History:  MEH-3262 (creation; stage 2a of MEH-3216)

Every slot is computed on the Israel clock and returned as naive UTC, the
form the repo stores (`product_orders.slot_start`).
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Protocol

from app.utils.clock import ISRAEL_TZ

SLOT_HORIZON_DAYS = 14

# Sapir's decision of 14/11, on the strictest reading of the retail rule: an
# order that contains alcohol is never handed over between 23:00 and 07:00.
ALCOHOL_NIGHT_STARTS = time(23, 0)
ALCOHOL_NIGHT_ENDS = time(7, 0)

# A fixed, deliberately wide weekly rest window on the Israel clock: Friday
# 14:00 to Saturday 21:00. It is earlier than any candle-lighting and later
# than any havdalah in Israel, so it errs toward offering fewer slots.
_FRIDAY, _SATURDAY = 4, 5  # date.weekday(), read off the slot's own date
REST_STARTS_FRIDAY = time(14, 0)
REST_ENDS_SATURDAY = time(21, 0)


class WindowLike(Protocol):
    # 0 = Sunday ... 6 = Saturday, the convention of `producers.order_window`
    # and lib/orderWindow.js ("index 0 means Sunday on every axis").
    weekday: int
    start_time: time
    end_time: time
    fulfilment: str


@dataclass(frozen=True)
class SlotRules:
    """The settings a slot depends on, detached from the ORM row."""

    slot_minutes: int
    lead_time_hours: int
    shabbat_observant: bool


@dataclass(frozen=True)
class ClosedDays:
    """The owner's existing calendar, applied to hand-over days.

    `dates` are the `special_hours` keys whose `ranges` is empty — the days
    she marked closed. `until` is the last day of her vacation; `open_ended`
    is a vacation with no return date, during which nothing is offered.
    """

    dates: frozenset[date] = frozenset()
    until: date | None = None
    open_ended: bool = False

    def covers(self, day: date) -> bool:
        if self.open_ended or day in self.dates:
            return True
        return self.until is not None and day <= self.until


def israel_weekday(day: date) -> int:
    """0 = Sunday ... 6 = Saturday. `date.weekday()` is Monday-first."""
    return (day.weekday() + 1) % 7


@dataclass(frozen=True)
class Slot:
    start: datetime  # naive UTC
    end: datetime  # naive UTC
    fulfilment: str
    # False when the slot touches the night hours: the buyer may still pick it
    # for an order without alcohol.
    alcohol_ok: bool


def is_rest_time(local_start: datetime, local_end: datetime) -> bool:
    """Whether an Israel-clock slot touches the weekly rest window.

    # DO NOT widen this into holiday logic by hand — stage 3 replaces the body
    # with the Hebrew calendar (holidays are computed, never remembered).
    """
    day = local_start.weekday()
    if day == _FRIDAY:
        return local_end.time() > REST_STARTS_FRIDAY
    if day == _SATURDAY:
        return local_start.time() < REST_ENDS_SATURDAY
    return False


def _touches_alcohol_night(local_start: datetime, local_end: datetime) -> bool:
    return (
        local_start.time() < ALCOHOL_NIGHT_ENDS
        or local_end.time() > ALCOHOL_NIGHT_STARTS
    )


def _to_naive_utc(local: datetime) -> datetime:
    return local.astimezone(UTC).replace(tzinfo=None)


def _day_slots(
    day: date, window: WindowLike, rules: SlotRules, earliest: datetime
) -> list[Slot]:
    step = timedelta(minutes=rules.slot_minutes)
    cursor = datetime.combine(day, window.start_time, tzinfo=ISRAEL_TZ)
    window_end = datetime.combine(day, window.end_time, tzinfo=ISRAEL_TZ)
    slots: list[Slot] = []
    # Wall-clock arithmetic: both ends carry the same tzinfo, so `cursor +
    # step` moves the hands of the clock, which is what a window means.
    while cursor + step <= window_end:
        local_end = cursor + step
        start_utc, end_utc = _to_naive_utc(cursor), _to_naive_utc(local_end)
        usable = (
            # On the two clock-change nights a wall-clock hour is not a real
            # hour: the skipped one lasts zero minutes, the repeated one two
            # hours. A slot is offered only when it really lasts its length.
            end_utc - start_utc == step
            and start_utc >= earliest
            and not (rules.shabbat_observant and is_rest_time(cursor, local_end))
        )
        if usable:
            slots.append(
                Slot(
                    start=start_utc,
                    end=end_utc,
                    fulfilment=window.fulfilment,
                    alcohol_ok=not _touches_alcohol_night(cursor, local_end),
                )
            )
        cursor = local_end
    return slots


def compute_slots(
    windows: list[WindowLike],
    rules: SlotRules,
    now_utc: datetime,
    closed: ClosedDays | None = None,
) -> list[Slot]:
    """Every slot the business offers from `now` over the next 14 Israel days.

    `now_utc` is naive UTC (`utc_now()`). A slot is offered only when it
    starts at least `lead_time_hours` from now.
    """
    earliest = now_utc + timedelta(hours=rules.lead_time_hours)
    today = now_utc.replace(tzinfo=UTC).astimezone(ISRAEL_TZ).date()
    slots: list[Slot] = []
    for offset in range(SLOT_HORIZON_DAYS):
        day = today + timedelta(days=offset)
        if closed is not None and closed.covers(day):
            continue
        for window in windows:
            if window.weekday == israel_weekday(day):
                slots.extend(_day_slots(day, window, rules, earliest))
    return sorted(slots, key=lambda s: (s.start, s.fulfilment))
