from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, Producer, User
from app.schemas.schemas import FavoriteOut
from app.services.producer_queries import attach_badge_fields, attach_favorites_counts

router = APIRouter(prefix="/users/me/favorites", tags=["favorites"])


@router.get("", response_model=list[FavoriteOut])
def get_favorites(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    # MEH-248 — inner-join against producers so any orphaned favorite
    # (producer row gone but FK cascade didn't fire on a pre-ondelete
    # migration, or a historical hard-delete that bypassed the cascade)
    # is silently dropped from the response instead of 500'ing when
    # FavoriteOut tries to serialize a null producer.
    favorites = (
        db.query(Favorite)
        .join(Producer, Favorite.producer_id == Producer.id)
        .options(
            joinedload(Favorite.producer).joinedload(Producer.categories),
            # MEH-1660: products + delivery_areas must be eager-loaded so the
            # enrichment loop below stays N+1-free (mirrors the list query in
            # producer_listing.py:126-127).
            joinedload(Favorite.producer).selectinload(Producer.products),
            joinedload(Favorite.producer).selectinload(Producer.delivery_areas),
        )
        .filter(Favorite.user_id == user.id)
        .all()
    )
    # MEH-1660: ProducerListOut serialises computed badge fields
    # (days_since_created, has_producer_license, has_*_products,
    # delivery_count, favorites_count). Without this enrichment the nested
    # producer payload silently drops every badge on /favorites cards.
    # REUSES: backend/app/services/producer_listing.py:476-479
    producers = [f.producer for f in favorites]
    for producer in producers:
        attach_badge_fields(producer)
    attach_favorites_counts(producers, db)
    return favorites


@router.post("/{producer_id}", status_code=201)
def add_favorite(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = (
        db.query(Favorite)
        .filter(Favorite.user_id == user.id, Favorite.producer_id == producer_id)
        .first()
    )
    if existing:
        return {"detail": "Already in favorites"}

    try:
        db.add(Favorite(user_id=user.id, producer_id=producer_id))
        db.commit()
    except IntegrityError:
        # Concurrent request already inserted the same row — idempotent.
        db.rollback()
    return {"detail": "Added to favorites"}


@router.delete("/{producer_id}")
def remove_favorite(
    producer_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    fav = (
        db.query(Favorite)
        .filter(Favorite.user_id == user.id, Favorite.producer_id == producer_id)
        .first()
    )
    if not fav:
        raise HTTPException(status_code=404, detail="Not in favorites")
    db.delete(fav)
    db.commit()
    return {"detail": "Removed from favorites"}
