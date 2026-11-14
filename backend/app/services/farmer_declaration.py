"""
Module:   farmer_declaration
Purpose:  Server-side gate + record for the grower declaration («גידלתי
          בחלקתי בלבד») at producer registration, apart from the licensing
          declaration (declared_at / declaration_version).
Touches:  categories (read by id + name).
Does NOT: stamp the licensing declaration (routers/auth.py) or the claim /
          owner-invite paths (routers/producer_claim.py,
          producer_owner_invite.py) — those still fold the grower line into
          declaration_accepted; follow-up card.
Related:  constants.py FARMER_DECLARATION_CATEGORIES / _VERSION,
          frontend/lib/farmer-declaration.js (the client mirror).
History:  MEH-2923 (creation).
"""

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.constants import FARMER_DECLARATION_CATEGORIES, FARMER_DECLARATION_VERSION
from app.models import Category


def requires_farmer_declaration(db: Session, category_ids: list[int]) -> bool:
    """Membership by NAME, like LICENSE_REQUIRED_CATEGORIES."""
    if not category_ids:
        return False
    return (
        db.query(Category.id)
        .filter(
            Category.id.in_(category_ids),
            Category.name.in_(FARMER_DECLARATION_CATEGORIES),
        )
        .first()
        is not None
    )


def farmer_declaration_stamp(
    db: Session, category_ids: list[int], accepted: bool
) -> dict[str, Any]:
    """422 when the grower line is required and missing; otherwise the
    Producer kwargs that record it ({} when it is not required)."""
    if not requires_farmer_declaration(db, category_ids):
        return {}
    if not accepted:
        raise HTTPException(
            status_code=422,
            detail="יש לאשר את הצהרת המגדל כדי להמשיך",
        )
    return {
        "farmer_declared_at": datetime.now(timezone.utc),
        "farmer_declaration_version": FARMER_DECLARATION_VERSION,
    }
