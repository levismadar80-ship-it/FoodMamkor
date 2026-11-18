# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-2312 PR)
"""
Module:   admin_product_import
Purpose:  The admin imports a business's catalog as DRAFTS, reviews them, and
          approves them (in the owner's place, Sapir 16.11) or deletes them.
Touches:  products (insert drafts, flip is_draft, delete drafts).
Does NOT: Parse a third-party store (rows arrive ready; see
          services/product_import.py), touch published products, or publish
          a single draft as a side effect of anything else.
Related:  services/product_import.py:import_drafts; models.Producer.products
          (the relationship hides drafts from every public reader).
History:  MEH-2312 (creation).
"""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.schemas.catalog import (
    ProductDraftApproveRequest,
    ProductDraftApproveResult,
    ProductDraftOut,
    ProductImportRequest,
    ProductImportResult,
)
from app.services.product_import import import_drafts

router = APIRouter(prefix="/admin/producers", tags=["admin-product-import"])
logger = logging.getLogger(__name__)


def _require_producer_row(db: Session, producer_id: UUID) -> Producer:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return producer


@router.post("/{producer_id}/product-import", response_model=ProductImportResult)
@limiter.limit("30/hour")
def admin_import_products(
    request: Request,
    producer_id: UUID,
    body: ProductImportRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductImportResult:
    _require_producer_row(db, producer_id)
    return import_drafts(db, producer_id, body.rows)


@router.get("/{producer_id}/product-drafts", response_model=list[ProductDraftOut])
def admin_list_product_drafts(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[Product]:
    _require_producer_row(db, producer_id)
    return (
        db.query(Product)
        .filter(Product.producer_id == producer_id, Product.is_draft.is_(True))
        .order_by(Product.name.asc())
        .all()
    )


@router.post(
    "/{producer_id}/product-drafts/approve",
    response_model=ProductDraftApproveResult,
)
@limiter.limit("60/hour")
def admin_approve_product_drafts(
    request: Request,
    producer_id: UUID,
    body: ProductDraftApproveRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProductDraftApproveResult:
    """Publish drafts of THIS business: the listed ids, or all of them.

    An id that is not a draft of this business (another business's product,
    an already-published one, a typo) is simply not matched — the filter is on
    producer_id AND is_draft, so nothing outside the business can be touched.
    """
    _require_producer_row(db, producer_id)
    q = db.query(Product).filter(
        Product.producer_id == producer_id, Product.is_draft.is_(True)
    )
    if body.product_ids is not None:
        q = q.filter(Product.id.in_(body.product_ids))
    approved = q.update({Product.is_draft: False}, synchronize_session=False)
    db.commit()
    # Publishing a catalog in the owner's place leaves a trail.
    logger.info(
        "product drafts approved: producer=%s count=%s admin=%s",
        producer_id,
        approved,
        user.id,
    )
    return ProductDraftApproveResult(approved=approved)


@router.delete("/{producer_id}/product-drafts/{product_id}", status_code=204)
@limiter.limit("250/hour")
def admin_delete_product_draft(
    request: Request,
    producer_id: UUID,
    product_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> None:
    draft = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == producer_id,
            Product.is_draft.is_(True),
        )
        .first()
    )
    if draft is None:
        raise HTTPException(status_code=404, detail="טיוטה לא נמצאה")
    db.delete(draft)
    db.commit()
    logger.info(
        "product draft deleted: producer=%s product=%s admin=%s",
        producer_id,
        product_id,
        user.id,
    )
