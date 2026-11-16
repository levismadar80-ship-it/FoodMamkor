# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-2312 PR)
"""
Module:   product_import
Purpose:  Turn a list of rows from a business's existing store (first source:
          mypips) into DRAFT products for that business. An admin approves the
          drafts before they go public.
Touches:  products (insert, is_draft=True).
Does NOT: Fetch anything from a third party (the rows arrive from the admin),
          upload or show images (`source_image_url` is stored only, pending
          MEH-1184), fire "new product" alerts (approval of a whole catalog
          would spam followers), or publish anything.
Related:  schemas/catalog.py ProductCreate (the per-row validator, shared with
          the owner's own create); routers/admin_product_import.py (routes);
          limits.py MAX_PRODUCTS (the cap counts drafts too).
History:  MEH-2312 (creation).
"""

import re
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.limits import MAX_PRODUCTS
from app.models import Producer, Product
from app.schemas.catalog import (
    ProductCreate,
    ProductImportInvalidRow,
    ProductImportResult,
    ProductImportRow,
)

# Source unit words → our closed set (models/product_orders.py
# PRODUCT_PRICE_UNITS). mypips shows "ליחידה" / "למארז" / "לק"ג". A package is
# priced per unit here; anything unknown is per unit too (the row is kept).
_UNIT_MAP: dict[str, str] = {
    "unit": "unit",
    "יחידה": "unit",
    "ליחידה": "unit",
    "מארז": "unit",
    "למארז": "unit",
    "package": "unit",
    "pack": "unit",
    "kg": "kg",
    'ק"ג': "kg",
    'לק"ג': "kg",
    "ק״ג": "kg",
    "לק״ג": "kg",
    "קילו": "kg",
    "100g": "100g",
    "100 גרם": "100g",
    "ל-100 גרם": "100g",
}

_PRICE_NOISE = re.compile(r"[₪\s]|ש\"ח|ש״ח")
# "1,200" is a thousands comma; "12,5" is a decimal comma (Hebrew habit).
_THOUSANDS = re.compile(r"^\d{1,3}(,\d{3})+(\.\d+)?$")


def _name_key(name: str) -> str:
    """Duplicate key: case-folded, inner whitespace collapsed."""
    return re.sub(r"\s+", " ", name).strip().casefold()


def _parse_price(raw: str | bool | float | None) -> Decimal | None:
    if raw is None or isinstance(raw, bool):  # JSON true is not a price
        return None
    text = _PRICE_NOISE.sub("", str(raw))
    if not text:
        return None
    text = text.replace(",", "") if _THOUSANDS.match(text) else text.replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def _unit(raw: str | None) -> tuple[str, bool]:
    """(unit, recognised). An unknown word is priced per unit AND reported, so
    a per-kilo price is never published as per-unit without anyone seeing it."""
    if not raw or not raw.strip():
        return "unit", True
    key = raw.strip().lower()
    return _UNIT_MAP.get(key, "unit"), key in _UNIT_MAP


def _source_image(raw: str | None) -> str | None:
    if raw and re.match(r"^https?://[^\s]+$", raw.strip()):
        return raw.strip()
    return None


def _first_error(err: ValidationError) -> str:
    field = str(err.errors()[0].get("loc", ("",))[0])
    if field == "name":
        return "חסר שם או שהשם לא תקין"
    if field == "price_min":
        return "מחיר חסר או לא בטווח 1–10,000"
    return "השורה לא תקינה"


def import_drafts(
    db: Session, producer_id: UUID, rows: list[ProductImportRow]
) -> ProductImportResult:
    """Create one draft per valid, new row. Nothing is committed on a refusal.

    A row is skipped as a duplicate when its name already exists for the
    business (draft or published) or appeared earlier in the same batch — the
    import is one-off, and running it twice must not double the catalog.
    """
    # Two imports at once must not both pass the cap / duplicate check: lock
    # the business row for the transaction (REUSES producer_claim's pattern).
    db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    existing = db.query(Product.name).filter(Product.producer_id == producer_id).all()
    seen = {_name_key(str(r.name)) for r in existing}
    to_create: list[Product] = []
    duplicates: list[str] = []
    invalid: list[ProductImportInvalidRow] = []
    unknown_units: set[str] = set()

    for index, row in enumerate(rows):
        price = _parse_price(row.price)
        fields: dict[str, Any] = {
            "name": row.name or "",
            "description": row.description,
        }
        if price is not None:
            fields["price_min"] = price
        try:
            checked = ProductCreate(**fields)
        except ValidationError as err:
            invalid.append(
                ProductImportInvalidRow(
                    index=index, name=row.name, reason=_first_error(err)
                )
            )
            continue
        key = _name_key(checked.name)
        if key in seen:
            duplicates.append(checked.name)
            continue
        seen.add(key)
        unit, recognised = _unit(row.unit)
        if not recognised and row.unit:
            unknown_units.add(row.unit.strip())
        to_create.append(
            Product(
                producer_id=producer_id,
                name=checked.name,
                description=checked.description,
                price_min=checked.price_min,
                price_max=checked.price_min,
                price_unit=unit,
                source_image_url=_source_image(row.source_image_url),
                is_draft=True,
            )
        )

    current = db.query(Product).filter(Product.producer_id == producer_id).count()
    if current + len(to_create) > MAX_PRODUCTS:
        # MEH-3022: the cap counts drafts — an approved catalog cannot outgrow it.
        raise HTTPException(
            status_code=409,
            detail=(
                f"הייבוא יעבור את המגבלה של {MAX_PRODUCTS} מוצרים לבית עסק "
                f"({current} קיימים, {len(to_create)} חדשים). אפשר לייבא פחות שורות."
            ),
        )
    db.add_all(to_create)
    db.commit()
    return ProductImportResult(
        created=len(to_create),
        skipped_duplicates=duplicates,
        invalid=invalid,
        unknown_units=sorted(unknown_units),
    )
