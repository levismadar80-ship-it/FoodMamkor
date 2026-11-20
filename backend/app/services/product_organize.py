# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3472 PR)
"""
Module:   product_organize (service)
Purpose:  One implementation of product groups and product order for a
          business, shared by the owner's routes (/producers/me/...) and the
          admin's (/admin/producers/{id}/...), so the two can never disagree
          about what a valid group list or order is.
Touches:  DB producers.product_groups (JSONB), products.position,
          products.group_id.
Does NOT: authorise anything — the caller resolves WHICH business (the
          owner's own, or the one in the admin's path) and decides whether
          drafts are in scope (owner: published only, MEH-2312; admin: drafts
          too, MEH-3472). Does not create, edit or delete products.
Related:  routers/product_organize.py (owner) · routers/admin_product_organize.py
          (admin) · services/product_import.py (import creates groups by name)
History:  MEH-3055 (logic created in routers/product_organize.py);
          MEH-3472 (moved here verbatim, drafts made a caller choice).
"""

import uuid
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Producer, Product
from app.schemas.product_organize import ProductGroupsIn

ORDER_CHANGED_DETAIL = "רשימת המוצרים השתנתה בינתיים. כדאי לרענן את הדף ולנסות שוב."
GROUP_NOT_FOUND_DETAIL = "הקבוצה לא נמצאה"
PRODUCT_NOT_FOUND_DETAIL = "מוצר לא נמצא"


def groups_of(producer: Producer) -> list[dict[str, str]]:
    raw: Any = producer.product_groups or []
    return [g for g in raw if isinstance(g, dict) and g.get("id") and g.get("name")]


def replace_groups(
    db: Session, producer: Producer, body: ProductGroupsIn
) -> list[dict[str, str]]:
    """The whole ordered list in one write: add (no id), rename, reorder,
    delete (absent). Products of a deleted group become ungrouped — drafts
    included, so a draft never points at a group that no longer exists.

    The producer row is locked first (as the import does): without it an
    import committing new groups between this read and this write would be
    overwritten, leaving its drafts with a dangling group_id."""
    db.refresh(producer, with_for_update=True)
    known = {g["id"] for g in groups_of(producer)}
    new: list[dict[str, str]] = []
    for g in body.groups:
        if g.id is not None and g.id not in known:
            raise HTTPException(status_code=404, detail=GROUP_NOT_FOUND_DETAIL)
        new.append({"id": g.id or str(uuid.uuid4()), "name": g.name})
    kept = {g["id"] for g in new}
    removed = known - kept
    if removed:
        db.query(Product).filter(
            Product.producer_id == producer.id,
            Product.group_id.in_(removed),
        ).update({Product.group_id: None}, synchronize_session=False)
    producer.product_groups = new  # type: ignore[assignment]
    db.commit()
    return new


def set_order(
    db: Session, producer_id: Any, product_ids: list[UUID], *, include_drafts: bool
) -> list[Product]:
    """`product_ids` must be exactly the products in scope, each once — a
    partial list would leave two products sharing a position."""
    q = db.query(Product).filter(Product.producer_id == producer_id)
    if not include_drafts:
        q = q.filter(Product.is_draft.is_(False))  # MEH-2312
    by_id = {p.id: p for p in q.all()}
    if len(product_ids) != len(set(product_ids)) or set(product_ids) != set(by_id):
        raise HTTPException(status_code=409, detail=ORDER_CHANGED_DETAIL)
    for pos, pid in enumerate(product_ids):
        by_id[pid].position = pos  # type: ignore[assignment,index]
    if not include_drafts:
        # One `position` column serves both scopes. The owner numbers only
        # published rows 0..n-1, so drafts (which the admin may have numbered
        # in the same range) move after them, keeping their own relative
        # order — otherwise an approved draft lands mid-list (MEH-3472).
        drafts = (
            db.query(Product)
            .filter(Product.producer_id == producer_id, Product.is_draft.is_(True))
            .order_by(Product.position.asc().nulls_last(), Product.id.asc())
            .all()
        )
        for offset, d in enumerate(drafts):
            d.position = len(product_ids) + offset  # type: ignore[assignment]
    db.commit()
    return [by_id[pid] for pid in product_ids]  # type: ignore[index]


def assign_group(
    db: Session,
    producer: Producer,
    product_id: UUID,
    group_id: str | None,
    *,
    include_drafts: bool,
) -> Product:
    q = db.query(Product).filter(
        Product.id == product_id,
        Product.producer_id == producer.id,
    )
    if not include_drafts:
        q = q.filter(Product.is_draft.is_(False))  # MEH-2312
    product = q.first()
    if product is None:
        raise HTTPException(status_code=404, detail=PRODUCT_NOT_FOUND_DETAIL)
    db.refresh(producer, with_for_update=True)  # same lock as replace_groups
    if group_id is not None and group_id not in {g["id"] for g in groups_of(producer)}:
        raise HTTPException(status_code=404, detail=GROUP_NOT_FOUND_DETAIL)
    product.group_id = group_id  # type: ignore[assignment]
    db.commit()
    db.refresh(product)
    return product
