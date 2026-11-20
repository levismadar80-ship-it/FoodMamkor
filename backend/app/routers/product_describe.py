# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3479 PR)
"""
Module:   product_describe
Purpose:  «הצעת תיאור» (MEH-3479): Claude suggests a short description for one
          product; the owner (or the admin, in her place) edits it in the
          form and only the product save stores it.
Touches:  The Anthropic API (services/description_writer.py). No DB writes.
Does NOT: save the text (routers/producer_me.py product POST/PUT, which also
          moderate it like a typed one), or read the product row — the form
          sends what is on screen, including an unsaved new product.
Related:  app/schemas/product_describe.py · app/rate_limit.py
History:  MEH-3479 (creation)
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin, require_producer
from app.database import get_db
from app.models import Producer, User
from app.rate_limit import get_real_client_ip, limiter
from app.schemas.product_describe import ProductDescribeIn, ProductDescribeOut
from app.services import description_writer

router = APIRouter(tags=["producer-management"])

UNAVAILABLE_DETAIL = "לא הצלחנו להציע תיאור הפעם. אפשר לכתוב אותו ידנית."

# Per-business daily cap: the key is the business, so a second device or a
# second IP does not reset it. Set by the dependency below, which FastAPI
# resolves before slowapi's wrapper reads the key.
DAILY_CAP = "30/day"


def _business_key(request: Request) -> str:
    key = getattr(request.state, "ai_key", None)
    return key or get_real_client_ip(request)


def _mark_owner(request: Request, user: User = Depends(require_producer)) -> User:
    # producer_id is set for every owner require_producer admits; the user id
    # is the fallback so a missing link can never share one bucket.
    request.state.ai_key = f"describe:{user.producer_id or user.id}"
    return user


def _answer(body: ProductDescribeIn) -> ProductDescribeOut:
    text = description_writer.suggest(*description_writer.describe_inputs(body))
    if text is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_DETAIL)
    return ProductDescribeOut(description=text)


@router.post(
    "/producers/me/product-description/suggest", response_model=ProductDescribeOut
)
@limiter.limit("10/hour")
@limiter.limit(DAILY_CAP, key_func=_business_key)
def suggest_my_product_description(
    request: Request,
    body: ProductDescribeIn,
    user: User = Depends(_mark_owner),
) -> ProductDescribeOut:
    return _answer(body)


@router.post(
    "/admin/producers/{producer_id}/product-description/suggest",
    response_model=ProductDescribeOut,
)
# Admin: the hourly per-IP limit only, no daily business cap — the admin is
# filling many businesses' drafts in one sitting (DraftProductsPanel), and the
# route is behind require_admin.
@limiter.limit("60/hour")
def admin_suggest_product_description(
    request: Request,
    producer_id: UUID,
    body: ProductDescribeIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductDescribeOut:
    if not db.query(Producer.id).filter(Producer.id == producer_id).first():
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return _answer(body)
