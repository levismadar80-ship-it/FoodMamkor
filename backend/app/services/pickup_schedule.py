# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3512 PR)
"""
Module:   pickup_schedule
Purpose:  Keep a location's pickup schedule consistent after a write: a branch
          holds no pickup days or cutoff, and the stored cutoff is a day and a
          time together or neither.
Touches:  producer_locations.pickup_days / order_cutoff_day / order_cutoff_time.
Does NOT: validate a single value (schemas/order_cutoff.py does, on the body).
Related:  routers/producer_me_locations.py, routers/admin_producer_locations.py.
History:  MEH-3512 (review fix: a partial PUT could store half a cutoff, and a
          point turned into a branch kept its days).
"""

from __future__ import annotations

from fastapi import HTTPException

from app.models import ProducerLocation
from app.schemas import order_cutoff


def settle(loc: ProducerLocation) -> None:
    """Run after the patch is applied and before the commit."""
    if loc.kind == "branch":
        loc.pickup_days = []  # type: ignore[assignment]
        loc.order_cutoff_day = None  # type: ignore[assignment]
        loc.order_cutoff_time = None  # type: ignore[assignment]
        return
    try:
        order_cutoff.check_pair(loc.order_cutoff_day, loc.order_cutoff_time)  # type: ignore[arg-type]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
