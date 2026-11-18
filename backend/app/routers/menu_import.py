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
History:  MEH-3430 (creation)
"""

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
from app.services.image_ownership import assert_own_new_images  # MEH-3247
from app.services.menu_reader import read_menu

router = APIRouter(prefix="/producers/me/menu-import", tags=["producer-management"])
logger = logging.getLogger(__name__)

MAX_FILES = 5
MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TOTAL_BYTES = 20 * 1024 * 1024  # base64 → ~27 MB, under the API's 32 MB
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
_TOO_BIG = "הקבצים גדולים מדי. אפשר עד 5 קבצים, עד 8MB כל אחד."
_TOO_MANY_PAGES = f"אפשר להעלות PDF של עד {MAX_PDF_PAGES} עמודים"
_UNAVAILABLE = "לא הצלחנו לקרוא את התפריט כרגע"


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
    rows = read_menu(payload)
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


@router.post("/publish", response_model=MenuPublishOut, status_code=201)
@limiter.limit("10/hour")
def publish_my_menu(
    request: Request,  # required by slowapi
    body: MenuPublishIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> MenuPublishOut:
    # MEH-3247: the menu screen sends no photos, but the body is ProductCreate,
    # so a hand-made request could store another business's Cloudinary URL.
    # Same check as POST /producers/me/products (producer_me.py).
    assert_own_new_images(user, [p.image_url for p in body.products if p.image_url])
    # Two publishes at once must not both pass the cap: lock the business row.
    # REUSES: backend/app/services/product_import.py:import_drafts
    producer = (
        db.query(Producer)
        .filter(Producer.id == user.producer_id)
        .with_for_update()
        .first()
    )
    if producer is None:
        raise HTTPException(status_code=404, detail="בית העסק לא נמצא")
    existing = db.query(Product.name).filter(Product.producer_id == producer.id).all()
    seen = {_name_key(str(r.name)) for r in existing}
    to_create: list[Product] = []
    kept: list[MenuProductIn] = []
    skipped: list[str] = []
    for item in body.products:
        key = _name_key(item.name)
        if key in seen:
            skipped.append(item.name)
            continue
        seen.add(key)
        kept.append(item)
        to_create.append(Product(producer_id=producer.id, **item.model_dump()))
    if not to_create:
        return MenuPublishOut(created=0, skipped_duplicates=skipped)
    # MEH-3022: enforce_cap refuses at count >= cap for ONE insert; for n
    # inserts the last one lands at current + n - 1.
    enforce_cap(len(existing) + len(to_create) - 1, "products")
    # One moderation call for the whole menu, not one per product (MEH-3261):
    # REJECTED refuses the publish, FLAGGED pings the admin once.
    approved_edit.check_product(
        background_tasks,
        producer,
        None,
        {
            "name": "\n".join(p.name for p in kept),
            "description": "\n".join(p.description for p in kept if p.description),
        },
        bool(producer.is_test or getattr(user, "is_test", False)),
    )
    db.add_all(to_create)
    db.commit()
    logger.info("menu published: producer=%s created=%s", producer.id, len(to_create))
    return MenuPublishOut(created=len(to_create), skipped_duplicates=skipped)
