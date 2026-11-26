"""
Module:   producer_images
Purpose:  The one answer to "which of this business's photos stands for it"
          on a card, a row or a share preview: the first non-blank entry of
          `producers.images`, trimmed, or None.
Does NOT: pick an item's OWN photo (event / experience `image_url`) — the
          caller tries that first and falls back to this; does not touch
          Cloudinary or validate URLs (`schemas.py` `_image_url_validator`).
Related:  backend/app/routers/events.py (owner_image_url),
          backend/app/routers/experiences.py (owner_image_url),
          backend/app/routers/group_buys.py (producer_image_url),
          backend/app/services/rescue_reads.py (producer.image_url),
          scripts/checks/first-image-guard.sh (no second copy).
History:  MEH-3892 (event rows on the owner's page showed an icon);
          MEH-3894 (one helper; `(images or [None])[0]` handed a blank
          first entry to the card as its photo).
"""

from __future__ import annotations

from collections.abc import Iterable


def first_image(images: Iterable[str | None] | None) -> str | None:
    """First non-blank photo URL, stripped; None when there is none."""
    for url in images or ():
        if url and url.strip():
            return url.strip()
    return None
