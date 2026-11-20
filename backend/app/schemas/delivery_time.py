# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3511 PR)
"""
Module:   delivery_time
Purpose:  One rule for «מגיע תוך 3–5 ימי עסקים» wherever it is stored (the
          business, a delivery zone — MEH-3511): whole business days within
          bounds, and the shorter end not after the longer one. Either end
          may be stated alone («עד 5 ימי עסקים» is a max with no min).
Touches:  nothing — pure validation.
Does NOT: render (frontend/lib/deliveryTime.js) or copy a zone's value onto
          its cities (services/delivery_zones.py).
Related:  app/schemas/order_cutoff.py (the sibling rule for a cutoff).
History:  MEH-3511 (creation).
"""

from __future__ import annotations

MIN_BUSINESS_DAYS = 1
MAX_BUSINESS_DAYS = 30

DAYS_OUT_OF_RANGE = (
    f"זמן המשלוח צריך להיות בין {MIN_BUSINESS_DAYS} ל-{MAX_BUSINESS_DAYS} ימי עסקים."
)
DAYS_REVERSED = "בזמן המשלוח, המספר הראשון צריך להיות קטן מהשני או שווה לו."


def business_days(value: int | None) -> int | None:
    """None stays None; anything outside 1..30 → 422 in Hebrew."""
    if value is None:
        return None
    if not MIN_BUSINESS_DAYS <= value <= MAX_BUSINESS_DAYS:
        raise ValueError(DAYS_OUT_OF_RANGE)
    return value


def check_range(low: int | None, high: int | None) -> None:
    if low is not None and high is not None and low > high:
        raise ValueError(DAYS_REVERSED)
