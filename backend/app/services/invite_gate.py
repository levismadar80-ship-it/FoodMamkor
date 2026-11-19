"""
Module:   invite_gate
Purpose:  An owner invite goes out only for a page that could have been
          approved: at least one photo, and a licence number when a category
          requires one. Accepting the invite publishes a hidden page, so the
          gates belong at the moment the admin sends it.
Does NOT: check the WhatsApp number — the owner verifies it herself after
          she joins (Sapir 14/11). Does not gate admin approval itself
          (admin.py _assert_approvable, MEH-799 / MEH-971).
Related:  backend/app/routers/producer_owner_invite.py (create, resend),
          backend/app/routers/admin.py (the approve-time gates it mirrors).
History:  MEH-3246 (grill B9, creation); MEH-3268 (content_gaps: the same
          checks at accept time keep the page hidden instead of refusing).
"""

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import Producer
from app.services.license_validation import categories_require_license

INVITE_NO_PHOTO = (
    "לא ניתן לשלוח הזמנה לבית עסק ללא תמונה. הוסיפי תמונה אחת לפחות ואז שלחי שוב."
)
INVITE_NO_LICENCE = (
    "לא ניתן לשלוח הזמנה לבית עסק בקטגוריה הדורשת רישיון ייצור ללא מספר רישיון."
    " הוסיפי את מספר הרישיון ואז שלחי שוב."
)


# MEH-3268: what the admin is told is missing when an accepted invite leaves
# the page hidden. Admin-only text, one noun each.
GAP_PHOTO = "תמונה"
GAP_LICENCE = "מספר רישיון"


def content_gaps(db: Session, producer: Producer) -> list[str]:
    """What stops this page going live, in the order the invite gate checks
    it. Empty when complete. One owner for both checks: the invite refuses on
    the first gap (below), acceptance keeps the page hidden on any gap."""
    gaps: list[str] = []
    if not producer.images:
        gaps.append(GAP_PHOTO)
    category_ids = [c.id for c in producer.categories]
    licence_missing = not (producer.producer_license_number or "").strip()
    if licence_missing and categories_require_license(db, category_ids):
        gaps.append(GAP_LICENCE)
    return gaps


def assert_invitable_content(db: Session, producer: Producer) -> None:
    """422 (the approve-time content-gate status, admin.py) when incomplete."""
    gaps = content_gaps(db, producer)
    if GAP_PHOTO in gaps:
        raise HTTPException(status_code=422, detail=INVITE_NO_PHOTO)
    if GAP_LICENCE in gaps:
        raise HTTPException(status_code=422, detail=INVITE_NO_LICENCE)
