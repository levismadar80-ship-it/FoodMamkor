"""
Module:   rescue_pilot
Purpose:  Tell the business, before the publish form, which of its pickup
          points are in a town the rescue-bags pilot is open in (MEH-2921 c).
Touches:  producer_locations (read).
Does NOT: decide anything — POST /rescue/offers keeps its own city gate
          (rescue.py city_in_pilot); this is the same answer, asked earlier.
          Lives outside rescue.py only because that file is at the 1,500-line
          ratchet (code-execution.md §16).
Related:  backend/app/routers/rescue.py rescue_cities / city_in_pilot,
          frontend/components/dashboard/RescueTab.jsx.
History:  MEH-2921 (creation).
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models.models import ProducerLocation, User
from app.rate_limit import limiter
from app.routers import rescue as rescue_routes
from app.schemas.rescue import RescuePilotLocationsOut

router = APIRouter(tags=["rescue"])


def _rescue_enabled() -> None:
    # Looked up at call time so a test (or the flag) flipping rescue's own
    # switch is seen here too — one switch for the whole pilot.
    rescue_routes.require_rescue_enabled()


@router.get(
    "/producers/me/rescue/pilot-locations",
    response_model=RescuePilotLocationsOut,
    dependencies=[Depends(_rescue_enabled)],
)
@limiter.limit("60/minute")
def my_pilot_locations(
    request: Request,
    current_user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Any:
    """The caller's own pickup points whose town is in RESCUE_BAGS_CITIES."""
    if not current_user.producer_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין בית עסק מקושר"
        )
    rows = (
        db.query(ProducerLocation.id, ProducerLocation.city)
        .filter(ProducerLocation.producer_id == current_user.producer_id)
        .all()
    )
    return {
        "location_ids": [
            row.id for row in rows if rescue_routes.city_in_pilot(row.city)
        ]
    }
