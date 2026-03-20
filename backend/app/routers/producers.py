from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, DeliveryArea, Producer, ProducerCategory
from app.schemas.schemas import (
    CategoryOut,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
)

router = APIRouter(tags=["producers"])


@router.get("/producers", response_model=list[ProducerListOut])
def list_producers(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    category: int | None = None,
    delivery_city: str | None = None,
    verified: bool | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(Producer).options(joinedload(Producer.categories)).filter(Producer.status == "approved")

    if verified is not None:
        q = q.filter(Producer.is_verified == verified)

    if category is not None:
        q = q.join(ProducerCategory).filter(ProducerCategory.category_id == category)

    if delivery_city:
        q = q.join(DeliveryArea).filter(func.lower(DeliveryArea.city) == delivery_city.lower())

    if lat is not None and lng is not None and radius_km is not None:
        # Simple distance filter using Haversine approximation
        # 1 degree lat ≈ 111km
        lat_range = radius_km / 111.0
        lng_range = radius_km / (111.0 * func.cos(func.radians(lat)))
        q = q.filter(
            Producer.lat.between(lat - lat_range, lat + lat_range),
            Producer.lng.between(lng - lng_range, lng + lng_range),
        )

    return q.all()


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
    return producer


@router.post("/producers", response_model=ProducerDetailOut, status_code=201)
def create_producer(data: ProducerCreate, db: Session = Depends(get_db)):
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
