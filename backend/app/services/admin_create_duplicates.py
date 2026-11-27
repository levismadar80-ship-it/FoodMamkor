"""
Module:   admin_create_duplicates
Purpose:  Stop the admin «new business» form from opening a second page for a
          business we already have. Before the row is created, its phones,
          email, Instagram, website and Facebook are compared with every
          business (any status, owned or not); a match answers 409 with the
          matching businesses, and the admin either opens the existing one or
          sends the form again with `allow_duplicate` (MEH-3883, 26/11: many
          drafts are built in parallel before the Friday outreach).
Touches:  reads producers / users / producer_staff through
          services/business_identity.py. Writes nothing.
Does NOT: compare names (the list's «כפילות?» does, producer_duplicates.py),
          check edits (PUT), or merge (routers/admin_draft_merge.py).
Related:  services/admin_producer_writes.py admin_create_producer_row (the
          caller) · components/admin/ProducerForm.jsx +
          components/admin/AdminDuplicateMatches.jsx (the 409 screen).
History:  MEH-3883 (creation).
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.business_identity import identity_matches, identity_of

DUPLICATE_CODE = "DUPLICATE_BUSINESS"
# The admin sees the strongest few; more than this is a data problem of its
# own, and the list in /admin/producers shows the rest.
MAX_SHOWN = 5
LOCK_KEY = "admin_create_business"


def refuse_duplicate_create(db: Session, data: Any) -> None:
    """409 when the business being created shares a strong signal with one we
    have, unless the admin already saw the list and chose to go on.

    The admin is trusted, so unlike the sign-up check the owners' account
    phones count, and names and full account emails are shown.
    """
    if getattr(data, "allow_duplicate", False):
        return
    # Parallel creates of one business (page threads, 26/11) must not both see
    # zero matches: serialise admin creates until this transaction commits.
    # REUSES: backend/app/services/producer_me_writes.py — xact advisory lock.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:k, 0))"),
            {"k": LOCK_KEY},
        )
    candidate = identity_of(
        phones=[data.phone, data.secondary_phone],
        emails=[data.contact_email],
        instagram=data.instagram,
        website=data.website,
        facebook=data.facebook,
    )
    matches = identity_matches(db, candidate)
    if not matches:
        return
    raise HTTPException(
        status_code=409,
        detail={
            "code": DUPLICATE_CODE,
            "message": "נראה שכבר יש באתר עמוד לבית העסק הזה.",
            "total": len(matches),
            "matches": [
                {
                    "id": str(m.producer_id),
                    "name": m.name,
                    "status": m.status,
                    "owner_email": m.owner_email,
                    "reasons": m.reasons,
                }
                for m in matches[:MAX_SHOWN]
            ],
        },
    )
