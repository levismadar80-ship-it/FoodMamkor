"""
Producer query helpers — pure ORM utilities used by the producers router.

Lifted from backend/app/routers/producers.py during the MEH-438 refactor.
These helpers carry no FastAPI surface and can be imported by any router
or background job that needs to hydrate or count Producer rows.
"""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models import (
    DeliveryArea,
    Favorite,
    Producer,
    ProducerCategory,
    ProducerLocation,
)
from app.schemas.schemas import ProducerCreate

logger = structlog.get_logger(__name__)

# Earth radius in km — used by the Haversine formula. Accurate enough for
# city-scale directory queries (well under 0.5% error vs. WGS-84 ellipsoid).
EARTH_RADIUS_KM = 6371.0


def _haversine_expr(lat: float, lng: float, target_lat, target_lng):
    """Core Haversine formula (km) between a fixed (lat, lng) and a pair of
    target lat/lng column expressions. Parameterized on the target columns so
    the same trig can measure to `Producer.lat/lng` (single-point) or to
    `ProducerLocation.lat/lng` (per-location) — MEH-1402.

    The inner sum can land a hair above 1.0 due to float rounding, which
    would make acos() raise "input is out of range". func.least(1.0, ...)
    clamps it.
    """
    cos_delta = func.cos(func.radians(lat)) * func.cos(
        func.radians(target_lat)
    ) * func.cos(func.radians(target_lng) - func.radians(lng)) + func.sin(
        func.radians(lat)
    ) * func.sin(func.radians(target_lat))
    return EARTH_RADIUS_KM * func.acos(func.least(1.0, cos_delta))


def haversine_km(lat: float, lng: float):
    """
    Haversine distance (in km) between the caller's (lat, lng) and each
    producer's single `Producer.lat/lng` point. Returns a SQLAlchemy
    expression usable in SELECT, WHERE, and ORDER BY clauses. Runs entirely
    in Postgres — no PostGIS required, just standard trig functions.

    Retained as the single-point primitive; the multi-location geo path uses
    `haversine_min_km` (MEH-1402).
    """
    return _haversine_expr(lat, lng, Producer.lat, Producer.lng)


def haversine_min_km(lat: float, lng: float):
    """MEH-1402 (MEH-1388 chunk 2): NEAREST-point distance (km) from the
    caller's (lat, lng) to a producer, measured across ALL of that producer's
    `producer_locations` rows — the minimum wins (radius/sort want the closest
    branch or pickup point, not the primary).

    Implemented as a correlated scalar subquery (`MIN(...)` over the producer's
    location rows), NOT a JOIN in the main query — a JOIN would fan a producer
    out to one row per location and reopen the `_build_base_queries` double-
    count trap (producer_listing.py:104-110). Locations with a NULL lat OR lng
    are excluded from the MIN (no crash, just not a candidate point).

    Expand-Contract overlap (ADR-007): a producer with no usable location row
    yet — e.g. a brand-new signup created after chunk 1's backfill and before
    the chunk-4 write path — falls back via COALESCE to its own
    `Producer.lat/lng` mirror, so it never silently drops off the map/near
    feed during the overlap. Once chunk 4 dual-writes a primary location on
    create, the fallback becomes dead weight and can be dropped in Contract.
    A producer with neither a location nor a Producer point yields NULL, which
    fails `<= radius` and is correctly excluded.

    # DO NOT drop the CASE guard on the own-point fallback — Postgres LEAST()
    #        IGNORES NULL args, so func.least(1.0, cos_delta) returns 1.0 (not
    #        NULL) when Producer.lat/lng are NULL, making acos(1.0)=0 → a
    #        coordinate-less producer would falsely match at distance 0. The
    #        pre-MEH-1402 code guarded this with an explicit
    #        `Producer.lat IS NOT NULL` filter in _build_base_queries; the CASE
    #        below re-establishes the same guard inside the coalesced expr so
    #        NULL correctly propagates to `<= radius` (MEH-1402).
    """
    nearest_location_km = (
        select(
            func.min(
                _haversine_expr(lat, lng, ProducerLocation.lat, ProducerLocation.lng)
            )
        )
        .where(
            ProducerLocation.producer_id == Producer.id,
            ProducerLocation.lat.isnot(None),
            ProducerLocation.lng.isnot(None),
        )
        .correlate(Producer)
        .scalar_subquery()
    )
    own_point_km = case(
        (
            and_(Producer.lat.isnot(None), Producer.lng.isnot(None)),
            _haversine_expr(lat, lng, Producer.lat, Producer.lng),
        ),
        else_=None,
    )
    return func.coalesce(nearest_location_km, own_point_km)


