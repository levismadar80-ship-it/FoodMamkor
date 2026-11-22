"""
Module:   group_buy_mine (schemas)
Purpose:  «הקבוצות שלי» — one row per group buy the signed-in person joined
          (MEH-3609), enough to list it and open its page.
Does NOT: carry anyone else's commit, the participant count or a phone — the
          page (GET /group-buys/{id}) is where the detail lives.
Related:  app/routers/group_buy_mine.py
History:  MEH-3609 (creation)
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MyGroupBuyOut(BaseModel):
    """A group buy the caller joined, and her own quantity in it."""

    id: UUID
    title: str
    producer_name: str | None = None
    status: str
    quantity: int
    unit: str | None = None
    deadline: datetime
    pickup_starts_at: datetime | None = None
    pickup_ends_at: datetime | None = None
    joined_at: datetime


class MyGroupBuysOut(BaseModel):
    group_buys: list[MyGroupBuyOut]
