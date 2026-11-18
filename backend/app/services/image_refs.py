"""
Module:   image_refs
Purpose:  Answer "does any row still use this Cloudinary asset?" so a cleanup
          never destroys a photo another business (or user) still shows.
Touches:  reads every column in SCALAR_URL_SOURCES / ARRAY_URL_SOURCES.
Does NOT: destroy anything (cloudinary_utils.destroy_image does, and asks this
          module first), or decide who OWNS an asset (no upload ledger exists;
          see MEH-3247 follow-up).
Related:  backend/app/cloudinary_utils.py (destroy_image, destroy_removed_images),
          backend/scripts/cleanup_cloudinary_orphans.py (imports the registry).
History:  MEH-3247 (creation, grill B2): owner A could put B's photo URL in her
          gallery, remove it, and the post-commit cleanup destroyed B's asset.
"""

from collections.abc import Iterable
from typing import Any

from sqlalchemy import Text, cast, func, or_
from sqlalchemy.orm import Session

from app.cloudinary_utils import extract_public_id
from app.models.models import (
    Event,
    Experience,
    HomeProduct,
    KashrutBadgeRequest,
    Producer,
    ProducerRecipe,
    Product,
    RescueReview,
    User,
)

# MEH-3247: the ONE registry of columns that store a Cloudinary URL. The orphan
# sweep imports it too, so "referenced" means the same thing in both places.
# tests/test_meh3247_shared_image_destroy.py fails on an image-like column that
# is neither here nor exempted with a reason.
SCALAR_URL_SOURCES: tuple[Any, ...] = (
    User.avatar_url,
    Producer.story_card_url,
    Product.image_url,
    HomeProduct.photo,
    Event.image_url,
    Experience.image_url,
    Producer.owner_photo_url,
    ProducerRecipe.image_url,
    RescueReview.photo_url,
    KashrutBadgeRequest.cert_url,
    # MEH-3377: the screenshot of a business's written consent — the audit
    # record. Registered so neither a destroy nor the orphan sweep removes it.
    Producer.consent_screenshot_url,
)
ARRAY_URL_SOURCES: tuple[Any, ...] = (
    Producer.images,
    HomeProduct.images,
)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _parse(url: object) -> str | None:
    if not isinstance(url, str):
        return None
    return extract_public_id(url, bypass_reserved=True)


def _referenced_in_column(
    db: Session, column: Any, is_array: bool, wanted: set[str]
) -> set[str]:
    """Coarse SQL prefilter (substring), then an exact public_id match in Python.

    Parsing both sides with the same extract_public_id means a stored URL with
    a transformation, a version, a query string or no extension still counts,
    and `owner_1` never matches `owner_12`.
    """
    text_expr = func.array_to_string(column, " ") if is_array else cast(column, Text)
    patterns = [text_expr.like(f"%{_escape_like(pid)}%", escape="\\") for pid in wanted]
    hits: set[str] = set()
    for (value,) in db.query(column).filter(column.isnot(None), or_(*patterns)):
        values: Iterable[object] = value if is_array else (value,)
        for url in values:
            pid = _parse(url)
            if pid in wanted:
                hits.add(pid)
    return hits


def referenced_public_ids(db: Session, public_ids: Iterable[str]) -> set[str]:
    """The subset of `public_ids` that some row in the registry still stores.

    Raises on a DB error; the caller (cloudinary_utils) turns that into "skip
    the destroy" so a failed check can never delete a live photo.
    """
    wanted = {pid for pid in public_ids if pid}
    found: set[str] = set()
    if not wanted:
        return found
    for column in SCALAR_URL_SOURCES:
        found |= _referenced_in_column(db, column, False, wanted - found)
        if found == wanted:
            return found
    for column in ARRAY_URL_SOURCES:
        found |= _referenced_in_column(db, column, True, wanted - found)
        if found == wanted:
            return found
    return found
