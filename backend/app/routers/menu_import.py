# guard-ok: backend/pyproject.toml is edit-denied for CC; Sapir adds this file to [tool.mypy].files (MEH-3430 PR)
"""
Module:   menu_import
Purpose:  The owner uploads a menu (photos or a PDF), gets product rows back to
          review, and publishes the rows she approved. MEH-3430.
Touches:  Anthropic (read, via services/menu_reader.py); DB products (publish
          inserts only).
Does NOT: save anything on read — the uploaded bytes live for the request
          only; fire "new product" alerts on publish (a whole menu would spam
          every follower, the same call MEH-2312 made for the admin import);
          edit or delete existing products (routers/producer_me.py).
Related:  app/schemas/menu_import.py · app/limits.py MAX_PRODUCTS ·
          app/routers/upload.py:_sniff_image_type ·
          app/services/approved_edit_moderation.py:check_product
History:  MEH-3430 (creation; review 18/11: read off the event loop, a daily
          budget per business, moderation before the lock, limits that match
          the proxy in front)
"""

import asyncio
import logging
import re

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Request,
    UploadFile,
)
from limits import parse as parse_limit
from sqlalchemy.orm import Session

from app.auth import require_producer
from app.database import get_db
from app.limits import enforce_cap
from app.models import Producer, Product, User
from app.rate_limit import limiter
from app.routers.upload import _sniff_image_type
from app.schemas.menu_import import (
    MenuProductIn,
    MenuPublishIn,
    MenuPublishOut,
    MenuReadOut,
)
from app.services import approved_edit_moderation as approved_edit
from app.services.menu_reader import read_menu

router = APIRouter(prefix="/producers/me/menu-import", tags=["producer-management"])
logger = logging.getLogger(__name__)

MAX_FILES = 5
# The real ceiling is in front of us: Vercel refuses a body over ~4.5 MB
# (MEH-3399) and BodySizeLimitMiddleware one over 6 MB (body_limit.py). The
# browser shrinks photos to fit; these only refuse what got past it.
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 6 * 1024 * 1024
# The decorator limits key on the IP; a business gets its own daily budget
# too, so a new IP is not a new budget for the paid call (review, 18/11).
READS_PER_BUSINESS = parse_limit("30/day")
_READ_SCOPE = "menu-read"
MAX_PDF_PAGES = 10
_MEDIA = {
    "jpeg": "image/jpeg",
    "png": "image/png",
    "webp": "image/webp",
    "gif": "image/gif",
}
# "/Type /Page" but not "/Type /Pages" — a rough count that needs no PDF library.
_PDF_PAGE = re.compile(rb"/Type\s*/Page(?![s\w])")

# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
_BAD_FILE = "אפשר להעלות תמונות JPG/PNG/WebP או קובץ PDF"
_TOO_BIG = "הקבצים גדולים מדי. אפשר עד 5 קבצים, עד 4MB כל אחד."
_TOO_MANY_PAGES = f"אפשר להעלות PDF של עד {MAX_PDF_PAGES} עמודים"
_UNAVAILABLE = "לא הצלחנו לקרוא את התפריט כרגע"
_DAILY = "הגעתם למספר הקריאות היומי של תפריטים. אפשר לנסות שוב מחר."


def _media_type(data: bytes) -> str:
    """Magic bytes, never the browser's Content-Type (security.md)."""
    if data.startswith(b"%PDF-"):
        if len(_PDF_PAGE.findall(data)) > MAX_PDF_PAGES:
            raise HTTPException(status_code=413, detail=_TOO_MANY_PAGES)
        return "application/pdf"
    kind = _sniff_image_type(data[:16])
    if kind not in _MEDIA:  # HEIC included: the model cannot read it
        raise HTTPException(status_code=415, detail=_BAD_FILE)
    return _MEDIA[kind]


