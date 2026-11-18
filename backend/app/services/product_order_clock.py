"""
Module:   product_order_clock
Purpose:  The clock an order's timers run on: hours that are counted only
          outside Shabbat and the festivals (Sapir, 14/11: «שעון 24 השעות
          נעצר אז לכולם»), and the moment a rest window ends.
Touches:  Nothing. Pure functions of their arguments; naive UTC in and out,
          the form the repo stores.
Does NOT: decide what a timer is for (the 24-hour answer window, the 4-hour
          reminder): product_order_create / product_order_actions /
          product_order_outbox pass the hours. Does NOT know the calendar:
          hebrew_calendar does.
Related:  app/services/hebrew_calendar.py (rest_windows)
History:  MEH-3296 (creation; stage 3 of MEH-3216)
"""

from datetime import UTC, datetime, timedelta

from app.services.hebrew_calendar import rest_windows
from app.utils.clock import ISRAEL_TZ

# A timer never runs for more than a few days, and the longest closed stretch
# (Rosh Hashana into Shabbat) is three days: a month of windows is plenty.
_LOOKAHEAD = timedelta(days=30)


def _to_utc(local_naive: datetime) -> datetime:
    return local_naive.replace(tzinfo=ISRAEL_TZ).astimezone(UTC).replace(tzinfo=None)


def _windows_from(
    start_utc: datetime, span: timedelta
) -> list[tuple[datetime, datetime]]:
    """Rest windows as naive UTC pairs, from the one that contains or follows
    `start_utc` up to `start_utc + span`."""
    local_day = start_utc.replace(tzinfo=UTC).astimezone(ISRAEL_TZ).date()
    end_day = (start_utc + span).replace(tzinfo=UTC).astimezone(ISRAEL_TZ).date()
    return [
        (_to_utc(opens), _to_utc(closes))
        for opens, closes in rest_windows(local_day, end_day)
        if _to_utc(closes) > start_utc
    ]


def rest_end_if_inside(at_utc: datetime) -> datetime | None:
    """When the rest window around `at_utc` ends, or None outside one."""
    # Four days: the longest closed stretch (Rosh Hashana into Shabbat) is
    # three, and a shorter look-ahead would return a window's first end.
    for opens, closes in _windows_from(at_utc, timedelta(days=4)):
        if opens <= at_utc < closes:
            return closes
    return None


def active_deadline(start_utc: datetime, hours: float) -> datetime:
    """`start_utc` plus `hours` of time outside every rest window.

    Real elapsed hours, not wall-clock ones: on the night the clock changes an
    hour is still sixty minutes. A start inside a window counts from its end.
    """
    remaining = timedelta(hours=hours)
    cursor = start_utc
    for opens, closes in _windows_from(start_utc, remaining + _LOOKAHEAD):
        if cursor < opens:
            gap = opens - cursor
            if remaining <= gap:
                return cursor + remaining
            remaining -= gap
        cursor = max(cursor, closes)
    return cursor + remaining
