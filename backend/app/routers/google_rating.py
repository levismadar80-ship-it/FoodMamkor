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
          MEH-1506 — admin-only Places Text Search to map a place_id
          semi-automatically (search here, a human picks in ProducerForm).
"""

import logging
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models import Producer, User
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

# MEH-1506: Places Text Search (New) — admin place_id lookup. The FieldMask
# lands on the ENTERPRISE SKU exactly as the ticket assumes: id + displayName +
# formattedAddress = Pro, and userRatingCount (load-bearing — it drives the
# "N ביקורות" line + the "< 20" transparency note in ProducerForm) tips it to
# Enterprise. No field dropped. userRatingCount is DISPLAYED to the admin and
# never stored (only the chosen place_id is persisted — ToS §3.2.3(b)).
_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
_SEARCH_FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,places.userRatingCount"
)
MAX_CANDIDATES = 3


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
    row = db.query(Producer.google_place_id).filter(Producer.id == producer_id).first()
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


def _search_place_candidates(name: str | None, city: str | None) -> list[dict] | None:
    """Live Places Text Search for `<name> <city>`, up to MAX_CANDIDATES.
    Fail-quiet: returns None on missing key, empty query, any HTTP/parse error,
    or no results. NEVER caches — userRatingCount is passed to the caller for
    display only (the admin still picks; only the chosen place_id is stored).
    """
    api_key = settings.google_places_api_key
    if not api_key:
        return None
    query = " ".join(part for part in (name, city) if part and part.strip()).strip()
    if not query:
        return None
    try:
        resp = httpx.post(
            _TEXT_SEARCH_URL,
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": _SEARCH_FIELD_MASK,
                "Content-Type": "application/json",
            },
            json={"textQuery": query, "languageCode": "he", "regionCode": "IL"},
            timeout=_TIMEOUT_SECONDS,
        )
        if resp.status_code != 200:
            log.info(
                "[google_rating] Text Search %s for query=%r — fail-quiet",
                resp.status_code,
                query,
            )
            return None
        data = resp.json()
    except Exception as exc:  # noqa: BLE001 — fail-quiet on ANY error (network/JSON)
        log.warning("[google_rating] Text Search call failed: %s — fail-quiet", exc)
        return None

    candidates: list[dict] = []
    for place in (data.get("places") or [])[:MAX_CANDIDATES]:
        place_id = place.get("id")
        if not place_id:
            continue
        candidates.append(
            {
                "place_id": place_id,
                "display_name": (place.get("displayName") or {}).get("text"),
                "formatted_address": place.get("formattedAddress"),
                # Absent for a place with no reviews yet → 0 (below MIN_REVIEWS).
                "user_rating_count": place.get("userRatingCount") or 0,
            }
        )
    return candidates or None


@router.get("/admin/producers/{producer_id}/google-place-candidates")
@limiter.limit("30/minute")
def get_google_place_candidates(
    producer_id: UUID,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only: up to 3 Google Place candidates for a producer, or 204.

    Builds the query from the producer's own name + city and runs Places Text
    Search. 204 (fail-quiet) when: no server key, no results, or any Google API
    error. 403 for non-admins (require_admin). 404 for an unknown producer.
    NO auto-select — the admin picks one in ProducerForm; the response is
    display-only and nothing here is stored (ToS §3.2.3(b)).
    """
    row = (
        db.query(Producer.name, Producer.city)
        .filter(Producer.id == producer_id)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    candidates = _search_place_candidates(row[0], row[1])
    if not candidates:
        return Response(status_code=204)
    return {"candidates": candidates}
