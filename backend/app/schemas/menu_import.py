# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3430 PR)
"""
Module:   menu_import (schemas)
Purpose:  The menu reader's rows (what the owner reviews) and the publish body
          (what the owner approved). MEH-3430.
Does NOT: validate a product's fields itself — MenuProductIn IS ProductCreate,
          the same validator as the owner's own "add product" form.
Related:  app/routers/menu_import.py · app/services/menu_reader.py ·
          app/limits.py MAX_PRODUCTS
History:  MEH-3430 (creation)
"""

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

from app.limits import MAX_PRODUCTS
from app.schemas.catalog import ProductCreate

PriceUnit = Literal["unit", "kg", "100g"]
UncertainField = Literal["name", "description", "price", "unit"]


class MenuRow(BaseModel):
    """One product as read from the menu. Nothing is saved yet."""

    name: str
    description: str | None = None
    section: str | None = None
    # None = no readable price on the menu: the row cannot be published until
    # the owner types one (ProductCreate requires price_min).
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    price_unit: PriceUnit = "unit"
    uncertain: list[UncertainField] = Field(default_factory=list)


class MenuReadOut(BaseModel):
    rows: list[MenuRow]


class MenuProductIn(ProductCreate):
    price_unit: PriceUnit = "unit"


class MenuPublishIn(BaseModel):
    # MEH-3022: bounded — a business never holds more than MAX_PRODUCTS.
    products: list[MenuProductIn] = Field(..., min_length=1, max_length=MAX_PRODUCTS)


class MenuPublishOut(BaseModel):
    created: int
    skipped_duplicates: list[str]
