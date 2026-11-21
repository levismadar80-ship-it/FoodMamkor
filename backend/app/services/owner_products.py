"""
Module:   owner_products
Purpose:  The owner's own product rows: the lookup that keeps a draft (the
          admin import's until approved) and another business's product out,
          and the rules a product PUT applies to the row as it will be.
Touches:  products.
Does NOT: route, authorize, run the AI check or commit — that stays in
          `routers/producer_me.py` (update_my_product / delete_my_product).
Related:  backend/app/routers/producer_me.py::update_my_product ·
          backend/app/allergens.py (DETAIL_COLUMNS, detail_if_declared,
          drop_contained).
History:  MEH-3569 (moved verbatim from routers/producer_me.py, no behaviour
          change).
"""

from typing import Any, cast
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.allergens import DETAIL_COLUMNS, detail_if_declared, drop_contained
from app.models import Product


def own_product_or_404(db: Session, producer_id: UUID, product_id: UUID) -> Product:
    """A product of THIS producer that is not a draft, or 404."""
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == producer_id,
            Product.is_draft.is_(
                False
            ),  # MEH-2312: drafts are the admin's until approved
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    return product


def apply_product_update(product: Product, payload: dict[str, Any]) -> None:
    """Check the price pair, write the payload, then normalize the allergens
    against the stored row. The caller commits."""
    # MEH-2924: a price is optional now, but «עד» alone is not a price. The
    # schema can only see the fields sent, so check the row as it will be.
    new_min = payload.get("price_min", product.price_min)
    new_max = payload.get("price_max", product.price_max)
    if new_min is None and new_max is not None:
        raise HTTPException(status_code=422, detail="מחיר «עד» צריך גם מחיר «מ-»")
    if new_min is not None and new_max is not None and new_max < new_min:
        raise HTTPException(
            status_code=422, detail="מחיר «עד» צריך להיות גדול או שווה למחיר «מ-»"
        )
    for field, value in payload.items():
        setattr(product, field, value)
    # MEH-3439: the schema only sees the body; a PUT carrying one of the two
    # lists can still overlap the other one stored on the row. «מכיל» wins.
    if "allergens" in payload or "may_contain" in payload:
        product.may_contain = drop_contained(  # type: ignore[assignment]
            cast(list[str] | None, product.allergens),
            cast(list[str] | None, product.may_contain),
        )
    # MEH-3442: against the stored row too — a PUT that unticks «גלוטן»
    # without sending gluten_detail must still drop the detail.
    for code, column in DETAIL_COLUMNS.items():
        setattr(
            product,
            column,
            detail_if_declared(
                code,
                cast(list[str] | None, product.allergens),
                cast(list[str] | None, product.may_contain),
                getattr(product, column),
            ),
        )
    # MEH-3445: «אין אלרגנים» never stands next to a ticked code — the code
    # is the stronger claim, whichever of the two this PUT sent.
    if product.allergens or product.may_contain:
        product.no_allergens = False  # type: ignore[assignment]
