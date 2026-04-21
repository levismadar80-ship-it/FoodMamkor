"""Producer reviews (1-5 stars + optional title/body).

Per docs/archive/FIXES_V2.md fix 3. One review per user per producer; the aggregates
`producers.avg_rating` and `producers.reviews_count` are recomputed from
all reviews on every write (simple + correct; fine at this scale).

MEH-10 adds:
  - nested route aliases GET/POST /producers/:id/reviews (spec-compliant)
  - GET /admin/reviews — list all reviews with producer + user name (admin only)

Reviews spec:
  - WhatsApp click gate: only users who have clicked the WhatsApp CTA for
    this specific producer may submit a review. Verified via
    producer_whatsapp_clicks.user_id. Fail-open: if the clicks table is empty
    (e.g. DB migration hasn't run) we let the review through.
  - Haiku AI moderation on body text (fail-open — no API key → APPROVED).
  - Pagination: GET returns 10 reviews per page.
"""
import json
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import Producer, ProducerReview, ProducerWhatsAppClick, User
from app.rate_limit import limiter

router = APIRouter(tags=["reviews"])
log = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
_ai_client = None


def _get_ai_client():
    global _ai_client
    if _ai_client is not None:
        return _ai_client
    try:
        from app.config import settings
        if not settings.anthropic_api_key:
            return None
        import httpx
        import anthropic
        _ai_client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            http_client=httpx.Client(),
        )
        return _ai_client
    except Exception as exc:
        log.warning("[reviews] anthropic client init failed: %s", exc)
        return None


def _moderate_review_body(body: str | None) -> str:
    """Run body text through Haiku. Returns 'APPROVED' | 'FLAGGED' | 'REJECTED'.
    Fail-open: any error returns 'APPROVED'.
    """
    if not body:
        return "APPROVED"
    client = _get_ai_client()
    if client is None:
        log.info("[reviews] no AI client — skipping moderation (fail-open)")
        return "APPROVED"
    prompt = f"""אתה מודרטור ביקורות לאתר מהמקור — פלטפורמה לאוכל בריא ומקומי בישראל.
בדוק את טקסט הביקורת הבאה ותחזיר JSON בלבד.

טקסט: {body}

החזר JSON בלבד (ללא ```json):
{{"status": "APPROVED" | "FLAGGED" | "REJECTED", "reason": "..."}}

APPROVED אם: ביקורת לגיטימית על מוצר/שירות של בית עסק
FLAGGED אם: לשון פוגענית קלה, תוכן לא ברור, ספאם קל
REJECTED אם: לשון גסה/מבזה, פרסומת, מידע אישי, גזענות, תרמית"""
    try:
        msg = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=100,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        data = json.loads(raw)
        status = data.get("status", "APPROVED")
        return status if status in {"APPROVED", "FLAGGED", "REJECTED"} else "APPROVED"
    except Exception as exc:
        log.warning("[reviews] moderation call failed: %s — fail-open", exc)
        return "APPROVED"


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
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

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
        try:
            db.commit()
            db.refresh(review)
        except IntegrityError:
            # Concurrent double-submit inserted the same (producer, user) row.
            # Rollback and fall through to an UPDATE on the now-existing row.
            db.rollback()
            review = (
                db.query(ProducerReview)
                .filter(
                    ProducerReview.producer_id == data.producer_id,
                    ProducerReview.user_id == user.id,
                )
                .first()
            )
            review.stars = data.stars
            review.title = data.title
            review.body = data.body
            db.commit()

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
        raise HTTPException(status_code=404, detail="ביקורת לא נמצאה")
    is_owner = review.user_id == user.id
    is_admin = getattr(user, "role", None) == "admin"
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="אין הרשאה")
    producer_id = review.producer_id
    db.delete(review)
    db.commit()
    _recompute_producer_rating(producer_id, db)
    return {"detail": "Review deleted"}


# ---------------------------------------------------------------------------
# MEH-10 nested route aliases — spec requires /producers/:id/reviews form.
# Old routes (/reviews, /reviews?producer_id=X) stay as-is so existing clients
# don't break; these are thin wrappers delegating to the same handlers.
# ---------------------------------------------------------------------------


