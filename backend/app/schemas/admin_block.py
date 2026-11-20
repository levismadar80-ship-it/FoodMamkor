"""Admin moderation switches on a user or a business.

MEH-3375: what blocking a user would take down, read before the confirm.
MEH-2952 chunk 4: the «עסק בדיקה — מוסתר מהאתר» switch (routers/
admin_test_business.py). Here and not in a new module so the schemas stay
under mypy --strict without another [tool.mypy].files entry.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BlockImpactOut(BaseModel):
    business_name: str | None
    open_bookings: int


class TestBusinessFlag(BaseModel):
    """`hidden` and not `is_test`: guard 3 keeps the column name out of every
    schema, so no response can ever carry it by accident."""

    model_config = ConfigDict(extra="forbid")
    hidden: bool


class TestBusinessFlagOut(BaseModel):
    producer_id: UUID
    hidden: bool


class TestBusinessIdsOut(BaseModel):
    producer_ids: list[UUID]
