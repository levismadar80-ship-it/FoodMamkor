from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory, ProducerFollower, Report, User
from app.schemas.schemas import (
    CategoryOut,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
)

router = APIRouter(tags=["producers"])

# Earth radius in km — used by the Haversine formula. Accurate enough for
# city-scale directory queries (well under 0.5% error vs. WGS-84 ellipsoid).
EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat: float, lng: float):
    """
    Haversine distance (in km) between the caller's (lat, lng) and each
    producer row. Returns a SQLAlchemy expression that can be used in
    SELECT, WHERE, and ORDER BY clauses. Runs entirely in Postgres — no
    PostGIS required, just standard trig functions.

    The inner sum can land a hair above 1.0 due to float rounding, which
    would make acos() raise "input is out of range". func.least(1.0, ...)
    clamps it.
    """
    cos_delta = (
        func.cos(func.radians(lat)) * func.cos(func.radians(Producer.lat))
        * func.cos(func.radians(Producer.lng) - func.radians(lng))
        + func.sin(func.radians(lat)) * func.sin(func.radians(Producer.lat))
    )
    return EARTH_RADIUS_KM * func.acos(func.least(1.0, cos_delta))


@router.get("/producers", response_model=list[ProducerListOut])
def list_producers(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    category: int | None = None,
    delivery_city: str | None = None,
    has_delivery: bool | None = None,
    verified: bool | None = None,
    db: Session = Depends(get_db),
):
    geo_search = lat is not None and lng is not None and radius_km is not None

    if geo_search:
        distance_expr = _haversine_km(lat, lng).label("distance_km")
        q = (
            db.query(Producer, distance_expr)
            .options(joinedload(Producer.categories))
            .filter(Producer.status == "approved")
            # Haversine is undefined for NULL coords — exclude them before
            # applying the distance filter.
            .filter(Producer.lat.isnot(None), Producer.lng.isnot(None))
            .filter(distance_expr <= radius_km)
            .order_by(distance_expr.asc())
        )
    else:
        q = (
            db.query(Producer)
            .options(joinedload(Producer.categories))
            .filter(Producer.status == "approved")
        )

    if verified is not None:
        q = q.filter(Producer.is_verified == verified)

    if category is not None:
        q = q.join(ProducerCategory).filter(ProducerCategory.category_id == category)

    if delivery_city:
        q = q.join(DeliveryArea).filter(func.lower(DeliveryArea.city) == delivery_city.lower())
    elif has_delivery:
        q = q.filter(Producer.delivery_areas.any())

    if geo_search:
        # A multi-entity query combined with joinedload on a collection
        # relationship (categories) can emit duplicate rows — the legacy
        # Query identity-map dedupe only applies to single-entity queries.
        # De-dupe by producer id while preserving the distance-ASC order.
        seen: set = set()
        results = []
        for producer, distance_km in q.all():
            if producer.id in seen:
                continue
            seen.add(producer.id)
            # Attach computed distance so Pydantic's from_attributes picks
            # it up in ProducerListOut.
            producer.distance_km = round(float(distance_km), 2)
            results.append(producer)
        return results

    return q.all()


@router.get("/producers/by-slug/{slug}", response_model=ProducerDetailOut)
def get_producer_by_slug(slug: str, db: Session = Depends(get_db)):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.slug == slug, Producer.status == "approved")
        .first()
    )
    if not producer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Producer not found")
    report_count = db.query(func.count(Report.id)).filter(Report.producer_id == producer.id).scalar() or 0
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    return result


@router.get("/producers/{producer_id}", response_model=ProducerDetailOut)
def get_producer(producer_id: UUID, db: Session = Depends(get_db)):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == producer_id)
        .first()
    )
    if not producer:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Producer not found")

    # Compute report_count from DB
    report_count = db.query(func.count(Report.id)).filter(Report.producer_id == producer_id).scalar() or 0
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    return result


@router.post("/producers", response_model=ProducerDetailOut, status_code=201)
def create_producer(
    data: ProducerCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a pending producer row.

    SECURITY: this endpoint was historically public, which meant anyone
    could create pending producers with no audit trail. It's now
    authenticated — any logged-in user can create, but anonymous callers
    get 401. The public "become a producer" signup flow lives at
    POST /auth/register/producer (see routers/auth.py) and is unaffected.
    """
    from app.models import DeliveryArea as DA

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
        db.add(DA(
            producer_id=producer.id,
            city=da.city,
            min_order=da.min_order,
            delivery_day=da.delivery_day,
        ))

    db.commit()
    db.refresh(producer)
    return producer


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.id).all()


# ============================================================
# docs/archive/FEEDBACK_FIXES.md — follow / unfollow producer
# ============================================================


@router.post("/producers/{producer_id}/follow")
def follow_producer(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Follow a producer. Idempotent — returns the existing follow if
    the user already follows this producer."""
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")

    existing = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
    )
    if existing:
        return {"detail": "Already following", "following": True}

    follow = ProducerFollower(user_id=user.id, producer_id=producer_id)
    db.add(follow)
    db.commit()
    return {"detail": "Now following", "following": True}


@router.delete("/producers/{producer_id}/follow")
def unfollow_producer(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unfollow a producer. No-op if the user doesn't currently follow."""
    follow = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
    )
    if follow:
        db.delete(follow)
        db.commit()
    return {"detail": "Unfollowed", "following": False}


@router.get("/producers/{producer_id}/follow-status")
def follow_status(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Is the current user following this producer? Used by the follow
    button on the producer page to initialize its state."""
    exists = (
        db.query(ProducerFollower)
        .filter(
            ProducerFollower.user_id == user.id,
            ProducerFollower.producer_id == producer_id,
        )
        .first()
        is not None
    )
    return {"following": exists}


@router.get("/users/me/following")
def list_my_following(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List the producers the current user is following, with basic
    producer info joined in."""
    follows = (
        db.query(ProducerFollower)
        .options(joinedload(ProducerFollower.producer))
        .filter(ProducerFollower.user_id == user.id)
        .order_by(ProducerFollower.created_at.desc())
        .all()
    )
    return [
        {
            "producer_id": str(f.producer_id),
            "producer_name": f.producer.name if f.producer else None,
            "producer_city": f.producer.city if f.producer else None,
            "producer_slug": f.producer.slug if f.producer else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in follows
    ]
