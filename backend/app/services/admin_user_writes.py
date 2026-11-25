"""
Module:   admin_user_writes
Purpose:  The admin's changes to one account: the role change (with the
          linked-business and super-admin refusals), the block toggle (which
          hides a live business left with no owner who can sign in), and the
          read-only preview of what a block would take down.
Touches:  users (role, is_blocked), producers through hide_business
          (booking_cancellations), IndexNow scheduling; the audit note on the
          admin's own User (admin_audit.note).
Does NOT: route, authenticate or rate-limit — routers/admin_extra.py keeps
          the routes and require_admin. Does not delete an account
          (services/user_deletion.py) or list accounts (list_users stays in
          the router).
Related:  backend/app/routers/admin_extra.py (update_user_role, block_user,
          block_impact) · backend/app/services/account_guards.py
          (is_super_admin) · backend/app/services/booking_cancellations.py.
History:  MEH-3537 (moved verbatim from routers/admin_extra.py; the rules
          themselves are MEH-955, MEH-2871, MEH-3375, MEH-3376).
"""

from typing import Any
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from app.models import Producer, User
from app.schemas.admin_block import BlockImpactOut  # MEH-3375
from app.schemas.schemas import UserRoleUpdate
from app.services import (
    admin_audit,
    indexnow,  # MEH-2871
)
from app.services.account_guards import is_super_admin
from app.services.booking_cancellations import (  # MEH-2871, MEH-3375
    count_open_bookings,
    hide_business,
)

# Wording approved word for word (rulings 17/11 §א3) — do not edit here.
_DEMOTE_LINKED_OWNER = (
    "אי אפשר להוריד את ההרשאה כל עוד המשתמשת מקושרת לבית עסק. קודם מנתקים את הבעלות."
)


# NEW copy, waiting for Sapir's word-for-word OK (rule 22) — see the PR body.
_PROMOTE_LINKED_OWNER = "אי אפשר לתת הרשאת אדמין למי שמקושרת לבית עסק."


def change_user_role(
    db: Session, user: User, user_id: UUID, data: UserRoleUpdate
) -> dict[str, Any]:
    # Row lock + fresh read (MEH-3376 review): a claim, a register-upgrade or
    # an invite acceptance may link a business to this account between the
    # read and the commit. Those flows lock and re-read the user, so with the
    # lock here too the two cannot interleave into "admin with a business".
    target = (
        db.query(User)
        .filter(User.id == user_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    # MEH-955: never assign role="producer" here. require_producer
    # (auth.py:268-273) gates on role alone, so a manual producer bump
    # without a linked Producer creates an orphan (role=producer,
    # producer_id=NULL) that 404s every /producers/me* handler
    # (producer_me.py:75-76). Producers come only from the atomic register
    # flow (auth.py:511-514 / :619-628), which creates+links the Producer
    # in the same commit.
    if data.role == "producer":
        raise HTTPException(
            status_code=422,
            detail="לא ניתן להפוך משתמשת ל'בעלת עסק' ידנית — הרשמת עסק מתבצעת דרך טופס ההרשמה בלבד.",
        )
    if is_super_admin(target):
        raise HTTPException(
            status_code=403, detail="לא ניתן לשנות הרשאות של האדמין הראשי"
        )
    if target.id == user.id and data.role != "admin":
        raise HTTPException(status_code=403, detail="אדמין לא יכולה להוריד את עצמה")
    # MEH-3376: a business must never be left linked to an account that cannot
    # run it. Demoting to consumer keeps `producer_id`, so the business would
    # stay live with no working owner. Refused, whatever the business status;
    # the way out is «ניתוק בעלים» (detach), then this request passes.
    # MEH-3376 (Sapir 17/11: «בעלת עסק לא יכולה להיות אדמינית»): this route was
    # the one way an account with a business could become an admin —
    # registration (auth.py) and claim (producer_claim.py) already refuse the
    # other direction. An admin with a business loses her dashboard
    # (require_producer gates on role) and cannot be detached later.
    if data.role == "admin" and target.producer_id is not None:
        raise HTTPException(status_code=409, detail=_PROMOTE_LINKED_OWNER)
    if data.role == "consumer" and target.producer_id is not None:
        raise HTTPException(status_code=409, detail=_DEMOTE_LINKED_OWNER)
    admin_audit.note(user, before={"role": target.role}, after={"role": data.role})
    target.role = data.role  # type: ignore[assignment]
    db.commit()
    return {"detail": "Role updated", "role": target.role}


def _business_left_ownerless(db: Session, target: User) -> Producer | None:
    """The live business ``target`` owns, if blocking her leaves it with no
    owner who can still sign in (MEH-2871). A co-owner keeps it up."""
    if target.producer_id is None:
        return None
    producer = db.query(Producer).filter(Producer.id == target.producer_id).first()
    if producer is None or producer.status != "approved":
        return None
    other_owner = (
        db.query(User.id)
        .filter(
            User.producer_id == producer.id,
            User.id != target.id,
            User.is_blocked.is_not(True),
        )
        .first()
    )
    return None if other_owner else producer


def toggle_user_block(
    db: Session, user: User, user_id: UUID, background_tasks: BackgroundTasks
) -> dict[str, Any]:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="אי אפשר לחסום את החשבון שלך")
    target.is_blocked = not bool(target.is_blocked)  # type: ignore[assignment]
    admin_audit.note(user, after={"is_blocked": bool(target.is_blocked)})
    # MEH-2871 (Sapir 18/11): blocking the only owner of a live business takes
    # the business off the site, the way an admin pause does — otherwise it
    # stayed live with nobody able to hand over a bag or answer a booking.
    # Airbnb and Etsy hide a suspended account's listings the same way.
    # Unblocking does not put it back: an admin un-pauses it, through the
    # approval gates (admin.py toggle).
    hidden = None
    cancelled = 0
    if target.is_blocked:
        hidden = _business_left_ownerless(db, target)
        if hidden is not None:
            # MEH-3375: the same count the confirm showed (customers' bookings),
            # read before the cancel. hide_business's own return counts group
            # buys, not their people, so it is not the number she was shown.
            cancelled = count_open_bookings(db, hidden)
            hide_business(db, hidden, background_tasks)
    db.commit()
    if hidden is not None:
        indexnow.schedule(background_tasks, indexnow.producer_urls(hidden))
    return {
        "detail": "Blocked toggled",
        "is_blocked": target.is_blocked,
        "business_hidden": hidden is not None,
        "cancelled": cancelled,
    }


def read_block_impact(db: Session, user_id: UUID) -> BlockImpactOut:
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    business = None if target.is_blocked else _business_left_ownerless(db, target)
    if business is None:
        return BlockImpactOut(business_name=None, open_bookings=0)
    return BlockImpactOut(
        business_name=business.name, open_bookings=count_open_bookings(db, business)
    )
