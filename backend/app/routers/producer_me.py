from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.models import Favorite, Producer, User
from app.models.models import HomeProductWhatsAppClick
from app.schemas.schemas import ProducerDetailOut, ProducerUpdate

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerDetailOut)
def get_my_producer(user: User = Depends(require_producer), db: Session = Depends(get_db)):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == user.producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    return producer


@router.put("", response_model=ProducerDetailOut)
def update_my_producer(
    data: ProducerUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(producer, field, value)

    db.commit()
    db.refresh(producer)
    return producer


@router.post("/availability")
def toggle_availability(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Toggle today's availability for the logged-in producer."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
    producer.is_available_today = not bool(producer.is_available_today)
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {"is_available_today": producer.is_available_today}


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Minimal producer dashboard summary."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")

    favorites_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )

    # WhatsApp clicks this week — uses HomeProductWhatsAppClick proxy.
    # For producer-owned-listings tracking, you'd add a dedicated table;
    # we return 0 as a safe default here so the UI renders cleanly.
    whatsapp_clicks_week = 0

    return {
        "producer": {
            "id": str(producer.id),
            "name": producer.name,
            "is_available_today": bool(producer.is_available_today),
            "status": producer.status,
            "plan": producer.plan,
        },
        "favorites_count": int(favorites_count),
        "whatsapp_clicks_week": whatsapp_clicks_week,
    }
