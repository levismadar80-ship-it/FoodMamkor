# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3480 PR)
"""
Module:   review_reply_suggest
Purpose:  «הצעת תשובה» (MEH-3480): Claude drafts a short reply from the
          business to one review; the owner edits it in the reply box and
          only her own «שמירה» sends it.
Touches:  reads producer_reviews (one row); the Anthropic API
          (services/reply_writer.py). No DB writes.
Does NOT: save, send or moderate the reply — PUT /reviews/{id}/reply
          (routers/reviews.py) does all three when she saves.
Related:  routers/reviews.py set_review_reply (same owner rule, same 404);
          routers/product_describe.py (same limits shape).
History:  MEH-3480 (creation)
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ProducerReview, User
from app.rate_limit import limiter
from app.routers.product_describe import (  # REUSES: per-business daily key
    DAILY_CAP,
    _business_key,
)
from app.schemas.review_reply_suggest import ReviewReplySuggestOut
from app.services import reply_writer

router = APIRouter(tags=["reviews"])

UNAVAILABLE_DETAIL = "לא הצלחנו להציע תשובה הפעם. אפשר לכתוב אותה ידנית."
NOT_FOUND_DETAIL = "ביקורת לא נמצאה"


def _mark_business(request: Request, user: User = Depends(get_current_user)) -> User:
    # Read by _business_key: the daily cap counts per business, not per IP.
    request.state.ai_key = f"reply:{user.producer_id or user.id}"
    return user


@router.post("/reviews/{review_id}/reply/suggest", response_model=ReviewReplySuggestOut)
@limiter.limit("10/hour")
@limiter.limit(DAILY_CAP, key_func=_business_key)
def suggest_review_reply(
    request: Request,
    review_id: UUID,
    user: User = Depends(_mark_business),
    db: Session = Depends(get_db),
) -> ReviewReplySuggestOut:
    """Owner of the reviewed business only; anyone else gets the same 404 as
    the reply route (MEH-1001), and there is no admin override (MEH-1039) —
    a reply is the business's own voice."""
    review = db.query(ProducerReview).filter(ProducerReview.id == review_id).first()
    if (
        review is None
        or user.producer_id is None
        or str(review.producer_id) != str(user.producer_id)
    ):
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    stars, body = int(review.stars), review.body
    # Release the connection before the model call (a few seconds).
    db.rollback()
    text = reply_writer.draft(stars, body)  # type: ignore[arg-type]
    if text is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_DETAIL)
    return ReviewReplySuggestOut(reply=text)
