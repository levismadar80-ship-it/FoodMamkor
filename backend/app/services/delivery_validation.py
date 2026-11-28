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
          delivery_excluded_requires_nationwide), migration d8c3f1a75e29
          (DB CHECK producer_nationwide_requires_delivery).
History:  MEH-1255 (creation); MEH-1879 (nationwide-requires-delivery guard);
          MEH-1943 chunk 3 (`{code, message, params}` details); MEH-3977
          (location-mode guard: place OR delivery OR partner stores).
"""

from typing import Any
from fastapi import HTTPException

from app.models.models import Producer
from app.schemas.partner_stores import LOCATION_MODE_MESSAGE

# MEH-1943 chunk 3: `{code, message, params}` (the MEH-1164 / MEH-1940 /
# chunk-1 ONE_PRIMARY_REQUIRED_DETAIL shape). `message` is the existing Hebrew
# sentence word for word, so a consumer without a code resolver shows exactly
# what it showed before; consumers that resolve the code read the copy from
# messages/*.json (dashboard.producer.delivery.errors.<code>,
# the admin form reads the same dashboard.producer.delivery.errors.<code> keys). The schemas.py ValueErrors carry the
# same sentences and are a separate (Pydantic array) surface.
EXCLUDED_REQUIRES_NATIONWIDE_DETAIL = {
    "code": "excluded_requires_nationwide",
    "message": "ערים מוחרגות אפשריות רק עם משלוחים לכל הארץ",
    "params": {},
}
NATIONWIDE_REQUIRES_DELIVERY_DETAIL = {
    "code": "nationwide_requires_delivery",
    "message": '"לכל הארץ" מסומן, אבל "משלוחים" לא. סמנו "משלוחים", או בטלו את "לכל הארץ".',
    "params": {},
}


# MEH-3977: the effective-state twin of ProducerUpdate._validate_location_mode
# (DB CHECK producer_location_mode). Same sentence as the schema ValueError.
LOCATION_MODE_DETAIL = {
    "code": "location_mode_required",
    "message": LOCATION_MODE_MESSAGE,
    "params": {},
}


def ensure_exclusion_requires_nationwide(
    producer: Producer, payload: dict[str, Any]
) -> None:
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
            detail=EXCLUDED_REQUIRES_NATIONWIDE_DETAIL,
        )


def ensure_nationwide_requires_delivery(
    producer: Producer, payload: dict[str, Any]
) -> None:
    """Raise 422 when the EFFECTIVE post-update state would be nationwide
    delivery on a business that declares it does not deliver.

    Same shape and same reason as the sibling above: the Pydantic validator
    only sees fields present in the request, so a partial update — nationwide
    sent alone while the stored offers_delivery is false, or delivery switched
    off while a stored nationwide flag survives — reaches the DB and surfaces
    as CHECK producer_nationwide_requires_delivery (MEH-1849, models.py:466),
    i.e. an IntegrityError 500 rather than a reasoned 422.

    That 500 was live on the admin manual-approval path from 09fbfbe9 until
    MEH-1879: the admin form renders its nationwide block conditionally
    (ProducerForm.jsx:839) but never cleared the state behind it, so unticking
    "משלוחים" submitted offers_delivery=false alongside delivery_nationwide=true.
    The form now clears it, and this guard is the defence-in-depth half — the
    form is not the only writer of these two columns.

    REUSES: ensure_exclusion_requires_nationwide above (effective-state shape).
    """
    touches = "delivery_nationwide" in payload or "offers_delivery" in payload
    if not touches:
        return
    effective_nationwide = payload.get(
        "delivery_nationwide", producer.delivery_nationwide
    )
    effective_offers = payload.get("offers_delivery", producer.offers_delivery)
    if effective_nationwide and not effective_offers:
        raise HTTPException(
            status_code=422,
            detail=NATIONWIDE_REQUIRES_DELIVERY_DETAIL,
        )


def ensure_location_mode(producer: Producer, payload: dict[str, Any]) -> None:
    """Raise 422 when the EFFECTIVE post-update state has no place, no
    delivery and no partner store (MEH-3977).

    A partial update (partner_stores=[] sent alone on a partner-only business,
    or delivery switched off while the stored place is off) would otherwise
    reach CHECK producer_location_mode as an IntegrityError 500.
    REUSES: ensure_nationwide_requires_delivery above (effective-state shape).
    """
    keys = ("has_physical_location", "offers_delivery", "partner_stores")
    if not any(k in payload for k in keys):
        return
    physical = payload.get("has_physical_location", producer.has_physical_location)
    delivery = payload.get("offers_delivery", producer.offers_delivery)
    stores = payload.get("partner_stores", producer.partner_stores or [])
    if not physical and not delivery and not stores:
        raise HTTPException(status_code=422, detail=LOCATION_MODE_DETAIL)
