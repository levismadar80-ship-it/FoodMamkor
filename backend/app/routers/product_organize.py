"""
Module:   product_organize
Purpose:  The owner sets the order of her products and sorts them into
          groups (MEH-3055) — the two things the public page then shows as
          "her order" and as group chips.
Touches:  DB products.position / products.group_id, producers.product_groups.
Does NOT: create, edit or delete products (routers/producer_me.py), or render
          anything — ordering for display is lib/product-display-order.js.
Related:  app/schemas/product_organize.py · app/limits.py MAX_PRODUCT_GROUPS ·
          alembic b7d4e2a9c615
History:  MEH-3055 (creation); MEH-3472 (logic moved to
          services/product_organize.py, shared with the admin routes)
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.routers.product_describe import (  # REUSES: per-business daily key
    _business_key,
)
from app.schemas.product_organize import (
    GroupMovesIn,
    GroupSuggestionsOut,
    ProductGroupAssignIn,
    ProductGroupsIn,
    ProductOrderIn,
)
from app.schemas.schemas import ProductGroupOut, ProductOut
from app.services import product_organize as svc

router = APIRouter(prefix="/producers/me", tags=["producer-management"])

# DO NOT put these under /products/order — producer_me.py owns
# /producers/me/products/{product_id} (UUID-typed) and is registered first,
# so "order" would 422 there before reaching this router.


def _my_producer(user: User, db: Session) -> Producer:
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


@router.get("/product-groups", response_model=list[ProductGroupOut])
def list_my_product_groups(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return svc.groups_of(_my_producer(user, db))


@router.put("/product-groups", response_model=list[ProductGroupOut])
@limiter.limit("60/hour")  # MEH-3022: every owner write route is limited
def replace_my_product_groups(
    request: Request,  # required by slowapi
    body: ProductGroupsIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    """The whole ordered list in one write: add (no id), rename, reorder,
    delete (absent). Products of a deleted group become ungrouped."""
    return svc.replace_groups(db, _my_producer(user, db), body)


@router.put("/product-order", response_model=list[ProductOut])
@limiter.limit("120/hour")  # MEH-3022; one save per drag, so looser
def set_my_product_order(
    request: Request,  # required by slowapi
    body: ProductOrderIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[Product]:
    """`product_ids` must be exactly the business's products, each once —
    a partial list would leave two products sharing a position."""
    # MEH-2312: the owner orders her PUBLISHED catalog; drafts are not hers yet.
    return svc.set_order(db, user.producer_id, body.product_ids, include_drafts=False)


@router.put("/products/{product_id}/group", response_model=ProductOut)
@limiter.limit("120/hour")  # MEH-3022
def set_my_product_group(
    request: Request,  # required by slowapi
    product_id: UUID,
    body: ProductGroupAssignIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Product:
    return svc.assign_group(
        db, _my_producer(user, db), product_id, body.group_id, include_drafts=False
    )


# MEH-3477: «העברה לקבוצה» for many products, and a suggestion's approval /
# undo — one transaction, all or nothing.
@router.put("/product-groups/assign", response_model=list[ProductOut])
@limiter.limit("120/hour")  # MEH-3022
def move_products_between_groups(
    request: Request,  # required by slowapi
    body: GroupMovesIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[Product]:
    moves = [(m.group_id, m.product_ids) for m in body.moves]
    return svc.assign_many(db, _my_producer(user, db), moves, include_drafts=False)


# MEH-3478: an AI suggestion for the products in no group. Saves nothing; one
# model call per press, so it is limited tighter than the writes.
# MEH-3497: one Opus call per press, so a per-business daily cap on top of the
# per-IP hourly one; a second device or IP does not reset it.
GROUPS_DAILY_CAP = "10/day"


def _mark_groups(request: Request, user: User = Depends(require_producer)) -> User:
    request.state.ai_key = f"groups:{user.producer_id or user.id}"
    return user


@router.post("/product-groups/suggest", response_model=GroupSuggestionsOut)
@limiter.limit("10/hour")
@limiter.limit(GROUPS_DAILY_CAP, key_func=_business_key)
def suggest_product_groups(
    request: Request,  # required by slowapi
    user: User = Depends(_mark_groups),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return svc.suggestion_for(db, _my_producer(user, db), include_drafts=False)
