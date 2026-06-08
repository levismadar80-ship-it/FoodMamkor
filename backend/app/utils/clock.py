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
          write-path validation (MEH-214).
"""

from __future__ import annotations

from datetime import date, datetime
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
