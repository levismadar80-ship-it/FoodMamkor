from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, Producer, User
from app.schemas.schemas import FavoriteOut

router = APIRouter(prefix="/users/me/favorites", tags=["favorites"])


@router.get("", response_model=list[FavoriteOut])
def get_favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(Favorite)
        .options(joinedload(Favorite.producer).joinedload(Producer.categories))
        .filter(Favorite.user_id == user.id)
        .all()
    )


@router.post("/{producer_id}", status_code=201)
def add_favorite(producer_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = db.query(Favorite).filter(
        Favorite.user_id == user.id, Favorite.producer_id == producer_id
    ).first()
    if existing:
        return {"detail": "Already in favorites"}

    db.add(Favorite(user_id=user.id, producer_id=producer_id))
    db.commit()
    return {"detail": "Added to favorites"}


@router.delete("/{producer_id}")
def remove_favorite(producer_id: UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    fav = db.query(Favorite).filter(
        Favorite.user_id == user.id, Favorite.producer_id == producer_id
    ).first()
    if not fav:
        raise HTTPException(status_code=404, detail="Not in favorites")
    db.delete(fav)
    db.commit()
    return {"detail": "Removed from favorites"}
