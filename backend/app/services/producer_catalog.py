"""
Module:   producer_catalog
Purpose:  The small public catalog reads (total count, per-city counts, one
          random business) and the request checks of GET /producers.
Touches:  producers (read).
Does NOT: build the listing query — services/producer_listing.py
          (build_producers_query), which routers/producers.py still calls by
          name so tests can spy on it there. Registers no routes.
Related:  backend/app/routers/producers.py (list_producers, producers_count,
          producers_cities, random_producer) ·
          backend/app/services/producer_listing.py (is_business,
          catalog_default_availability_condition, MAX_CITIES_PER_QUERY).
History:  MEH-3559 (moved here verbatim from routers/producers.py, no
          behaviour change); earlier history is in the inline anchors.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.data.cities import canonical_city
from app.models import Producer
from app.schemas.schemas import DELIVERY_DAYS, ProducerRandomOut
from app.services.producer_listing import (
    MAX_CITIES_PER_QUERY,
    catalog_default_availability_condition,
    is_business,
)


def validate_listing_sort(
    *, sort: str | None, lat: float | None, lng: float | None
) -> None:
    """The sort 422s of GET /producers; the handler calls this first."""
    # MEH-1483: validate the sort axis explicitly (the router's manual-422
    # pattern, cf. record_contact_click). None/"newest" = default created_at
    # DESC; "rating" = avg_rating DESC nulls-last. An unknown value 422s rather
    # than silently falling back to newest.
    if sort is not None and sort not in ("newest", "rating", "distance"):
        raise HTTPException(status_code=422, detail="ערך מיון לא חוקי")
    # MEH-1829: distance ordering has no origin without both coordinates — a
    # 422 here, not a silent fall-back to newest, so the frontend's GPS gate
    # and the API agree on what "sort by distance" requires.
    if sort == "distance" and (lat is None or lng is None):
        raise HTTPException(
            status_code=422, detail="מיון לפי מרחק דורש מיקום — lat ו-lng חובה"
        )


def validate_listing_filters(
    *,
    cities: list[str] | None,
    delivery_day: str | None,
    delivery_days: list[str] | None,
) -> None:
    """The filter 422s of GET /producers; called right after the sort check."""
    # MEH-2790: the region list is bounded. The largest region in
    # frontend/data/regions.js is ~18 cities, so 40 is generous headroom while
    # still bounding a hostile caller — the same number and the same reasoning
    # as _MAX_DELIVERY_CITIES. A 422 rather than a silent truncation: a
    # truncated region would under-count a landing page's >=5 gate and 404 a
    # page that should exist, which is exactly the silent failure this feature
    # must not have.
    if cities is not None and len(cities) > MAX_CITIES_PER_QUERY:
        raise HTTPException(
            status_code=422,
            detail=f"יותר מדי ערים בבקשה — עד {MAX_CITIES_PER_QUERY}",
        )
    # MEH-1645: whitelist the day param against the canonical vocabulary —
    # same list DeliveryAreaCreate validates on the write path (MEH-1644).
    # MEH-2036: the plural is validated with the SAME whitelist and the SAME
    # Hebrew 422 — one bad member rejects the whole request rather than being
    # silently dropped, so a hand-edited URL can never quietly return a result
    # set that doesn't match what it asked for. (The FRONTEND drops unknown
    # values on hydration instead; that asymmetry is intentional and matches
    # MEH-1645 — the URL bar is untrusted input to the API but a recoverable
    # typo in the browser.)
    for value in [delivery_day, *(delivery_days or [])]:
        if value is not None and value not in DELIVERY_DAYS:
            raise HTTPException(
                status_code=422,
                detail="יום משלוח לא מוכר — יש לבחור יום בעברית (ראשון עד שבת)",
            )


def catalog_count(db: Session) -> int:
    """Businesses the catalog shows by default (same rule as X-Total-Count)."""
    count: int = (
        db.query(func.count(Producer.id))
        .filter(
            is_business(),  # MEH-2459
            catalog_default_availability_condition(),
        )
        .scalar()
        or 0
    )
    return count


def catalog_city_counts(db: Session) -> list[dict[str, object]]:
    """[{city, count}] for the /map region control, biggest first."""
    rows = (
        db.query(Producer.city, func.count(Producer.id).label("count"))
        .filter(
            is_business(),  # MEH-2459
            catalog_default_availability_condition(),
            Producer.city.isnot(None),
            func.trim(Producer.city) != "",
        )
        .group_by(Producer.city)
        .all()
    )
    # MEH-2602: rows saved before writes were canonicalised may hold an alias
    # («בנימינה»); fold them into the canonical name so one town is one chip.
    totals: dict[str, int] = {}
    for city, count in rows:
        name = canonical_city(city) or city
        totals[name] = totals.get(name, 0) + count
    ordered = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    return [{"city": city, "count": count} for city, count in ordered]


def random_catalog_producer(db: Session) -> ProducerRandomOut:
    """One business from the default catalog set; 404 when it is empty."""
    row = (
        db.query(Producer.id, Producer.slug)
        .filter(
            is_business(),  # MEH-2459
            catalog_default_availability_condition(),
        )
        .order_by(func.random())
        .limit(1)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="אין בתי עסק זמינים")
    return ProducerRandomOut(id=row.id, slug=row.slug)
