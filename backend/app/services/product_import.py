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
History:  MEH-2312 (creation); MEH-3472 (a row's `group` puts the draft in a
          product group, creating missing groups by name).
"""

import re
import uuid
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.limits import MAX_PRODUCT_GROUPS, MAX_PRODUCTS, PRODUCT_GROUPS_DETAIL
from app.models import Producer, Product
from app.schemas.product_organize import ProductGroupIn
from app.schemas.catalog import (
    ProductCreate,
    ProductImportInvalidRow,
    ProductImportResult,
    ProductImportRow,
)

# Source unit words → our closed set (models/product_orders.py
# PRODUCT_PRICE_UNITS). mypips shows "ליחידה" / "למארז" / "לק"ג". A package
# («מארז») is priced per unit here; a box («ארגז») and a bottle are their own
# units since MEH-2936; anything unknown is per unit too (the row is kept).
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
    # MEH-2936: bottle / box are their own units now.
    "bottle": "bottle",
    "בקבוק": "bottle",
    "לבקבוק": "bottle",
    "box": "box",
    "ארגז": "box",
    "לארגז": "box",
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


def _group_name(raw: str | None) -> tuple[str | None, str | None]:
    """(clean name, refusal). The owner's own group rules (sanitised, 1–40
    characters) — one validator, so an imported group is never one the owner
    could not have typed."""
    if raw is None:
        return None, None
    try:
        return ProductGroupIn(name=raw).name, None
    except ValidationError as err:
        return None, str(err.errors()[0].get("msg", "")).removeprefix("Value error, ")


class _Groups:
    """The business's groups plus the ones this batch adds, matched by name
    (strip + casefold). New groups keep first-seen order, after the existing."""

    def __init__(self, producer: Producer | None) -> None:
        raw: Any = (producer.product_groups if producer is not None else None) or []
        self.existing = [
            g for g in raw if isinstance(g, dict) and g.get("id") and g.get("name")
        ]
        self.by_key = {
            str(g["name"]).strip().casefold(): str(g["id"]) for g in self.existing
        }
        self.new: list[dict[str, str]] = []

    def id_for(self, name: str) -> str:
        key = name.strip().casefold()
        if key not in self.by_key:
            gid = str(uuid.uuid4())
            self.by_key[key] = gid
            self.new.append({"id": gid, "name": name})
        return self.by_key[key]


def _check_caps_and_add_groups(
    db: Session,
    producer: Producer | None,
    producer_id: UUID,
    new_count: int,
    groups: _Groups,
) -> None:
    """Refuse the whole batch past either cap (nothing written yet), else
    record the groups the batch adds. Split out of import_drafts for C901."""
    current = db.query(Product).filter(Product.producer_id == producer_id).count()
    if current + new_count > MAX_PRODUCTS:
        # MEH-3022: the cap counts drafts — an approved catalog cannot outgrow it.
        raise HTTPException(
            status_code=409,
            detail=(
                f"הייבוא יעבור את המגבלה של {MAX_PRODUCTS} מוצרים לבית עסק "
                f"({current} קיימים, {new_count} חדשים). אפשר לייבא פחות שורות."
            ),
        )
    if len(groups.existing) + len(groups.new) > MAX_PRODUCT_GROUPS:
        # MEH-3472: the whole batch is refused — nothing is written, so a
        # partial import never leaves drafts pointing at groups that were cut.
        raise HTTPException(status_code=409, detail=PRODUCT_GROUPS_DETAIL)
    if groups.new and producer is not None:
        producer.product_groups = [*groups.existing, *groups.new]  # type: ignore[assignment]


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
    producer = (
        db.query(Producer).filter(Producer.id == producer_id).with_for_update().first()
    )
    groups = _Groups(producer)
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
        # MEH-2924 made ProductCreate's price optional (an owner may leave it
        # blank: «מחיר משתנה לפי עונה»). The admin import keeps requiring it —
        # a blank or unreadable cell here is a typo far more often than a
        # seasonal price, so the admin sees the row as invalid, as before.
        if checked.price_min is None:
            invalid.append(
                ProductImportInvalidRow(
                    index=index, name=row.name, reason="מחיר חסר או לא בטווח 1–10,000"
                )
            )
            continue
        key = _name_key(checked.name)
        if key in seen:
            duplicates.append(checked.name)
            continue
        group_name, group_refusal = _group_name(row.group)
        if group_refusal:
            invalid.append(
                ProductImportInvalidRow(
                    index=index, name=row.name, reason=group_refusal
                )
            )
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
                group_id=groups.id_for(group_name) if group_name else None,
            )
        )

    _check_caps_and_add_groups(db, producer, producer_id, len(to_create), groups)
    db.add_all(to_create)
    db.commit()
    return ProductImportResult(
        created=len(to_create),
        skipped_duplicates=duplicates,
        invalid=invalid,
        unknown_units=sorted(unknown_units),
    )
