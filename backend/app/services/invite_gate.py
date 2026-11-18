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
History:  MEH-3246 (grill B9, creation).
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


def assert_invitable_content(db: Session, producer: Producer) -> None:
    """422 (the approve-time content-gate status, admin.py) when incomplete."""
    if not producer.images:
        raise HTTPException(status_code=422, detail=INVITE_NO_PHOTO)
    category_ids = [c.id for c in producer.categories]
    licence_missing = not (producer.producer_license_number or "").strip()
    if licence_missing and categories_require_license(db, category_ids):
        raise HTTPException(status_code=422, detail=INVITE_NO_LICENCE)