@router.post("/read", response_model=MenuReadOut)
@limiter.limit("10/hour;30/day")  # each read is one paid Opus call
async def read_my_menu(
    request: Request,  # required by slowapi
    files: list[UploadFile] = File(...),
    user: User = Depends(require_producer),
) -> MenuReadOut:
    if not files or len(files) > MAX_FILES:
        raise HTTPException(status_code=413, detail=_TOO_BIG)
    payload: list[tuple[str, bytes]] = []
    total = 0
    for upload in files:
        # Read one byte past the cap so an oversized file is refused without
        # holding all of it.
        data = await upload.read(MAX_FILE_BYTES + 1)
        total += len(data)
        if len(data) > MAX_FILE_BYTES or total > MAX_TOTAL_BYTES:
            raise HTTPException(status_code=413, detail=_TOO_BIG)
        payload.append((_media_type(data), data))
    if not limiter.limiter.hit(READS_PER_BUSINESS, _READ_SCOPE, str(user.producer_id)):
        raise HTTPException(status_code=429, detail=_DAILY)
    # The SDK is sync and a read takes seconds: off the event loop, as
    # upload.py does for Cloudinary (MEH-2551).
    rows = await asyncio.to_thread(read_menu, payload)
    if rows is None:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE)
    logger.info(
        "menu read: producer=%s files=%s rows=%s",
        user.producer_id,
        len(payload),
        len(rows),
    )
    return MenuReadOut(rows=rows)


def _name_key(name: str) -> str:
    # REUSES: backend/app/services/product_import.py:_name_key — same duplicate rule
    return re.sub(r"\s+", " ", name).strip().casefold()


def _new_items(
    db: Session, producer_id: object, items: list[MenuProductIn]
) -> tuple[list[MenuProductIn], list[str]]:
    """The items whose name the business does not have yet (nor earlier in
    the batch), and the names skipped."""
    rows = db.query(Product.name).filter(Product.producer_id == producer_id).all()
    seen = {_name_key(str(r.name)) for r in rows}
    kept: list[MenuProductIn] = []
    skipped: list[str] = []
    for item in items:
        key = _name_key(item.name)
        if key in seen:
            skipped.append(item.name)
            continue
        seen.add(key)
        kept.append(item)
    return kept, skipped


@router.post("/publish", response_model=MenuPublishOut, status_code=201)
@limiter.limit("10/hour")
def publish_my_menu(
    request: Request,  # required by slowapi
    body: MenuPublishIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> MenuPublishOut:
    # Moderate BEFORE taking the row lock: the AI call takes seconds and must
    # not hold a lock and a pool slot (approved_edit_moderation.py). Then the
    # duplicates and the cap are decided again under the lock.
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    candidates, _ = _new_items(db, producer.id, body.products)
    if candidates:
        # One moderation call for the whole menu, not one per product
        # (MEH-3261): REJECTED refuses the publish, FLAGGED pings the admin once.
        approved_edit.check_product(
            background_tasks,
            producer,
            None,
            {
                "name": "\n".join(p.name for p in candidates),
                "description": "\n".join(
                    p.description for p in candidates if p.description
                ),
            },
            bool(producer.is_test or getattr(user, "is_test", False)),
        )
    # Two publishes at once must not both pass the cap: lock the business row.
    # REUSES: backend/app/services/product_import.py:import_drafts
    db.query(Producer).filter(Producer.id == producer.id).with_for_update().first()
    kept, skipped = _new_items(db, producer.id, body.products)
    if not kept:
        db.rollback()
        return MenuPublishOut(created=0, skipped_duplicates=skipped)
    existing = db.query(Product.id).filter(Product.producer_id == producer.id).count()
    # MEH-3022: enforce_cap refuses at count >= cap for ONE insert; for n
    # inserts the last one lands at current + n - 1.
    enforce_cap(existing + len(kept) - 1, "products")
    db.add_all(Product(producer_id=producer.id, **p.model_dump()) for p in kept)
    db.commit()
    logger.info("menu published: producer=%s created=%s", producer.id, len(kept))
    return MenuPublishOut(created=len(kept), skipped_duplicates=skipped)
