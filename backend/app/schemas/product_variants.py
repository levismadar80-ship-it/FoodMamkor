"""
Module:   product_variants (schemas)
Purpose:  The shapes of a product's sizes or flavours: what the owner sends
          (the whole list, in her order) and what every read returns.
Touches:  No side effects. Pure Pydantic.
Does NOT: count against the per-product cap — the route does that
          (app/limits.py `enforce_cap(..., "variants")`, a 409 in Hebrew).
Related:  app/routers/product_variants.py, app/models/catalog.py::ProductVariant
History:  MEH-3617 (creation)
"""

import re
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.limits import MAX_SMALL_LIST, cap_list
from app.models.catalog import VARIANT_NAME_MAX

VARIANT_PRICE_MIN_AGOROT = 100
VARIANT_PRICE_MAX_AGOROT = 1_000_000

VARIANT_NAME_DETAIL = "צריך לכתוב שם לאפשרות"
DUPLICATE_VARIANT_DETAIL = "אותה אפשרות מופיעה פעמיים"
TOO_MANY_IN_LIST_DETAIL = f"אפשר לשלוח עד {MAX_SMALL_LIST} אפשרויות"

# A name may be «S», «1 ק״ג» or «500 גרם»: one letter or digit is enough.
# (MEH-555 asks three letters of a free-text field; a size label is shorter.)
_NAME_CHAR = re.compile(r"[א-תa-zA-Z0-9]")


class ProductVariantIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The id of an existing variant (kept, so a rename keeps its identity), or
    # None for a new one. An id that is not this product's is a new row.
    id: UUID | None = None
    name: str = Field(..., max_length=VARIANT_NAME_MAX)
    # Agorot. None = the product's own price.
    # The product's own bounds (ProductCreate.price_min: 1..10,000 ₪), so a
    # variant cannot be free or priced past what a product may be.
    price_agorot: int | None = Field(
        default=None, ge=VARIANT_PRICE_MIN_AGOROT, le=VARIANT_PRICE_MAX_AGOROT
    )
    in_stock: bool = True

    @field_validator("name")
    @classmethod
    def _real_name(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not _NAME_CHAR.search(cleaned):
            raise ValueError(VARIANT_NAME_DETAIL)
        return cleaned


class ProductVariantsIn(BaseModel):
    """The whole list, in the order the page shows it. Empty = no variants."""

    model_config = ConfigDict(extra="forbid")

    variants: list[ProductVariantIn] = Field(
        default_factory=list, max_length=MAX_SMALL_LIST
    )

    @field_validator("variants", mode="before")
    @classmethod
    def _cap_in_hebrew(cls, value: Any) -> Any:
        return cap_list(value, MAX_SMALL_LIST, TOO_MANY_IN_LIST_DETAIL)

    @model_validator(mode="after")
    def _unique_names(self) -> "ProductVariantsIn":
        names = [v.name.casefold() for v in self.variants]
        if len(set(names)) != len(names):
            raise ValueError(DUPLICATE_VARIANT_DETAIL)
        return self


class ProductVariantOut(BaseModel):
    id: UUID
    name: str
    price_agorot: int | None = None
    in_stock: bool = True

    model_config = {"from_attributes": True}


class ProductVariantsOut(BaseModel):
    variants: list[ProductVariantOut]
