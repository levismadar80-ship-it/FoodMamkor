"""
Module:   gallery_cap
Purpose:  The free-plan cap on a business's GALLERY (3 photos), enforced where
          the gallery is written (PUT /producers/me `images`).
Does NOT: cap uploads. POST /upload/image is shared by product photos, event
          covers, recipes and workshops, so a cap there blocked all of them
          once the gallery was full (MEH-3220). The schema ceiling
          MAX_GALLERY_IMAGES (limits.py) is a separate, plan-blind safety cap.
Related:  backend/app/routers/producer_me.py (update_my_producer),
          frontend/app/[locale]/producer/dashboard/edit/cards.jsx FREE_IMAGE_CAP.
History:  MEH-1335 (ruled it a gallery cap); MEH-3220 (moved here from upload.py).
"""

from typing import Any

from fastapi import HTTPException

from app.models import Producer

# MEH-3220: mirrors FREE_IMAGE_CAP in the dashboard gallery card.
FREE_GALLERY_CAP = 3

# MEH-1008 copy, unchanged — moved verbatim from upload.py.
FREE_GALLERY_CAP_DETAIL = (
    "אפשר להעלות עד 3 תמונות לבית עסק. כדי להוסיף תמונה חדשה, הסירו קודם תמונה קיימת."
)


def assert_free_gallery_cap(
    producer: Producer, payload: dict[str, Any], old_images: list[Any]
) -> None:
    """Refuse a free-plan gallery write that GROWS the gallery past the cap.

    A legacy row already over the cap may still save the same list or a
    shorter one: refusing it would lock the owner out of every other field.
    """
    if producer.plan != "free" or "images" not in payload:
        return
    new_images = payload["images"] or []
    if len(new_images) > FREE_GALLERY_CAP and len(new_images) > len(old_images):
        raise HTTPException(status_code=403, detail=FREE_GALLERY_CAP_DETAIL)
