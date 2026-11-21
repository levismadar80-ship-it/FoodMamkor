"""
Module:   group_buy_pickup_place
Purpose:  The branch a group buy is picked up from (MEH-3610): check that a
          chosen branch is the business's own, and render it as public as the
          business made it.
Touches:  producer_locations (read only)
Does NOT: decide the pickup time (group_buy_pickup_text) or send anything.
Related:  app/services/product_order_views.py:91 pickup_address (the same
          exact / approximate rule); app/services/rescue_writes.py:185 (the
          bag's own-branch check)
History:  MEH-3610 (creation)
"""

from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.models import ProducerLocation

LOCATION_NOT_FOUND = "נקודת האיסוף לא נמצאה"


def own_location(
    db: Session, producer_id: Any, location_id: UUID | None
) -> UUID | None:
    """The id back when it is this business's branch; None stays None.
    Another business's branch answers the same 404 as a missing one, so an id
    never tells whose it is (IDOR)."""
    if location_id is None:
        return None
    found = (
        db.query(ProducerLocation.id)
        .filter(
            ProducerLocation.id == location_id,
            ProducerLocation.producer_id == producer_id,
        )
        .first()
    )
    if found is None:
        raise HTTPException(status_code=404, detail=LOCATION_NOT_FOUND)
    return location_id


def location_out(loc: ProducerLocation | None) -> dict[str, Any] | None:
    """An `approximate` branch keeps its street and pin off the page: the city
    and its label only (MEH-829, as pickup_address does for an order)."""
    if loc is None:
        return None
    exact = loc.location_precision == "exact"
    return {
        "id": loc.id,
        "label": loc.label,
        "city": loc.city,
        "address": loc.address if exact else None,
        "lat": loc.lat if exact else None,
        "lng": loc.lng if exact else None,
    }


def place_line(loc: ProducerLocation | None) -> str:
    """«מקום איסוף: הסניף בכרמל — הרצל 5, חיפה\\n» for an email body, as public
    as location_out; "" without a branch."""
    out = location_out(loc)
    if out is None:
        return ""
    where = ", ".join(p for p in (out["address"], out["city"]) if p)
    text = " — ".join(p for p in (out["label"], where) if p)
    return f"מקום איסוף: {text}\n" if text else ""
