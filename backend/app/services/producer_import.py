"""Producer Excel/CSV import logic, shared between admin endpoint and CLI script.

Excel column mapping (from admin_brief.docx, section 4):
  A=name              B=contact_name      C=phone
  D=instagram         E=website           F=whatsapp_group
  G=catalog (unused)  H=city              I=category_name
  J=pickup_points     K=has_delivery      L=delivery_areas (comma-split)
  M=kosher            N=description       O=short_description
  P=status (unused)   Q=slug              R=lat
  S=lng               T=price_range       U=grass_fed
  V=organic_certified W=admin_notes
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

# U+00D7 (×, multiplication sign) and U+00F8 (ø) appear when Hebrew UTF-8
# bytes are decoded as Latin-1/Windows-1252 — the classic XLS mojibake.
_MOJIBAKE_RE = re.compile(r"[×ø]")


def _has_mojibake(value: str | None) -> bool:
    return bool(value and _MOJIBAKE_RE.search(value))


from sqlalchemy.orm import Session

from app.models import Category, DeliveryArea, Producer, ProducerCategory
from app.slug_utils import RESERVED_SLUGS


def _slugify(text: str) -> str:
    if not text:
        return ""
    s = str(text).strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^\w\u0590-\u05FF\-]", "", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s[:100]


def _yes_no(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s in ("כן", "yes", "y", "true", "1", "v", "✓")


def _ensure_unique_slug(db: Session, base_slug: str, exclude_id=None) -> str:
    if not base_slug:
        return base_slug
    candidate = base_slug
    counter = 2
    while True:
        if candidate not in RESERVED_SLUGS:
            q = db.query(Producer).filter(Producer.slug == candidate)
            if exclude_id:
                q = q.filter(Producer.id != exclude_id)
            if not q.first():
                return candidate
        candidate = f"{base_slug}-{counter}"
        counter += 1


def _get_or_create_category(db: Session, name: str) -> Category | None:
    name = (name or "").strip()
    if not name:
        return None
    cat = db.query(Category).filter(Category.name == name).first()
    if cat:
        return cat
    cat = Category(name=name, emoji="🌿")
    db.add(cat)
    db.flush()
    return cat


def _coerce_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _str(v: Any) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


@dataclass
class RowResult:
    row_number: int
    data: dict
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    saved: bool = False
    mojibake: bool = False


def parse_row(row: list[Any], row_number: int) -> RowResult:
    """Parse a single Excel row into a normalized dict + validation."""
    # Pad row to 23 columns
    cells = list(row) + [None] * (23 - len(row))
    name = _str(cells[0])  # A
    result = RowResult(
        row_number=row_number,
        data={
            "name": name,
            "contact_name": _str(cells[1]),
            "phone": _str(cells[2]),
            "instagram": _str(cells[3]),
            "website": _str(cells[4]),
            "whatsapp_group": _str(cells[5]),
            # G (cells[6]) — catalog/unused
            "city": _str(cells[7]),
            "category_name": _str(cells[8]),
            "pickup_points": _yes_no(cells[9]),
            "has_delivery": _yes_no(cells[10]),
            "delivery_area_cities": [
                c.strip()
                for c in (str(cells[11]) if cells[11] else "").split(",")
                if c.strip()
            ],
            "kosher": _str(cells[12]),
            "description": _str(cells[13]),
            "short_description": _str(cells[14]),
            # P (cells[15]) — status/unused
            "slug": _str(cells[16]) or _slugify(name or ""),
            "lat": _coerce_float(cells[17]),
            "lng": _coerce_float(cells[18]),
            "price_range": _str(cells[19]),
            "grass_fed": _yes_no(cells[20]),
            "organic_certified": _yes_no(cells[21]),
            "admin_notes": _str(cells[22]),
        },
    )

    # MEH-154: detect UTF-8 Hebrew decoded as Latin-1 (mojibake).
    # Check name + key text fields. × (U+00D7) is the dead-giveaway byte.
    _text_fields = [
        name,
        result.data.get("city"),
        result.data.get("description"),
        result.data.get("contact_name"),
    ]
    if any(_has_mojibake(f) for f in _text_fields):
        result.errors.append("קידוד לא תקין — שמרי את הקובץ כ-XLSX ולא XLS.")
        result.mojibake = True

    if not name:
        result.errors.append("חסר שם עסק (עמודה A)")
    if not result.data["city"]:
        result.warnings.append("חסרה עיר/אזור (עמודה H)")
    if not result.data["category_name"]:
        result.warnings.append("חסרה קטגוריה (עמודה I)")

    return result


def import_rows(db: Session, rows: list[list[Any]], dry_run: bool = False) -> dict:
    """Import a list of rows (already with header skipped). Returns summary dict."""
    # Pass 1: parse all rows before touching the DB.
    all_parsed = [parse_row(row, idx) for idx, row in enumerate(rows, start=2)]

    # MEH-154: if any row has mojibake, reject the entire batch — never partial-commit
    # corrupted data.
    bad_rows = [r for r in all_parsed if r.mojibake]
    if bad_rows:
        return {
            "imported": 0,
            "skipped": 0,
            "errors": len(bad_rows),
            "batch_rejected": True,
            "batch_error": "קידוד לא תקין — שמרי את הקובץ כ-XLSX ולא XLS.",
            "rows": [
                {
                    "row_number": r.row_number,
                    "data": {"name": r.data.get("name")},
                    "errors": r.errors,
                    "warnings": [],
                }
                for r in bad_rows
            ],
        }

    # Pass 2: save rows.
    results: list[RowResult] = []
    imported = skipped = errors = 0

    for parsed in all_parsed:
        if not parsed.data["name"]:
            skipped += 1
            results.append(parsed)
            continue
        if parsed.errors:
            errors += 1
            results.append(parsed)
            continue

        if dry_run:
            results.append(parsed)
            imported += 1
            continue

        # Skip duplicates by name
        existing = (
            db.query(Producer).filter(Producer.name == parsed.data["name"]).first()
        )
        if existing:
            parsed.warnings.append("עסק עם שם זה כבר קיים — דולג")
            skipped += 1
            results.append(parsed)
            continue

        slug = _ensure_unique_slug(db, parsed.data["slug"])
        producer = Producer(
            name=parsed.data["name"],
            contact_name=parsed.data["contact_name"],
            description=parsed.data["description"],
            short_description=parsed.data["short_description"],
            city=parsed.data["city"],
            lat=parsed.data["lat"],
            lng=parsed.data["lng"],
            phone=parsed.data["phone"],
            instagram=parsed.data["instagram"],
            website=parsed.data["website"],
            whatsapp_group=parsed.data["whatsapp_group"],
            slug=slug,
            price_range=parsed.data["price_range"],
            starting_price_label=parsed.data["price_range"],
            grass_fed=parsed.data["grass_fed"],
            organic_certified=parsed.data["organic_certified"],
            has_delivery=parsed.data["has_delivery"],
            pickup_points=parsed.data["pickup_points"],
            kosher=parsed.data["kosher"],
            admin_notes=parsed.data["admin_notes"],
            is_verified=True,
            status="approved",  # imported = pre-approved
        )
        db.add(producer)
        db.flush()

        cat = _get_or_create_category(db, parsed.data["category_name"])
        if cat:
            db.add(ProducerCategory(producer_id=producer.id, category_id=cat.id))

        for city in parsed.data["delivery_area_cities"]:
            db.add(DeliveryArea(producer_id=producer.id, city=city))

        parsed.saved = True
        results.append(parsed)
        imported += 1

    if not dry_run:
        db.commit()

    return {
        "imported": imported,
        "skipped": skipped,
        "errors": errors,
        "rows": [
            {
                "row_number": r.row_number,
                "data": {
                    "name": r.data.get("name"),
                    "city": r.data.get("city"),
                    "category_name": r.data.get("category_name"),
                    "slug": r.data.get("slug"),
                    "phone": r.data.get("phone"),
                },
                "errors": r.errors,
                "warnings": r.warnings,
            }
            for r in results
        ],
    }
