# guard-ok: not in [tool.mypy].files — it imports app/schemas/schemas.py / app/limits.py, which are untyped (5,850 lines, ~190 strict errors) and would be reported as this file's (MEH-3055)
"""
Module:   product_organize
Purpose:  The owner sets the order of her products and sorts them into
          groups (MEH-3055) — the two things the public page then shows as
          "her order" and as group chips.
Touches:  DB products.position / products.group_id, producers.product_groups.
Does NOT: create, edit or delete products (routers/producer_me.py), or render
          anything — ordering for display is lib/product-order.js.
Related:  app/schemas/product_organize.py · app/limits.py MAX_PRODUCT_GROUPS ·
          alembic b7d4e2a9c615
History:  MEH-3055 (creation)
"""

import uuid
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.schemas.product_organize import (
    ProductGroupAssignIn,
    ProductGroupsIn,
    ProductOrderIn,
)
from app.schemas.schemas import ProductGroupOut, ProductOut

router = APIRouter(prefix="/producers/me", tags=["producer-management"])

# DO NOT put these under /products/order — producer_me.py owns
# /producers/me/products/{product_id} (UUID-typed) and is registered first,
# so "order" would 422 there before reaching this router.


def _my_producer(user: User, db: Session) -> Producer:
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


def _groups(producer: Producer) -> list[dict[str, str]]:
    raw: Any = producer.product_groups or []
    return [g for g in raw if isinstance(g, dict) and g.get("id") and g.get("name")]


@router.get("/product-groups", response_model=list[ProductGroupOut])
def list_my_product_groups(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> list[dict[str, str]]:
    return _groups(_my_producer(user, db))


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
    producer = _my_producer(user, db)
    known = {g["id"] for g in _groups(producer)}
    new: list[dict[str, str]] = []
    for g in body.groups:
        if g.id is not None and g.id not in known:
            raise HTTPException(status_code=404, detail="הקבוצה לא נמצאה")
        new.append({"id": g.id or str(uuid.uuid4()), "name": g.name})
    kept = {g["id"] for g in new}
    removed = known - kept
    if removed:
        db.query(Product).filter(
            Product.producer_id == producer.id,
            Product.group_id.in_(removed),
        ).update({Product.group_id: None}, synchronize_session=False)
    producer.product_groups = new
    db.commit()
    return new


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
    products = db.query(Product).filter(Product.producer_id == user.producer_id).all()
    by_id = {p.id: p for p in products}
    ids = body.product_ids
    if len(ids) != len(set(ids)) or set(ids) != set(by_id):
        raise HTTPException(
            status_code=409,
            detail="רשימת המוצרים השתנתה בינתיים. כדאי לרענן את הדף ולנסות שוב.",
        )
    for pos, pid in enumerate(ids):
        by_id[pid].position = pos
    db.commit()
    return [by_id[pid] for pid in ids]


@router.put("/products/{product_id}/group", response_model=ProductOut)
@limiter.limit("120/hour")  # MEH-3022
def set_my_product_group(
    request: Request,  # required by slowapi
    product_id: UUID,
    body: ProductGroupAssignIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> Product:
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.producer_id == user.producer_id)
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    if body.group_id is not None:
        known = {g["id"] for g in _groups(_my_producer(user, db))}
        if body.group_id not in known:
            raise HTTPException(status_code=404, detail="הקבוצה לא נמצאה")
    product.group_id = body.group_id
    db.commit()
    db.refresh(product)
    return product
