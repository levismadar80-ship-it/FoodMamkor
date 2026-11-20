# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3479 PR)
"""
Module:   product_describe (schemas)
Purpose:  The request and answer of «הצעת תיאור» (MEH-3479). Every string is
          capped; nothing here is stored.
Related:  app/routers/product_describe.py · app/services/description_writer.py
History:  MEH-3479 (creation)
"""

from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

# The product name rule lives on ProductCreate; this only needs a non-blank one.
NAME_REQUIRED_DETAIL = "כתבו קודם את שם המוצר."


class ProductDescribeIn(BaseModel):
    name: str = Field(..., max_length=200)
    group: str | None = Field(None, max_length=40)
    price_min: Decimal | None = Field(None, ge=0, le=100000)
    price_unit: str | None = Field(None, max_length=10)
    description: str | None = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def _name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError(NAME_REQUIRED_DETAIL)
        return v


class ProductDescribeOut(BaseModel):
    description: str
