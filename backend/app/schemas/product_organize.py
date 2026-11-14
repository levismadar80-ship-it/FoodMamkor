# guard-ok: not in [tool.mypy].files — it imports app/schemas/schemas.py / app/limits.py, which are untyped (5,850 lines, ~190 strict errors) and would be reported as this file's (MEH-3055)
"""
Module:   product_organize (schemas)
Purpose:  Request bodies for the owner's product order and product groups
          (MEH-3055). Every list is capped (MEH-3022) and every refusal is
          Hebrew.
Does NOT: the response side — ProductOut.position/group_id and
          ProducerDetailOut.product_groups live in schemas.py with the rest of
          the public payload.
Related:  app/routers/product_organize.py · app/limits.py MAX_PRODUCT_GROUPS
History:  MEH-3055 (creation)
"""

import html
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.limits import (
    MAX_PRODUCT_GROUPS,
    MAX_PRODUCTS,
    PRODUCT_GROUPS_DETAIL,
    cap_list,
)
from app.services.sanitization import sanitize_text

MAX_GROUP_NAME = 40


class ProductGroupIn(BaseModel):
    # None = a new group; the server mints its id.
    id: str | None = Field(None, max_length=36)
    name: str = Field(..., max_length=200)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        # Tags stripped, then entities turned back into characters: bleach
        # escapes «&» to «&amp;», which React would print literally (it escapes
        # on render itself) and which would count 5 towards the 40 limit.
        cleaned = html.unescape(sanitize_text(v, max_length=200) or "").strip()
        if not cleaned:
            raise ValueError("שם הקבוצה לא יכול להיות ריק")
        if len(cleaned) > MAX_GROUP_NAME:
            raise ValueError(f"שם הקבוצה יכול להיות עד {MAX_GROUP_NAME} תווים")
        return cleaned


class ProductGroupsIn(BaseModel):
    """The whole ordered list. Absent ids are deleted, order is list order."""

    groups: list[ProductGroupIn] = Field(..., max_length=MAX_PRODUCT_GROUPS * 2)

    @field_validator("groups", mode="before")
    @classmethod
    def _cap(cls, v: object) -> object:
        return cap_list(v, MAX_PRODUCT_GROUPS, PRODUCT_GROUPS_DETAIL)

    @field_validator("groups")
    @classmethod
    def _unique_names(cls, v: list[ProductGroupIn]) -> list[ProductGroupIn]:
        names = [g.name.strip().casefold() for g in v]
        if len(set(names)) != len(names):
            raise ValueError("יש שתי קבוצות באותו שם")
        ids = [g.id for g in v if g.id is not None]
        if len(set(ids)) != len(ids):
            raise ValueError("אותה קבוצה מופיעה פעמיים ברשימה")
        return v


class ProductOrderIn(BaseModel):
    """Every product of the business, in the order the owner wants."""

    product_ids: list[UUID] = Field(..., max_length=MAX_PRODUCTS)


class ProductGroupAssignIn(BaseModel):
    group_id: str | None = Field(None, max_length=36)