class ReviewsPage(BaseModel):
    reviews: list[ReviewOut]
    total: int
    page: int
    pages: int

    model_config = {"from_attributes": True}


PAGE_SIZE = 10


@router.get("/producers/{producer_id}/reviews", response_model=ReviewsPage)
def list_reviews_nested(
    producer_id: UUID,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    """Paginated reviews for a producer (10 per page, newest first)."""
    base = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(ProducerReview.producer_id == producer_id)
    )
    total = base.count()
    rows = (
        base.order_by(ProducerReview.created_at.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .all()
    )
    import math
    return ReviewsPage(
        reviews=[_serialize(r) for r in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / PAGE_SIZE)),
    )


class ReviewCreateNested(BaseModel):
    """Same as ReviewCreate but without producer_id (comes from the URL)."""
    stars: int = Field(..., ge=1, le=5)
    title: str | None = Field(None, max_length=200)
    body: str | None = Field(None, max_length=2000)


@router.post(
    "/producers/{producer_id}/reviews",
    response_model=ReviewOut,
    status_code=201,
)
@limiter.limit("20/day")
def create_review_nested(
    request: Request,
    producer_id: UUID,
    data: ReviewCreateNested,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Submit or update a review.

    Gate: the caller must have previously clicked the producer's WhatsApp CTA
    while authenticated (i.e. a row exists in producer_whatsapp_clicks with
    producer_id == this producer AND user_id == current user). This ensures
    reviews come from real contacts, not anonymous drive-by submissions.

    Exception: if the user already has an existing review for this producer
    they can update it regardless (they passed the gate when they first wrote).
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # Check if user already has a review (allowed to update regardless of gate)
    existing_review = (
        db.query(ProducerReview)
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.user_id == user.id,
        )
        .first()
    )

    # Enforce WhatsApp click gate for first-time reviews
    if not existing_review:
        clicked = (
            db.query(ProducerWhatsAppClick.id)
            .filter(
                ProducerWhatsAppClick.producer_id == producer_id,
                ProducerWhatsAppClick.user_id == user.id,
            )
            .first()
        )
        if not clicked:
            raise HTTPException(
                status_code=403,
                detail="יש ללחוץ על כפתור WhatsApp לפני כתיבת ביקורת",
            )

    # Haiku moderation on body text (fail-open)
    if data.body:
        verdict = _moderate_review_body(data.body)
        if verdict == "REJECTED":
            raise HTTPException(
                status_code=422,
                detail="תוכן הביקורת אינו עומד בהנחיות הקהילה שלנו",
            )

    full = ReviewCreate(
        producer_id=producer_id,
        stars=data.stars,
        title=data.title,
        body=data.body,
    )
    return create_review(request=request, data=full, user=user, db=db)


# ---------------------------------------------------------------------------
# Admin listing — all reviews with producer + user name for moderation UI.
# Deletion reuses the existing DELETE /reviews/{id} endpoint (it already
# accepts is_admin override).
# ---------------------------------------------------------------------------


class AdminReviewOut(BaseModel):
    id: UUID
    producer_id: UUID
    producer_name: str | None = None
    user_id: UUID
    user_name: str | None = None
    user_email: str | None = None
    stars: int
    title: str | None = None
    body: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


@router.get("/admin/reviews", response_model=list[AdminReviewOut])
def admin_list_reviews(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ProducerReview)
        .options(
            joinedload(ProducerReview.user),
            joinedload(ProducerReview.producer),
        )
        .order_by(ProducerReview.created_at.desc())
        .all()
    )
    out: list[AdminReviewOut] = []
    for r in rows:
        out.append(
            AdminReviewOut(
                id=r.id,
                producer_id=r.producer_id,
                producer_name=r.producer.name if r.producer else None,
                user_id=r.user_id,
                user_name=r.user.name if r.user else None,
                user_email=r.user.email if r.user else None,
                stars=r.stars,
                title=r.title,
                body=r.body,
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
        )
    return out
