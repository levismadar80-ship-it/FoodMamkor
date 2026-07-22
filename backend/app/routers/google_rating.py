"""
Module:   google_rating
Purpose:  Serve the quiet public "Google rating" trust line for a producer —
          live star rating + review count fetched per-request from Google, only
          for producers an admin mapped (place_id) whose Google profile has
          ≥20 reviews. Returns 204 (renders nothing) in every other case.
Touches:  Google Maps Platform — Places API (New), Enterprise SKU
          (rating, userRatingCount, googleMapsUri). Server-side key only.
Does NOT: store, cache, or persist any Google value. The rating/count are
          returned straight to the caller and dropped — Google Maps Platform
          ToS §3.2.3(b) (No Caching) forbids persisting them. The only stored
          datum (producers.google_place_id) is written elsewhere: admin PUT via
          routers/admin.py (ProducerUpdate). This router is read-only proxy.
Related:  routers/reviews.py:46 (fail-quiet external-call idiom this mirrors),
          schemas.schemas.GoogleRatingOut, models.Producer.google_place_id.
History:  MEH-1490 (creation) — external trust signal, live-fetch only.
"""
import logging
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Producer
from app.rate_limit import limiter
from app.schemas.schemas import GoogleRatingOut

router = APIRouter(tags=["google-rating"])
log = logging.getLogger(__name__)

# MEH-1490: the line renders only for a strong Google profile. Rohde, Kupfer &
# Zimmermann 2022 (Electronic Markets, 10.1007/s12525-022-00595-3): a large
# external counter suppresses native review-writing, so we gate hard on volume.
MIN_REVIEWS = 20

# Places API (New) single-place endpoint. FieldMask is MANDATORY — the request
# errors without it — and is scoped to exactly the three fields we render, so we
# never pull (and never risk persisting) anything else. REUSES the header shape
# from frontend/lib/places.js:187 (X-Goog-Api-Key + X-Goog-FieldMask).
_PLACES_URL = "https://places.googleapis.com/v1/places/{place_id}"
_FIELD_MASK = "rating,userRatingCount,googleMapsUri"
_TIMEOUT_SECONDS = 4.0


def _fetch_place_details(place_id: str) -> dict | None:
    """Live GET the three Google fields for a place_id. Fail-quiet: returns None
    on missing key, any HTTP/parse error, or an incomplete payload. NEVER caches.
    """
    api_key = settings.google_places_api_key
    if not api_key:
        # Dormant until an operator sets GOOGLE_PLACES_API_KEY (see config.py).
        return None
    try:
        resp = httpx.get(
            _PLACES_URL.format(place_id=place_id),
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": _FIELD_MASK,
            },
            timeout=_TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            log.info(
                "[google_rating] Places API %s for place_id=%s — fail-quiet",
                resp.status_code,
                place_id,
            )
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — fail-quiet on ANY error (network/JSON)
        log.warning("[google_rating] Places API call failed: %s — fail-quiet", exc)
        return None

    rating = data.get("rating")
    count = data.get("userRatingCount")
    uri = data.get("googleMapsUri")
    # A profile with no rating yet (or a stripped payload) → nothing to show.
    if rating is None or count is None or not uri:
        return None
    return {"rating": rating, "user_rating_count": count, "google_maps_uri": uri}


@router.get("/producers/{producer_id}/google-rating", response_model=GoogleRatingOut)
@limiter.limit("60/minute")
def get_google_rating(
    producer_id: UUID,
    request: Request,
    db: Session = Depends(get_db),
):
    """Live Google rating for a producer, or 204 when the line must not render.

    204 (empty, no layout hole client-side) when: no mapped place_id, the live
    profile has < MIN_REVIEWS reviews, no server key, or any Google API error.
    404 only when the producer id itself does not exist.
    """
    row = (
        db.query(Producer.google_place_id)
        .filter(Producer.id == producer_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    place_id = row[0]
    if not place_id:
        return Response(status_code=204)

    details = _fetch_place_details(place_id)
    if details is None:
        return Response(status_code=204)
    if details["user_rating_count"] < MIN_REVIEWS:
        return Response(status_code=204)

    return GoogleRatingOut(**details)
