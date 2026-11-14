"""
Module:   capabilities
Purpose:  The one place that answers "what may this business do?" — so no
          route reads `producer.plan` on its own. Today every paid tool is
          open to every business (launch phase, ADR-042); the only limit is
          the long-standing gallery cap.
Touches:  nothing — pure functions over a Producer row.
Does NOT: charge, or decide prices (app/pricing.py). Does NOT gate anything
          new: MEH-3181 moved the existing gallery cap here unchanged.
Related:  routers/upload.py (the gallery cap) · app/pricing.py ·
          frontend dashboard edit cards (still read `plan` until MEH-3182).
History:  MEH-3181 (creation, 2026-11-14).
"""

from __future__ import annotations

from typing import Any, Final

FREE_PLAN: Final = "free"
# MEH-1352: a business on the free plan keeps at most this many gallery images.
FREE_GALLERY_IMAGE_LIMIT: Final = 3


def gallery_image_limit(producer: Any) -> int | None:
    """How many gallery images the business may keep; None = no limit."""
    if producer is None:
        return None
    # A NULL plan is not "free": the cap never applied to it, and still does not.
    return (
        FREE_GALLERY_IMAGE_LIMIT
        if getattr(producer, "plan", None) == FREE_PLAN
        else None
    )


def gallery_is_full(producer: Any) -> bool:
    limit = gallery_image_limit(producer)
    if limit is None:
        return False
    return len(getattr(producer, "images", None) or []) >= limit
