"""
Module:   clock
Purpose:  Asia/Jerusalem-aware "now"/"today" helpers so availability and
          vacation logic compare against Israel local time, not the
          server's UTC clock (Railway runs UTC).
Touches:  Nothing — pure stdlib zoneinfo, no I/O.
Does NOT: own the business-hours window — that's
          app/services/auto_reply_watchdog.is_within_business_hours
          (this module is the date/datetime primitive it could reuse).
Related:  app/config.py:182 (BUSINESS_HOURS_TIMEZONE),
          app/services/availability_validation.py (vacation past-date guard).
History:  AUD-039/040 (creation) — UTC-vs-Israel drift in the vacation
          write-path validation (MEH-214); MEH-2110 (business-day aging
          for the admin review queue's SLA badge).
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.config import BUSINESS_HOURS_TIMEZONE

# Reuse the same tz constant the watchdog uses so the two never drift.
ISRAEL_TZ = ZoneInfo(BUSINESS_HOURS_TIMEZONE)


def israel_now() -> datetime:
    """Current timezone-aware datetime in Asia/Jerusalem (DST-correct)."""
    return datetime.now(ISRAEL_TZ)


def israel_today() -> date:
    """Current calendar date in Asia/Jerusalem.

    Differs from `date.today()` (server-local/UTC on Railway) in the
    late-UTC window — e.g. UTC Fri 22:00 is already Sat in Israel. The
    vacation past-date guard must use this so a producer in Israel isn't
    told their "today" return date is in the past.
    """
    return israel_now().date()


# --- Business-day aging (MEH-2110) ------------------------------------------
#
# The Israeli work week is Sunday–Thursday; Friday and Saturday are the
# weekend. There is deliberately NO holiday calendar in v1 (MEH-2110 scope),
# so a חג inside the window still counts as a working day. That makes the
# badge over-report slightly rather than under-report, which is the safe
# direction for an SLA: it shows the admin a bigger number and makes her look
# sooner, never later.

# Indexes into the Sunday-first week produced by `_week_index`.
_WEEKEND_INDEXES = frozenset({5, 6})  # Friday, Saturday


def _week_index(ordinal: int) -> int:
    """Day of week as Sun=0 … Sat=6, from a proleptic Gregorian ordinal.

    `date(1, 1, 1)` is a Monday and has ordinal 1, so `ordinal % 7` gives
    Mon=1 … Sat=6 and Sun=0 — already a Sunday-first week, which is the one
    the Israeli work week needs. Derived rather than hardcoded, and pinned
    against real calendar dates in tests/test_business_days.py so a wrong
    assumption here fails loudly instead of shifting every badge by a day.
    """
    return ordinal % 7


def _count_residue(n: int, r: int) -> int:
    """How many ordinals in [1, n] are congruent to r modulo 7."""
    if r == 0:
        return n // 7
    return (n - r) // 7 + 1 if r <= n else 0


def _business_days_since_epoch(ordinal: int) -> int:
    """Business days in [1, ordinal]. O(1) — never walks the range.

    A day-by-day loop would be just as correct, but this runs once per admin
    table row and a business created years ago would make it O(days elapsed).
    """
    return sum(
        _count_residue(ordinal, r) for r in range(7) if r not in _WEEKEND_INDEXES
    )


def business_days_between(start: date, end: date) -> int:
    """Business days in the HALF-OPEN range (start, end] — Sun–Thu only.

    Half-open is the whole reason the ticket's edge cases come out right: a
    business that submitted today has waited 0, and one that submitted on
    Thursday has waited 1 by Sunday because Friday and Saturday contribute
    nothing. Returns 0 when `end <= start`, so clock skew or a future
    timestamp can never render a negative age.
    """
    if end <= start:
        return 0
    return _business_days_since_epoch(end.toordinal()) - _business_days_since_epoch(
        start.toordinal()
    )


def business_days_waiting(
    since: datetime | None, *, now: datetime | None = None
) -> int:
    """Business days a row has been waiting, measured in Israel local time.

    `since` is converted to Asia/Jerusalem before the date is taken, not left
    in UTC: a submission at 23:30 UTC on Thursday is already Friday in Israel,
    and counting it as Thursday would over-report by a day across the whole
    weekend.

    A tz-NAIVE `since` is assumed UTC. The column is `DateTime(timezone=True)`
    and the only writer stamps `datetime.now(timezone.utc)`, but SQLite — which
    the test suite runs on — hands tz-naive values back, so this must not
    explode there. `None` yields 0 rather than raising: the caller's fallback
    (`submitted_for_review_at or created_at`) should have prevented it, and a
    zero is a visible-but-harmless badge where an exception would 500 the
    whole admin queue.
    """
    if since is None:
        return 0
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    current = now if now is not None else israel_now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return business_days_between(
        since.astimezone(ISRAEL_TZ).date(), current.astimezone(ISRAEL_TZ).date()
    )
