"""
Module:   license_validation
Purpose:  Single source of truth for the conditional-required check on
          `producer_license_number`. Called from every router that accepts
          a producer payload with a `category_ids` field — register, public
          create, admin create, owner / admin update.
Touches:  reads `categories` table (one SELECT per call).
Does NOT: validate format (frontend-only UX warning per MEH-530 spec),
          persist anything, mutate the producer row.
Related:  categories.requires_license (the answer, set when a category is
          created; the seed fills it from app/constants.py
          LICENSE_REQUIRED_CATEGORIES).
History:  MEH-530 (creation, 2026-05-15). MEH-3255 (D10): reads the column,
          so a category an admin creates is no longer silently exempt.
"""

from collections.abc import Iterable
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import Category


# MEH-530: shared Hebrew copy for the 422 message — keep both router-level
# and any future client surface in sync via this constant rather than
# inlining the string at 4 call sites.
LICENSE_REQUIRED_ERROR_HE = "מספר רישיון ייצור חובה לקטגוריה זו"


def _normalize_license(value: str | None) -> str | None:
    """Treat None / empty / whitespace-only as 'no license supplied'."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def categories_require_license(db: Session, category_ids: Iterable[int]) -> bool:
    """Return True if any of the given category IDs has
    `requires_license` (MEH-3255). Empty input → False (no categories selected
    means nothing is required yet — Pydantic still applies on the field itself).
    """
    ids = list(category_ids or [])
    if not ids:
        return False
    return (
        db.query(Category.id)
        .filter(Category.id.in_(ids), Category.requires_license.is_(True))
        .first()
        is not None
    )


def ensure_license_for_categories(
    db: Session,
    category_ids: Iterable[int] | None,
    license_number: str | None,
) -> None:
    """Raise HTTPException(422) if at least one of `category_ids` belongs
    to a category with `requires_license` and `license_number` is missing.

    `license_number` is normalised first: None / "" / whitespace-only all
    count as "not supplied" — necessary because frontend forms commonly send
    an empty string for unfilled optional inputs.

    Format validation is NOT performed here — see MEH-530 product decision
    in app/constants.py:PRODUCER_LICENSE_REGEX.
    """
    if not categories_require_license(db, category_ids or []):
        return
    if _normalize_license(license_number) is None:
        raise HTTPException(status_code=422, detail=LICENSE_REQUIRED_ERROR_HE)


# MEH-3026: enforce_license_gate_on_update (MEH-999 / MEH-2707) was removed —
# a missing licence no longer blocks adding a category, on the owner or the
# admin PUT. Registration still uses ensure_license_for_categories above.
