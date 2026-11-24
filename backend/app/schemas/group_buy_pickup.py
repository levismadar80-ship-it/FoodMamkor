"""
Module:   group_buy_pickup (schemas)
Purpose:  MEH-3735 — what the business sees at pickup: codes and quantities,
          and the mark it wrote. Never a name, email or user id (MEH-1651).
Related:  app/routers/group_buy_pickup.py · app/services/group_buy_no_show.py
History:  MEH-3735 (creation)
"""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class GroupBuyPickupOut(BaseModel):
    id: UUID
    pickup_code: str | None = None
    quantity: int
    handed_at: datetime | None = None
    no_show_at: datetime | None = None

    model_config = {"from_attributes": True}


class GroupBuyPickupsOut(BaseModel):
    # True once the pickup window (or the deadline) has passed on a group
    # that reached its goal: the buttons show, the routes accept.
    can_mark: bool
    pickup_ended_at: datetime
    pickups: list[GroupBuyPickupOut]


class GroupBuyBlockStateOut(BaseModel):
    user_id: UUID
    active_no_shows: int
