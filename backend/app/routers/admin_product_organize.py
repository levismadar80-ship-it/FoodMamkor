# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3472 PR)
"""
Module:   admin_product_organize
Purpose:  The admin sorts a business's products into groups and sets their
          order, drafts included, so a page built on the owner's behalf is
          complete before it is approved (Sapir 19/11, MEH-3472).
Touches:  producers.product_groups, products.position, products.group_id
          (through services/product_organize.py).
Does NOT: hold the rules — services/product_organize.py does, shared with the
          owner's routes (routers/product_organize.py). Does not publish
          drafts (routers/admin_product_import.py approves them).
Related:  routers/admin_producer_locations.py:52 (same admin route shape);
          routers/admin_product_import.py:38 (_require_producer_row).
History:  MEH-3472 (creation).
"""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.schemas.product_organize import (
    GroupMovesIn,
    GroupSuggestionsOut,
    ProductGroupAssignIn,
    ProductGroupsIn,
    ProductOrderIn,
)
from app.schemas.schemas import ProductGroupOut, ProductOut
from app.services import product_organize as svc

router = APIRouter(prefix="/admin/producers", tags=["admin-product-organize"])


def _producer(db: Session, producer_id: UUID) -> Producer:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


@router.get("/{producer_id}/product-groups", response_model=list[ProductGroupOut])
def admin_list_product_groups(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return svc.groups_of(_producer(db, producer_id))


@router.put("/{producer_id}/product-groups", response_model=list[ProductGroupOut])
@limiter.limit("60/hour")  # MEH-3022
def admin_replace_product_groups(
    request: Request,  # required by slowapi
    producer_id: UUID,
    body: ProductGroupsIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return svc.replace_groups(db, _producer(db, producer_id), body)


@router.put("/{producer_id}/product-order", response_model=list[ProductOut])
@limiter.limit("120/hour")  # MEH-3022
def admin_set_product_order(
    request: Request,  # required by slowapi
    producer_id: UUID,
    body: ProductOrderIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[Product]:
    """Every product of the business, published AND draft — the admin builds
    the page before approval. The exact-set 409 applies to that whole set."""
    _producer(db, producer_id)
    return svc.set_order(db, producer_id, body.product_ids, include_drafts=True)


@router.put("/{producer_id}/products/{product_id}/group", response_model=ProductOut)
@limiter.limit("120/hour")  # MEH-3022
def admin_set_product_group(  # noqa: PLR0913 — FastAPI-injected parameters
    request: Request,  # required by slowapi
    producer_id: UUID,
    product_id: UUID,
    body: ProductGroupAssignIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> Product:
    # IDOR: the product must belong to the business in the PATH — the service
    # filters on producer_id, so another business's product answers 404.
    return svc.assign_group(
        db, _producer(db, producer_id), product_id, body.group_id, include_drafts=True
    )


# MEH-3477: «העברה לקבוצה» for many products, and a suggestion's approval /
# undo — one transaction, all or nothing.
@router.put("/{producer_id}/product-groups/assign", response_model=list[ProductOut])
@limiter.limit("120/hour")  # MEH-3022
def admin_move_products_between_groups(
    request: Request,  # required by slowapi
    producer_id: UUID,
    body: GroupMovesIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[Product]:
    moves = [(m.group_id, m.product_ids) for m in body.moves]
    return svc.assign_many(db, _producer(db, producer_id), moves, include_drafts=True)


# MEH-3478: an AI suggestion for the products in no group. Saves nothing; one
# model call per press, so it is limited tighter than the writes.
@router.post(
    "/{producer_id}/product-groups/suggest", response_model=GroupSuggestionsOut
)
@limiter.limit("30/hour")
def admin_suggest_product_groups(
    request: Request,  # required by slowapi
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return svc.suggestion_for(db, _producer(db, producer_id), include_drafts=True)