def attach_badge_fields(producer):
    """MEH-18 — hydrate the computed fields the badge system consumes.
    Safe to call on already-loaded ORM instances. Assumes the products
    and delivery_areas collections are already loaded (via selectinload
    in list queries, joinedload in detail queries).

    MEH-293: also aggregates per-product dietary flags into
    `has_{gluten_free,vegan,lactose_free}_products` so the public listing
    output reflects the moved flags without an extra query (products are
    already loaded for products_count).
    """
    try:
        products = list(producer.products or [])
        producer.products_count = len(products)
    except Exception:
        logger.debug(
            "[producers] products lazy-load failed, defaulting to 0",
            producer_id=str(producer.id),
            exc_info=True,
        )
        products = []
        producer.products_count = 0
    # MEH-530: public-facing boolean signal — true when the producer has
    # supplied any non-blank license value. The raw number is never
    # populated onto ProducerListOut/ProducerDetailOut; admin/owner routes
    # use ProducerAdminOut which serialises the column directly.
    raw_license = getattr(producer, "producer_license_number", None)
    producer.has_producer_license = bool(raw_license and raw_license.strip())
    producer.has_gluten_free_products = any(
        getattr(p, "is_gluten_free", False) for p in products
    )
    producer.has_vegan_products = any(getattr(p, "is_vegan", False) for p in products)
    producer.has_lactose_free_products = any(
        getattr(p, "is_lactose_free", False) for p in products
    )
    try:
        producer.delivery_count = len(producer.delivery_areas or [])
    except Exception:
        logger.debug(
            "[producers] delivery_areas lazy-load failed, defaulting to 0",
            producer_id=str(producer.id),
            exc_info=True,
        )
        producer.delivery_count = 0
    if producer.created_at:
        delta = datetime.utcnow() - producer.created_at
        producer.days_since_created = max(0, delta.days)
    else:
        producer.days_since_created = None
    return producer


def attach_favorites_counts(producers, db: Session):
    """MEH-106: batch-load favorites_count for a list of producers (single query)."""
    if not producers:
        return producers
    ids = [p.id for p in producers]
    counts = dict(
        db.query(Favorite.producer_id, func.count(Favorite.user_id))
        .filter(Favorite.producer_id.in_(ids))
        .group_by(Favorite.producer_id)
        .all()
    )
    for p in producers:
        p.favorites_count = counts.get(p.id, 0)
    return producers


def attach_favorites_count(producer, db: Session):
    """MEH-106: load favorites_count for a single producer."""
    producer.favorites_count = (
        db.query(func.count(Favorite.user_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )
    return producer


def get_producer_or_404(db: Session, producer_id: UUID) -> Producer:
    """Fetch a single producer by id or raise the project-standard 404.

    Used by endpoints that need a presence check before performing a
    side-effect (click logging, follow toggle). Returns the full row so
    callers can read whichever fields they need; the cost is one row
    fetch versus a `SELECT 1`-style existence probe.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def create_producer_with_relations(db: Session, data: ProducerCreate) -> Producer:
    """Create a pending producer row plus its category and delivery-area
    join rows in a single transaction. Returns the refreshed instance.

    Mirrors the pre-refactor body of the POST /producers endpoint
    verbatim: status defaults to 'pending', category_ids and
    delivery_areas are persisted as ProducerCategory / DeliveryArea
    rows, then the producer is committed and refreshed.
    """
    producer = Producer(
        name=data.name,
        description=data.description,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        # MEH-296 3d: public-create parity for the new channels.
        facebook=data.facebook,
        external_order_form=data.external_order_form,
        # MEH-530: persisted as-is — None when not supplied. Conditional
        # required-vs-optional is gated by the router-level helper before
        # this function is called.
        producer_license_number=data.producer_license_number,
        status="pending",
    )
    db.add(producer)
    db.flush()

    # MEH-1297: payload order = stored order (position 0 = primary).
    for pos, cid in enumerate(data.category_ids):
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid, position=pos))

    for da in data.delivery_areas:
        db.add(
            DeliveryArea(
                producer_id=producer.id,
                city=da.city,
                min_order=da.min_order,
                delivery_day=da.delivery_day,
            )
        )

    db.commit()
    db.refresh(producer)
    return producer
