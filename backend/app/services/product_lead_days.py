"""
Module:   product_lead_days
Purpose:  Refuses an order whose pickup day, on the Israel clock, is sooner
          than a product's `products.lead_days` allows: the pickup's day must
          be at least today + lead_days (MEH-3932, Fischgrund bakery 27/11).
Touches:  DB read only (products: name and lead_days of the ordered lines).
Does NOT: replace the business's `lead_time_hours` (product_order_slots
          drops the slots inside it, for every product); this rule is per
          product, in whole Israel days. Does NOT check a time the business
          proposes herself (ProposeChangeIn): that is her own call, as for
          the days a product is made (product_weekdays).
Related:  backend/app/services/product_weekdays.py (the same shape, by day of
          week), frontend/lib/product-weekdays.js `slotsForProducts` (the same
          rule for the order sheet)
History:  MEH-3932 (creation, 27/11/2026)
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import Product
from app.services.product_daily_stock import israel_day


def too_soon_detail(name: str, days: int) -> str:
    """The 409 of an order whose pickup is sooner than «name» allows."""
    ahead = "יום אחד" if days == 1 else ("יומיים" if days == 2 else f"{days} ימים")
    return (
        f"את «{name}» צריך להזמין לפחות {ahead} מראש. "
        "צריך לבחור מועד מאוחר יותר או להסיר אותו מההזמנה"
    )


def days_ahead(start: datetime, now: datetime) -> int:
    """Whole Israel days from today to the slot's day (0 = today)."""
    return (israel_day(start) - israel_day(now)).days


def refuse_too_soon(
    db: Session, product_ids: list[Any], start: datetime, now: datetime
) -> None:
    """409 with the product's name when the slot is sooner than its lead."""
    ahead = days_ahead(start, now)
    rows = (
        db.query(Product.id, Product.name, Product.lead_days)
        .filter(Product.id.in_(product_ids), Product.lead_days.isnot(None))
        .all()
    )
    by_id = {pid: (name, lead) for pid, name, lead in rows}
    # In the order of the lines, so the product named is always the same one.
    for pid in product_ids:
        name, lead = by_id.get(pid, ("", None))
        if lead is not None and ahead < lead:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=too_soon_detail(name, int(lead)),
            )
