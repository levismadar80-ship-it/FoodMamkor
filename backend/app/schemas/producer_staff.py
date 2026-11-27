"""
Module:   schemas/producer_staff
Purpose:  Request and response shapes of the order-staff routes (MEH-3526).
Does NOT: carry the invite token back out: it exists only in the email link.
Related:  routers/producer_staff.py, models/producer_staff.py.
History:  MEH-3526 (creation).
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class StaffInviteIn(BaseModel):
    email: EmailStr


class StaffMemberOut(BaseModel):
    id: UUID
    email: str
    status: Literal["pending", "active"]
    # A pending invite past its 7 days: the owner can send it again.
    expired: bool
    created_at: datetime
    accepted_at: datetime | None = None


class StaffListOut(BaseModel):
    staff: list[StaffMemberOut]
    max_staff: int


class StaffAcceptIn(BaseModel):
    token: str = Field(min_length=20, max_length=200)


class StaffOfOut(BaseModel):
    """Which business this account handles orders for (`/auth/me`)."""

    producer_id: UUID
    name: str
