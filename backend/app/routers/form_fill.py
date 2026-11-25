# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3740 PR)
"""
Module:   form_fill
Purpose:  One route for every «fill the form from text» box on the owner
          dashboard (MEH-3740): POST /producers/me/ai-fill/{form} returns a
          draft of that form. form=recipe today; a new form is a new field
          map in app/data/form_maps/ (and, if it picks from the owner's own
          rows, one entry in _CHOICES), not a new route.
Touches:  reads the owner's products; the Anthropic API
          (services/form_filler.py). No DB writes.
Does NOT: save — the screen fills its form and the owner saves through the
          form's own route. Page fill (routers/page_fill.py) and the menu
          reader (routers/menu_import.py) keep their routes (the card's scope).
Related:  routers/page_fill.py (same limits, REUSES _business_key and
          _mark_owner) · schemas/form_fill.py
History:  MEH-3740 (creation) · MEH-3752 (order_setup gets the owner's products)
"""

import asyncio
from collections.abc import Callable

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Product, User
from app.rate_limit import limiter
from app.routers.product_describe import _business_key, _mark_owner  # REUSES
from app.schemas.form_fill import FormFillIn, FormFillOut
from app.services import form_filler

router = APIRouter(tags=["producer-management"])

# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md. The same
# text as page fill: the card reuses its approved failure message.
UNAVAILABLE_DETAIL = "לא הצלחנו לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית."
NOT_FOUND_DETAIL = "הטופס לא נמצא"
DAILY_CAP = "20/day"


def _owner_products(db: Session, user: User) -> list[tuple[str, str]]:
    rows = (
        db.query(Product.id, Product.name)
        .filter(Product.producer_id == user.producer_id)
        .order_by(Product.name)
        .all()
    )
    return [(str(pid), str(name)) for pid, name in rows]


# form -> {field key: the owner's own options}. Only lists the owner owns.
_CHOICES: dict[str, dict[str, Callable[[Session, User], list[tuple[str, str]]]]] = {
    "recipe": {"product_ids": _owner_products},
    "order_setup": {"product_ids": _owner_products},  # MEH-3752
}


@router.post("/producers/me/ai-fill/{form}", response_model=FormFillOut)
@limiter.limit("10/hour")
@limiter.limit(DAILY_CAP, key_func=_business_key)
async def fill_my_form(
    request: Request,
    form: str,
    body: FormFillIn,
    user: User = Depends(_mark_owner),
    db: Session = Depends(get_db),
) -> FormFillOut:
    if form not in form_filler.forms():
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    choices = {key: get(db, user) for key, get in _CHOICES.get(form, {}).items()}
    # The SDK is sync: off the event loop, as page_fill.py does.
    draft = await asyncio.to_thread(form_filler.fill, form, body.text, choices)
    if draft is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_DETAIL)
    return FormFillOut(form=form, draft=draft)
