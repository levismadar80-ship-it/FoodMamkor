"""
Module:   hebrew_calendar
Purpose:  The Israeli days of rest (Shabbat and the festival days) and the
          wall-clock windows around them, computed from the Hebrew calendar
          for any year, so nobody types next year's dates.
Touches:  Nothing. Pure arithmetic on dates; no DB, no clock read, no network.
Does NOT: know minor days (Chanuka, Purim, fasts, chol ha-moed): only the days
          on which an observant business does not work. Does NOT compute
          candle-lighting: the window is a fixed wide margin, earlier than any
          candle-lighting and later than any havdalah in Israel.
Related:  frontend/lib/hebrew-holidays.js (the same idea on the browser's ICU
          Hebrew calendar), app/services/product_order_slots.py (is_rest_time),
          app/services/product_order_clock.py (active hours),
          tests/test_meh3296_order_notifications.py (dates pinned from outside)
History:  MEH-3296 (creation; stage 3 of MEH-3216)

The calendar arithmetic is the standard one (Reingold & Dershowitz,
"Calendrical Calculations", the fixed-day formulation): a day is counted from
1 January of year 1 (proleptic Gregorian) = 1, which is also
`date.toordinal()`.
"""

from datetime import date, datetime, time, timedelta
from functools import lru_cache

_HEBREW_EPOCH = -1373427  # fixed day of 1 Tishri AM 1 (R&D: RD -1373427)
TISHRI, NISAN, SIVAN = 7, 1, 3  # months counted from Nisan, as R&D do

# The window around a rest day on the Israel clock: from 14:00 on the eve to
# 21:00 on the day itself, the same margin product_order_slots used for the
# weekly Shabbat before this module existed.
REST_STARTS_ON_EVE = time(14, 0)
REST_ENDS_ON_DAY = time(21, 0)


def _is_leap(year: int) -> bool:
    return (7 * year + 1) % 19 < 7


def _elapsed_days(year: int) -> int:
    months = (235 * year - 234) // 19
    parts = 12084 + 13753 * months
    day = 29 * months + parts // 25920
    if (3 * (day + 1)) % 7 < 3:
        day += 1
    return day


def _new_year_delay(year: int) -> int:
    ny0, ny1, ny2 = (_elapsed_days(year + k) for k in (-1, 0, 1))
    if ny2 - ny1 == 356:
        return 2
    if ny1 - ny0 == 382:
        return 1
    return 0


@lru_cache(maxsize=256)
def _new_year(year: int) -> int:
    return _HEBREW_EPOCH + _elapsed_days(year) + _new_year_delay(year)


def _year_length(year: int) -> int:
    return _new_year(year + 1) - _new_year(year)


def _last_month(year: int) -> int:
    return 13 if _is_leap(year) else 12


def _month_length(year: int, month: int) -> int:
    if month in (2, 4, 6, 10, 13):
        return 29
    if month == 12 and not _is_leap(year):
        return 29
    if (
        month == 8 and _year_length(year) % 10 != 5
    ):  # Marheshvan, short unless "complete"
        return 29
    if (
        month == 9 and _year_length(year) % 10 == 3
    ):  # Kislev, short in a "deficient" year
        return 29
    return 30


def _fixed(year: int, month: int, day: int) -> int:
    """Fixed day number of a Hebrew date (month counted from Nisan = 1)."""
    total = _new_year(year) + day - 1
    if month < TISHRI:
        total += sum(
            _month_length(year, m) for m in range(TISHRI, _last_month(year) + 1)
        )
        total += sum(_month_length(year, m) for m in range(1, month))
    else:
        total += sum(_month_length(year, m) for m in range(TISHRI, month))
    return total


def hebrew_to_gregorian(year: int, month: int, day: int) -> date:
    return date.fromordinal(_fixed(year, month, day))


# The festival days on which an observant business in Israel does not work:
# one day each, Rosh Hashana two. (Hebrew month, day.)
_FESTIVAL_DAYS = (
    (TISHRI, 1),
    (TISHRI, 2),
    (TISHRI, 10),  # Yom Kippur
    (TISHRI, 15),  # Sukkot
    (TISHRI, 22),  # Shemini Atzeret / Simchat Torah
    (NISAN, 15),  # Pesach
    (NISAN, 21),  # Shvi'i shel Pesach
    (SIVAN, 6),  # Shavuot
)


@lru_cache(maxsize=64)
def festival_days(gregorian_year: int) -> frozenset[date]:
    """Every festival day that falls in this Gregorian year."""
    days = set()
    # A Gregorian year holds the spring of Hebrew year Y+3760 and the autumn
    # of Y+3761: both Hebrew years are needed.
    for hebrew_year in (gregorian_year + 3760, gregorian_year + 3761):
        for month, day in _FESTIVAL_DAYS:
            found = hebrew_to_gregorian(hebrew_year, month, day)
            if found.year == gregorian_year:
                days.add(found)
    return frozenset(days)


def is_rest_day(day: date) -> bool:
    """Shabbat or a festival day in Israel."""
    return day.weekday() == 5 or day in festival_days(day.year)  # 5 = Saturday


def rest_windows(start: date, end: date) -> list[tuple[datetime, datetime]]:
    """The rest windows touching [start, end], as naive Israel-clock datetimes,
    merged where they meet (Yom Kippur next to Shabbat, Rosh Hashana's two
    days, a festival on Sunday): one closed stretch, not two with a gap."""
    windows: list[tuple[datetime, datetime]] = []
    day = start - timedelta(days=1)
    while day <= end + timedelta(days=1):
        if is_rest_day(day):
            opens = datetime.combine(day - timedelta(days=1), REST_STARTS_ON_EVE)
            closes = datetime.combine(day, REST_ENDS_ON_DAY)
            if windows and opens <= windows[-1][1]:
                windows[-1] = (windows[-1][0], closes)
            else:
                windows.append((opens, closes))
        day += timedelta(days=1)
    return windows
