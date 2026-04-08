"""Producer reviews (1-5 stars + optional title/body).

Per FIXES_V2.md fix 3. One review per user per producer; the aggregates
`producers.avg_rating` and `producers.reviews_count` are recomputed from
all reviews on every write (simple + correct; fine at this scale).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import Producer, ProducerReview, User
from app.rate_limit import limiter

router = APIRouter(tags=["reviews"])


class ReviewCreate(BaseModel):
    producer_id: UUID
    stars: int = Field(..., ge=1, le=5)
    title: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=2000)


class ReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    user_id: UUID
    user_name: str | None = None
    stars: int
    title: str | None = None
    body: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


def _recompute_producer_rating(producer_id: UUID, db: Session) -> None:
    row = (
        db.query(
            func.avg(ProducerReview.stars).label("avg"),
            func.count(ProducerReview.id).label("cnt"),
        )
        .filter(ProducerReview.producer_id == producer_id)
        .one()
    )
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer:
        producer.avg_rating = float(row.avg) if row.avg is not None else 0.0
        producer.reviews_count = int(row.cnt or 0)
        db.commit()


def _serialize(review: ProducerReview) -> ReviewOut:
    return ReviewOut(
        id=review.id,
        producer_id=review.producer_id,
        user_id=review.user_id,
        user_name=review.user.name if review.user else None,
        stars=review.stars,
        title=review.title,
        body=review.body,
        created_at=review.created_at.isoformat() if review.created_at else "",
    )


@router.get("/reviews", response_model=list[ReviewOut])
def list_reviews(
    producer_id: UUID,
    db: Session = Depends(get_db),
):
    reviews = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(ProducerReview.producer_id == producer_id)
        .order_by(ProducerReview.created_at.desc())
        .all()
    )
    return [_serialize(r) for r in reviews]


@router.post("/reviews", response_model=ReviewOut, status_code=201)
@limiter.limit("20/day")  # SECURITY FIX #2: cap review spam
def create_review(
    request: Request,
    data: ReviewCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Make sure the producer exists
    producer = db.query(Producer).filter(Producer.id == data.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")

    # Enforce one-review-per-user-per-producer; if exists, update it (upsert)
    existing = (
        db.query(ProducerReview)
        .filter(
            ProducerReview.producer_id == data.producer_id,
            ProducerReview.user_id == user.id,
        )
        .first()
    )
    if existing:
        existing.stars = data.stars
        existing.title = data.title
        existing.body = data.body
        db.commit()
        review = existing
    else:
        review = ProducerReview(
            producer_id=data.producer_id,
            user_id=user.id,
            stars=data.stars,
            title=data.title,
            body=data.body,
        )
        db.add(review)
        db.commit()
        db.refresh(review)

    _recompute_producer_rating(data.producer_id, db)
    # Reload with user relation for serialization
    review = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(ProducerReview.id == review.id)
        .first()
    )
    return _serialize(review)


@router.delete("/reviews/{review_id}")
def delete_review(
    review_id: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    review = db.query(ProducerReview).filter(ProducerReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    is_owner = review.user_id == user.id
    is_admin = getattr(user, "role", None) == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")
    producer_id = review.producer_id
    db.delete(review)
    db.commit()
    _recompute_producer_rating(producer_id, db)
    return {"detail": "Review deleted"}
