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
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    DeliveryArea,
    Favorite,
    Producer,
    ProducerCategory,
)
from app.schemas.schemas import ProducerCreate

logger = structlog.get_logger(__name__)

# Earth radius in km — used by the Haversine formula. Accurate enough for
# city-scale directory queries (well under 0.5% error vs. WGS-84 ellipsoid).
EARTH_RADIUS_KM = 6371.0


def haversine_km(lat: float, lng: float):
    """
    Haversine distance (in km) between the caller's (lat, lng) and each
    producer row. Returns a SQLAlchemy expression that can be used in
    SELECT, WHERE, and ORDER BY clauses. Runs entirely in Postgres — no
    PostGIS required, just standard trig functions.

    The inner sum can land a hair above 1.0 due to float rounding, which
    would make acos() raise "input is out of range". func.least(1.0, ...)
    clamps it.
    """
    cos_delta = func.cos(func.radians(lat)) * func.cos(
        func.radians(Producer.lat)
    ) * func.cos(func.radians(Producer.lng) - func.radians(lng)) + func.sin(
        func.radians(lat)
    ) * func.sin(func.radians(Producer.lat))
    return EARTH_RADIUS_KM * func.acos(func.least(1.0, cos_delta))


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
        status="pending",
    )
    db.add(producer)
    db.flush()

    for cid in data.category_ids:
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

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
