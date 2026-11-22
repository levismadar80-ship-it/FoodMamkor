"""
Module:   weekdays
Purpose:  A product's days as a bitmask (MEH-3618): Sunday = 1 … Saturday =
          64, NULL = every day. Pure conversions, shared by the product
          schemas (the write check) and services/product_weekdays.py (the
          order check).
Touches:  Nothing — no I/O.
Does NOT: know the Israel clock or the DB (services/product_weekdays.py).
Related:  frontend/lib/product-weekdays.js (the same week, the same bits)
History:  MEH-3618 (creation)
"""

from __future__ import annotations

from collections.abc import Iterable

DAYS_IN_WEEK = 7
ALL_DAYS_MASK = (1 << DAYS_IN_WEEK) - 1  # 127

NO_DAY_DETAIL = "צריך לבחור לפחות יום אחד שהמוצר זמין בו"


def days_of(mask: int | None) -> list[int]:
    """0 = Sunday … 6 = Saturday, ascending. NULL = every day."""
    if mask is None:
        return list(range(DAYS_IN_WEEK))
    return [day for day in range(DAYS_IN_WEEK) if mask & (1 << day)]


def mask_of(days: Iterable[int]) -> int | None:
    """The mask of a set of days. Every day is NULL; no day is refused."""
    mask = 0
    for day in days:
        if not 0 <= day < DAYS_IN_WEEK:
            raise ValueError(f"not a weekday: {day}")
        mask |= 1 << day
    if mask == 0:
        raise ValueError(NO_DAY_DETAIL)
    return None if mask == ALL_DAYS_MASK else mask


def is_open(mask: int | None, weekday: int) -> bool:
    """Whether a product with this mask is made on this Sunday-first day."""
    return mask is None or bool(mask & (1 << weekday))


def weekdays_mask(value: int | None) -> int | None:
    """The write check: NULL stays NULL, 1..126 stays, 127 becomes NULL (one
    spelling of «every day»), 0 or anything outside the week is refused."""
    if value is None:
        return None
    if isinstance(value, bool) or not 0 < value <= ALL_DAYS_MASK:
        raise ValueError(NO_DAY_DETAIL)
    return None if value == ALL_DAYS_MASK else value
