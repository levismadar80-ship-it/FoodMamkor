from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.models import Producer, User
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
