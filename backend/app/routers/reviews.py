"""Producer reviews (1-5 stars + optional body, 10-500 chars).

MEH-103 verified reviews system:
  - Contact gate: only users who have clicked this specific producer's
    primary CTA may submit a first review. MEH-2204 widened it from
    WhatsApp-only to ANY channel, so it is enforced via
    producer_whatsapp_clicks.user_id OR producer_contact_clicks.user_id.
  - Owner guard: producer owners cannot review their own business.
  - Haiku AI moderation on body text (fail-open — no API key → APPROVED).
  - Admin hide endpoint: PUT /admin/reviews/{id}/hide sets is_hidden=True.
  - Hidden reviews are excluded from public GET endpoints and aggregates.
  - Pagination: GET /producers/{id}/reviews returns 10 per page.

MEH-458: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

import json
import logging
import math
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, aliased, joinedload

from app.auth import get_current_user, require_admin
from app.database import get_db
from app.models import (
    ContactClick,
    Producer,
    ProducerCategory,
    ProducerReview,
    ProducerWhatsAppClick,
    User,
)
from app.rate_limit import limiter
from app.schemas.schemas import (
    AdminReviewOut,
    ReviewCreateNested,
    ReviewOut,
    ReviewReplyUpdate,
    ReviewsPage,
)

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
        raw = next(
            (b.text for b in msg.content if getattr(b, "type", None) == "text"), ""
        ).strip()
        data = json.loads(raw)
        status = data.get("status", "APPROVED")
        return status if status in {"APPROVED", "FLAGGED", "REJECTED"} else "APPROVED"
    except Exception as exc:
        log.warning("[reviews] moderation call failed: %s — fail-open", exc)
        return "APPROVED"


PAGE_SIZE = 10


def _recompute_producer_rating(producer_id: UUID, db: Session) -> None:
    """Recompute avg_rating + reviews_count from all visible (non-hidden) reviews."""
    row = (
        db.query(
            func.avg(ProducerReview.stars).label("avg"),
            func.count(ProducerReview.id).label("cnt"),
        )
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.is_hidden.is_(False),
        )
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
        body=review.body,
        created_at=review.created_at.isoformat() if review.created_at else "",
        # MEH-1039: business-owner reply surfaced in the public GET payload.
        reply=review.reply,
        reply_at=review.reply_at.isoformat() if review.reply_at else None,
    )


# ---------------------------------------------------------------------------
# Public GET
# ---------------------------------------------------------------------------


@router.get("/producers/{producer_id}/reviews", response_model=ReviewsPage)
@limiter.limit("60/minute")
def list_reviews_nested(
    request: Request,
    producer_id: UUID,
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
):
    """Paginated visible reviews for a producer (10 per page, newest first)."""
    base = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.is_hidden.is_(False),
        )
    )
    total = base.count()
    rows = (
        base.order_by(ProducerReview.created_at.desc())
        .offset((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .all()
    )
    return ReviewsPage(
        reviews=[_serialize(r) for r in rows],
        total=total,
        page=page,
        pages=max(1, math.ceil(total / PAGE_SIZE)),
    )


# Legacy flat route — kept for backwards compat with any existing clients.
@router.get("/reviews", response_model=list[ReviewOut])
@limiter.limit("60/minute")
def list_reviews(
    request: Request,
    producer_id: UUID,
    db: Session = Depends(get_db),
):
    reviews = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.is_hidden.is_(False),
        )
        .order_by(ProducerReview.created_at.desc())
        .all()
    )
    return [_serialize(r) for r in reviews]


# ---------------------------------------------------------------------------
# POST — create or update a review (upsert, one per user per producer)
# ---------------------------------------------------------------------------


def _shares_category(db: Session, owner_producer_id: UUID, producer_id: UUID) -> bool:
    """MEH-2076: True when the two producers' category sets intersect.

    One EXISTS-shaped query over the M2M table (self-join on category_id),
    so a shared SECONDARY category counts — the check is intersection, not
    primary-only.
    """
    mine = aliased(ProducerCategory)
    theirs = aliased(ProducerCategory)
    return (
        db.query(mine.category_id)
        .join(theirs, theirs.category_id == mine.category_id)
        .filter(
            mine.producer_id == owner_producer_id,
            theirs.producer_id == producer_id,
        )
        .first()
        is not None
    )


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

    Guards (checked in order):
      1. Producer must exist.
      2. Producer owner cannot review their own business.
      2b. Producer owner cannot review a business sharing a category with
          hers (MEH-2076 — conflict of interest; cross-category stays open).
      3. First-time reviewers must have a click on ANY of this producer's
         contact channels — a WhatsApp click OR a contact click (MEH-2204).
      4. Body is moderated by Haiku (fail-open).
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # Guard: owner cannot review themselves
    if user.producer_id is not None and str(user.producer_id) == str(producer_id):
        raise HTTPException(
            status_code=403,
            detail="בעלת עסק לא יכולה לדרג את עצמה",
        )

    # Guard 2b (MEH-2076): a business owner cannot review a DIRECT competitor —
    # any business whose category set intersects hers. Policy (Sapir 14/08):
    # same-category only; cross-category reviews stay allowed, because the
    # bakery owner really does buy the cheese ("magazine, not marketplace").
    # Sits BEFORE the contact gate on purpose: it must hold no matter how the
    # reviewer got past that gate — a click today, a signed invite link once
    # MEH-1428 lands — so it cannot be attached to either of those paths.
    if user.producer_id is not None and _shares_category(
        db, user.producer_id, producer_id
    ):
        raise HTTPException(
            status_code=403,
            detail="כבעלת עסק מאותה קטגוריה לא ניתן להשאיר ביקורת — כך אנחנו שומרות על הוגנות.",
        )

    existing_review = (
        db.query(ProducerReview)
        .filter(
            ProducerReview.producer_id == producer_id,
            ProducerReview.user_id == user.id,
        )
        .first()
    )

    # Guard: a first-time review requires prior contact with the business —
    # through ANY channel, not only WhatsApp.
    #
    # MEH-2204: this used to read producer_whatsapp_clicks alone. Once the
    # question chips and CTAs started following the declared primary channel,
    # a phone/email/website/instagram/facebook/external_order-primary business
    # renders zero wa.me links — so its customers could not satisfy this gate
    # by any action the page offered them. The 403 told them to press a button
    # that is not on the page, and first reviews were structurally impossible
    # for every non-WhatsApp business. The trust model is unchanged: a click on
    # the business's own primary CTA is the proof of contact, and which channel
    # that CTA opens is the owner's choice, not the reviewer's.
    #
    # Two short-circuiting EXISTS rather than one OR/UNION across the tables:
    # they are unrelated tables with no join key beyond the pair being matched,
    # and Python's `or` means a WhatsApp click never issues the second query.
    # That keeps the pre-existing WhatsApp path identical in both result and
    # query count — the regression criterion this ticket is held to.
    # Both columns are indexed (models.py: producer_id and user_id on each).
    if not existing_review:
        clicked = (
            db.query(ProducerWhatsAppClick.id)
            .filter(
                ProducerWhatsAppClick.producer_id == producer_id,
                ProducerWhatsAppClick.user_id == user.id,
            )
            .first()
        ) or (
            db.query(ContactClick.id)
            .filter(
                ContactClick.producer_id == producer_id,
                ContactClick.user_id == user.id,
            )
            .first()
        )
        if not clicked:
            raise HTTPException(
                status_code=403,
                detail="יש ליצור קשר עם בית העסק לפני כתיבת ביקורת",
            )

    # Haiku moderation (fail-open)
    if data.body:
        verdict = _moderate_review_body(data.body)
        if verdict == "REJECTED":
            raise HTTPException(
                status_code=422,
                detail="תוכן הביקורת אינו עומד בהנחיות הקהילה שלנו",
            )

    if existing_review:
        existing_review.stars = data.stars
        existing_review.body = data.body
        # Unhide on edit (user is updating a previously hidden review)
        existing_review.is_hidden = False
        db.commit()
        review = existing_review
    else:
        review = ProducerReview(
            producer_id=producer_id,
            user_id=user.id,
            stars=data.stars,
            body=data.body,
        )
        db.add(review)
        try:
            db.commit()
            db.refresh(review)
        except IntegrityError:
            db.rollback()
            review = (
                db.query(ProducerReview)
                .filter(
                    ProducerReview.producer_id == producer_id,
                    ProducerReview.user_id == user.id,
                )
                .first()
            )
            review.stars = data.stars
            review.body = data.body
            db.commit()

    _recompute_producer_rating(producer_id, db)
    review = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(ProducerReview.id == review.id)
        .first()
    )
    return _serialize(review)


# ---------------------------------------------------------------------------
# DELETE — owner or admin
# ---------------------------------------------------------------------------


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
    # MEH-1001: a stranger (non-owner, non-admin) gets 404 (not 403) so the
    # review's existence isn't leaked. Admin-override preserved above.
    if not (is_owner or is_admin):
        raise HTTPException(status_code=404, detail="ביקורת לא נמצאה")
    producer_id = review.producer_id
    db.delete(review)
    db.commit()
    _recompute_producer_rating(producer_id, db)
    return {"detail": "Review deleted"}


# ---------------------------------------------------------------------------
# PUT reply — business-owner only (MEH-1039)
# ---------------------------------------------------------------------------


@router.put("/reviews/{review_id}/reply", response_model=ReviewOut)
def set_review_reply(
    review_id: UUID,
    data: ReviewReplyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Set/edit the business-owner's reply to a review. Owner-only — only the
    reviewed producer's owner (review.producer_id == user.producer_id) may
    reply; anyone else gets 404 so the review's existence isn't leaked
    (MEH-1001 convention). NO admin override — a reply is the business's own
    voice. An empty/blank reply clears it.
    """
    review = db.query(ProducerReview).filter(ProducerReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="ביקורת לא נמצאה")
    # Owner = the producer the review is about. NO admin override (MEH-1039).
    if user.producer_id is None or str(review.producer_id) != str(user.producer_id):
        raise HTTPException(status_code=404, detail="ביקורת לא נמצאה")

    if data.reply:
        review.reply = data.reply
        review.reply_at = datetime.utcnow()
    else:
        review.reply = None  # empty/blank → clear
        review.reply_at = None
    db.commit()

    review = (
        db.query(ProducerReview)
        .options(joinedload(ProducerReview.user))
        .filter(ProducerReview.id == review.id)
        .first()
    )
    return _serialize(review)


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------


@router.put("/admin/reviews/{review_id}/hide")
def hide_review(
    review_id: UUID,
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Set is_hidden=True on a review. Recomputes producer aggregates."""
    review = db.query(ProducerReview).filter(ProducerReview.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="ביקורת לא נמצאה")
    review.is_hidden = True
    db.commit()
    _recompute_producer_rating(review.producer_id, db)
    return {"detail": "Review hidden", "id": str(review_id)}


@router.get("/admin/reviews", response_model=list[AdminReviewOut])
def admin_list_reviews(
    _: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """All reviews (including hidden) for moderation."""
    rows = (
        db.query(ProducerReview)
        .options(
            joinedload(ProducerReview.user),
            joinedload(ProducerReview.producer),
        )
        .order_by(ProducerReview.created_at.desc())
        .all()
    )
    return [
        AdminReviewOut(
            id=r.id,
            producer_id=r.producer_id,
            producer_name=r.producer.name if r.producer else None,
            user_id=r.user_id,
            user_name=r.user.name if r.user else None,
            user_email=r.user.email if r.user else None,
            stars=r.stars,
            body=r.body,
            is_hidden=r.is_hidden,
            created_at=r.created_at.isoformat() if r.created_at else "",
        )
        for r in rows
    ]
