"""MEH-3375: what blocking a user would take down, read before the confirm."""

from pydantic import BaseModel


class BlockImpactOut(BaseModel):
    business_name: str | None
    open_bookings: int
