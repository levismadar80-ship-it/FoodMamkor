# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3512 PR)
"""
Module:   order_cutoff
Purpose:  One rule for «מזמינים עד יום X בשעה HH:MM» wherever a row carries
          its own cutoff (a pickup point, MEH-3512; a delivery zone,
          MEH-3511): the day is a DELIVERY_DAYS name, the time is HH:MM 24h,
          and the two come together or not at all.
Touches:  nothing — pure validation.
Does NOT: read or apply the business-wide order_window (schemas.py
          _validate_order_day owns that shape; the client falls back to it
          when a row has no cutoff — frontend/lib/next-delivery.js).
Related:  app/schemas/schemas.py _HHMM_REGEX (same pattern), DELIVERY_DAYS.
History:  MEH-3512 (creation).
"""

from __future__ import annotations

import re

from app.schemas.schemas import DELIVERY_DAYS

# REUSES: app/schemas/schemas.py:49 (_HHMM_REGEX) — same zero-padded 24h form.
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

CUTOFF_TIME_INVALID = "שעת סגירת ההזמנות לא תקינה. כותבים שעה כמו 15:00."
CUTOFF_DAY_INVALID = "יום סגירת ההזמנות לא מוכר. בוחרים יום מראשון עד שבת."
CUTOFF_HALF = "לשעת סגירת ההזמנות צריך גם יום וגם שעה."


def cutoff_time(value: str | None) -> str | None:
    """Blank → None; anything but HH:MM 24h → 422 in Hebrew."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if not _HHMM.match(cleaned):
        raise ValueError(CUTOFF_TIME_INVALID)
    return cleaned


def cutoff_day(value: str | None) -> str | None:
    """Blank → None; a day outside DELIVERY_DAYS → 422 in Hebrew."""
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned not in DELIVERY_DAYS:
        raise ValueError(CUTOFF_DAY_INVALID)
    return cleaned


def check_pair(day: str | None, time: str | None) -> None:
    """A cutoff is a day AND a time. One without the other says nothing a
    reader can compute with, so it is refused rather than half-stored."""
    if (day is None) != (time is None):
        raise ValueError(CUTOFF_HALF)
