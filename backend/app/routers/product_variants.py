"""
Module:   product_variants (router)
Purpose:  The owner (or an admin) replaces one product's list of sizes or
          flavours, in the order the page shows them.
Touches:  DB table product_variants (whole-list replace for one product).
Does NOT: price an order — services/product_variants.py and
          services/product_order_create.py do. Does NOT read the variants:
          they ride on every ProductOut (the editor and the business page).
Related:  app/schemas/product_variants.py, app/limits.py (the cap),
          app/models/catalog.py::ProductVariant
History:  MEH-3617 (creation)

A file of its own because producer_me.py does not grow (code-execution §16).
"""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.limits import enforce_cap
from app.models.catalog import Product, ProductVariant
from app.models.models import User
from app.rate_limit import limiter
from app.schemas.product_variants import ProductVariantsIn, ProductVariantsOut

router = APIRouter(tags=["product-variants"])

PRODUCT_NOT_FOUND_DETAIL = "מוצר לא נמצא"


def _writable_product(db: Session, user: User, product_id: UUID) -> Product:
    """The product, locked, when the caller owns it or is an admin; else 404.

    404 and not 403 for someone else's product, so an id is not confirmed to
    exist (the same answer own_product_or_404 gives). A draft is the admin
    import's until approved (MEH-2312), so only an admin reaches it.
    """
    product = (
        db.query(Product)
        .filter(Product.id == product_id)
        .with_for_update(of=Product)
        .first()
    )
    is_admin = user.role == "admin"
    owns = (
        product is not None
        and user.role == "producer"
        and user.producer_id is not None
        and product.producer_id == user.producer_id
        and not product.is_draft
    )
    if product is None or not (owns or is_admin):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=PRODUCT_NOT_FOUND_DETAIL
        )
    return product


@router.put("/products/{product_id}/variants", response_model=ProductVariantsOut)
@limiter.limit("60/hour")
def put_product_variants(
    request: Request,
    product_id: UUID,
    body: ProductVariantsIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Any:
    """Replace the product's whole list. An id of an existing variant keeps
    that row (renamed, repriced, moved); any other row is deleted. Order lines
    that named a deleted variant keep their copied name (SET NULL)."""
    product = _writable_product(db, user, product_id)
    # MEH-3022: the per-product cap, a 409 in Hebrew. The schema's own
    # max_length is the looser bound on the request body.
    if body.variants:
        enforce_cap(len(body.variants) - 1, "variants")
    existing = {v.id: v for v in product.variants}
    kept: list[ProductVariant] = []
    for position, item in enumerate(body.variants):
        row = existing.pop(item.id, None) if item.id is not None else None
        if row is None:
            row = ProductVariant(product_id=product.id)
            db.add(row)
        row.name = item.name
        row.price_agorot = item.price_agorot
        row.in_stock = item.in_stock
        row.position = position
        kept.append(row)
    for gone in existing.values():
        db.delete(gone)
    db.commit()
    db.refresh(product)
    return {"variants": product.variants}
