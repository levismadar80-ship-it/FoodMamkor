"""
Module:   license_validation
Purpose:  Single source of truth for the conditional-required check on
          `producer_license_number`. Called from every router that accepts
          a producer payload with a `category_ids` field — register, public
          create, admin create, owner / admin update.
Touches:  reads `categories` table (one SELECT per call).
Does NOT: validate format (frontend-only UX warning per MEH-530 spec),
          persist anything, mutate the producer row.
Related:  app/constants.py:LICENSE_REQUIRED_CATEGORIES,
          frontend/lib/license-required-categories.js (mirror).
History:  MEH-530 (creation, 2026-05-15).
"""

from collections.abc import Iterable
from typing import TYPE_CHECKING

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.models.models import Category

if TYPE_CHECKING:
    from app.models.models import Producer


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
    """Return True if any of the given category IDs maps to a name in
    LICENSE_REQUIRED_CATEGORIES. Empty input → False (no categories selected
    means nothing is required yet — Pydantic still applies on the field itself).
    """
    ids = list(category_ids or [])
    if not ids:
        return False
    names = {
        row.name for row in db.query(Category.name).filter(Category.id.in_(ids)).all()
    }
    return bool(names.intersection(LICENSE_REQUIRED_CATEGORIES))


def ensure_license_for_categories(
    db: Session,
    category_ids: Iterable[int] | None,
    license_number: str | None,
) -> None:
    """Raise HTTPException(422) if at least one of `category_ids` belongs
    to LICENSE_REQUIRED_CATEGORIES and `license_number` is missing.

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


def enforce_license_gate_on_update(
    db: Session,
    producer: "Producer",
    payload: dict,
    category_ids: list[int] | None,
) -> None:
    """Shared by the owner PUT (producer_me.py) and the admin PUT (admin.py) —
    MEH-2707 moved it here from producer_me so both paths have ONE rule. The
    admin path used to re-check the FULL category set, so an admin could not
    save any field on an unlicensed business in a licensed category. Going
    live is gated separately: admin.py approve_producer -> _assert_approvable.

    MEH-999: grandfather rule — validate NEWLY-ADDED categories only, never
    the set the producer already holds. The MEH-530 full-set re-check bricked
    every edit for MEH-971 license-pending producers (licensed category +
    NULL license → 422 on any PUT). Same posture as the auth.py register
    bypass: NOT a security relaxation — licensed-only is enforced downstream
    by the admin approval guard and by publication requiring
    status=="approved"; a pending producer editing her bio publishes nothing.
    """
    effective_license = (
        payload.get("producer_license_number")
        if "producer_license_number" in payload
        else producer.producer_license_number
    )
    persisted_category_ids = {c.id for c in producer.categories}
    added_category_ids = (
        [cid for cid in category_ids if cid not in persisted_category_ids]
        if category_ids is not None
        else []
    )
    # Helper short-circuits on an empty list, so this only fires for adds.
    ensure_license_for_categories(db, added_category_ids, effective_license)

    # MEH-999 (2c): the one hole grandfathering would open — a LICENSED
    # producer blanking her license while keeping a license-required category.
    # Re-run the gate against the final category set with the cleared value.
    # Pending producers are unaffected: their license is already NULL, so
    # nothing is being cleared.
    license_cleared = (
        "producer_license_number" in payload
        and not (payload.get("producer_license_number") or "").strip()
        and (producer.producer_license_number or "").strip()
    )
    if license_cleared:
        final_category_ids = (
            category_ids if category_ids is not None else list(persisted_category_ids)
        )
        ensure_license_for_categories(db, final_category_ids, None)
