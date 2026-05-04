"""
Follow / unfollow / follow-status / my-following endpoints.

Lifted from backend/app/routers/producers.py during the MEH-438 refactor.
This sub-router is composed into the parent producers router via
`router.include_router(...)` from inside producers.py — no
router_registry.py change needed (FastAPI mounts the sub-router
transitively when the parent is registered).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Producer, ProducerFollower, User

router = APIRouter(tags=["producers"])


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
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

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
