"""
Module:   delivery_validation
Purpose:  Guard the MEH-1255 delivery-exclusion invariant on PATCH-style
          producer updates: an exclusion list ("לכל הארץ חוץ מ:") is only
          legal while delivery_nationwide is effectively true.
Does NOT: validate the nationwide-XOR-cities invariant — that stays in
          schemas.ProducerUpdate._validate_location_mode + the DB CHECK
          delivery_nationwide_xor_cities.
Related:  app/routers/producer_me.py (owner PUT), app/routers/admin.py
          (admin PUT), migration e7c4b1f95a2d (DB CHECK
          delivery_excluded_requires_nationwide).
History:  MEH-1255 (creation).
"""

from fastapi import HTTPException

from app.models.models import Producer


def ensure_exclusion_requires_nationwide(producer: Producer, payload: dict) -> None:
    """Raise 422 when the EFFECTIVE post-update state would carry excluded
    cities without nationwide mode.

    The Pydantic validator only sees fields present in the request, so a
    partial update (e.g. excluded cities sent alone while the stored
    delivery_nationwide is false, or nationwide switched off while a stored
    exclusion list exists) would otherwise surface as a DB CHECK
    IntegrityError 500. REUSES: admin.py effective-state pattern of the
    MEH-530 license gate.
    """
    touches = "delivery_excluded_cities" in payload or "delivery_nationwide" in payload
    if not touches:
        return
    effective_nationwide = payload.get(
        "delivery_nationwide", producer.delivery_nationwide
    )
    effective_excluded = payload.get(
        "delivery_excluded_cities", producer.delivery_excluded_cities or []
    )
    if effective_excluded and not effective_nationwide:
        raise HTTPException(
            status_code=422,
            detail="ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ",
        )
