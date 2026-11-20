# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3483 PR)
"""
Module:   page_fill
Purpose:  «ספרו לנו על העסק» (MEH-3483): the owner (or the admin, for a
          business) sends free text and gets a draft of the page fields back.
Touches:  reads categories; the Anthropic API (services/page_filler.py).
          No DB writes.
Does NOT: save — the screen sends the fields the owner approved to
          PUT /producers/me (admin: PUT /admin/producers/{id}), so the draft
          meets the same validation and moderation as the edit cards. Menu
          photos go to /producers/me/menu-import/read (routers/menu_import.py).
Related:  routers/product_describe.py (same limits shape, REUSES its
          per-business key) · schemas/page_fill.py
History:  MEH-3483 (creation)
"""

import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Category, Producer, User
from app.rate_limit import limiter
from app.routers.product_describe import _business_key, _mark_owner  # REUSES
from app.schemas.page_fill import PageFillIn, PageFillOut
from app.services.page_filler import read_page

router = APIRouter(tags=["producer-management"])

# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
UNAVAILABLE_DETAIL = "לא הצלחנו לקרוא את הטקסט כרגע. אפשר למלא את הפרטים ידנית."
DAILY_CAP = "20/day"


def _categories(db: Session) -> list[tuple[int, str]]:
    rows = db.query(Category.id, Category.name).order_by(Category.id).all()
    return [(int(cid), str(name)) for cid, name in rows]


async def _answer(body: PageFillIn, db: Session) -> PageFillOut:
    categories = _categories(db)
    # The SDK is sync: off the event loop, as menu_import.py does.
    draft = await asyncio.to_thread(read_page, body.text, categories)
    if draft is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_DETAIL)
    return PageFillOut(draft=draft)


@router.post("/producers/me/page-fill/read", response_model=PageFillOut)
@limiter.limit("10/hour")
@limiter.limit(DAILY_CAP, key_func=_business_key)
async def read_my_page_text(
    request: Request,
    body: PageFillIn,
    user: User = Depends(_mark_owner),
    db: Session = Depends(get_db),
) -> PageFillOut:
    return await _answer(body, db)


@router.post(
    "/admin/producers/{producer_id}/page-fill/read", response_model=PageFillOut
)
# Admin: hourly per-IP only, like the admin description suggest.
@limiter.limit("60/hour")
async def admin_read_page_text(
    request: Request,
    producer_id: UUID,
    body: PageFillIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> PageFillOut:
    if not db.query(Producer.id).filter(Producer.id == producer_id).first():
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    return await _answer(body, db)
