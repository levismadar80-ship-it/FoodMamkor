"""
Module:   product_weekdays
Purpose:  Refuses an order whose slot falls, on the Israel clock, on a day
          one of its products is not made (`products.available_weekdays`,
          the bitmask of app/utils/weekdays.py).
Touches:  DB read only (products: name and mask of the ordered lines).
Does NOT: decide which slots a business offers (product_order_slots) or
          price a line (product_order_create.order_lines). Does NOT write the
          mask: the owner's product routes do (producer_me, through
          ProductCreate / ProductUpdate).
Related:  backend/app/services/product_order_slots.py:80 (israel_weekday, the
          same Sunday-first week), frontend/lib/product-weekdays.js (the same
          rule for the order sheet)
History:  MEH-3618 (creation)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.models import Product
from app.services.product_order_slots import israel_weekday
from app.utils.clock import ISRAEL_TZ
from app.utils.weekdays import is_open


def day_closed_detail(name: str) -> str:
    """The 409 of an order whose slot is on a day «name» is not made."""
    return f"«{name}» לא זמין ביום שנבחר. צריך לבחור מועד אחר או להסיר אותו מההזמנה"


def slot_weekday(start: datetime) -> int:
    """The Israel-clock day of a slot start (naive UTC or aware)."""
    aware = start if start.tzinfo is not None else start.replace(tzinfo=UTC)
    return israel_weekday(aware.astimezone(ISRAEL_TZ).date())


def refuse_closed_day(db: Session, product_ids: list[Any], start: datetime) -> None:
    """409 with the product's name when a line is not made on the slot's day."""
    weekday = slot_weekday(start)
    rows = (
        db.query(Product.name, Product.available_weekdays)
        .filter(Product.id.in_(product_ids))
        .all()
    )
    for name, mask in rows:
        if not is_open(mask, weekday):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=day_closed_detail(name)
            )
