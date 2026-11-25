"""
Module:   group_buy_pickup (schemas)
Purpose:  MEH-3735 — what the business sees at pickup: codes and quantities,
          and the mark it wrote. Never a name, email or user id (MEH-1651).
Related:  app/routers/group_buy_pickup.py · app/services/group_buy_no_show.py
History:  MEH-3735 (creation)
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class GroupBuyPickupOut(BaseModel):
    id: UUID
    pickup_code: str | None = None
    quantity: int
    handed_at: datetime | None = None
    no_show_at: datetime | None = None

    model_config = {"from_attributes": True}


MarkState = Literal["open", "not_funded", "delivery", "no_window", "wait", "closed"]


class GroupBuyPickupsOut(BaseModel):
    # True only in state "open": the window ended inside the last 14 days on
    # a group that reached its goal and has a pickup. The buttons show.
    can_mark: bool
    # Why not, otherwise — the dashboard shows the matching line.
    mark_state: MarkState
    pickup_ended_at: datetime | None = None
    pickups: list[GroupBuyPickupOut]


class GroupBuyBlockStateOut(BaseModel):
    user_id: UUID
    active_no_shows: int
