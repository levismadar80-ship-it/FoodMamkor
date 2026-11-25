"""Extended admin endpoints for the full dashboard:
users management, content (categories + static pages), analytics, settings.

Lives in a separate file from admin.py to keep things readable.

MEH-460 Pkg 1: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

from typing import Any
import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from sqlalchemy import func, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.models.admin_ops import AdminAuditLog
from app.services import admin_audit
from app.database import get_db
from app.models import (
    Category,
    Favorite,
    Producer,
    ProducerCategory,
    StaticPage,
    User,
)
from app.schemas.admin_block import BlockImpactOut  # MEH-3375
from app.schemas.schemas import (
    CategoryCreate,
    CategoryIn,
    CategoryOut,
    StaticPageOut,
    StaticPageUpdate,
    UserAdminOut,
    UserRoleUpdate,
    VacationModeState,
)
from app.services.account_guards import (  # MEH-3248: moved here, re-exported
    assert_deletable,
    is_super_admin,
)
from app.services import indexnow  # MEH-2871
from app.services.booking_cancellations import (  # MEH-2871, MEH-3375
    count_open_bookings,
    hide_business,
)
from app.services.category_slug import resolve_unique_slug
from app.services.group_buy_no_show import (  # MEH-3735
    group_buy_active_no_show_counts as group_buy_no_show_counts,
)
from app.services.rescue_no_show import (
    NO_SHOW_BLOCK_AT,
    active_no_show_counts,
)  # MEH-3226
from app.services.admin_dashboard import build_analytics, build_dashboard  # MEH-3538
from app.services.admin_settings import (  # MEH-3538
    read_settings,
    read_vacation_mode,
    write_settings,
    write_vacation_mode,
)
from app.services.user_deletion import delete_user_and_data  # MEH-2585
from app.utils.clock import utc_now
from app.utils.sql import LIKE_ESCAPE, escape_like

router = APIRouter(prefix="/admin", tags=["admin-extra"])
logger = logging.getLogger(__name__)


# MEH-1571: shared Hebrew copy for the two update_category guards. Named
# constants rather than inline strings at the raise site — REUSES:
# backend/app/services/license_validation.py:27 (LICENSE_REQUIRED_ERROR_HE),
# the same pattern for the same regulatory surface. Mirrored in
# frontend/messages/{he,en}.json under admin.content.categories.
#
# DO NOT soften the rename message into "try a different name" — it must say
# WHY the rename is refused (a licensing requirement) and WHERE it belongs
# (a migration), or the admin retries in the UI and files a bug instead.
#
# The closing sentence says «הסמל» and not «האימוג'י» (Sapir, 06/09, rule 22):
# MEH-2163 moves the category glyphs to a slug-keyed registry, so the word
# "emoji" names an implementation that is on its way out. Same amendment, same
# reason, as CATEGORY_SYSTEM_RENAME_ERROR_HE below. English twin in en.json:
# "The symbol can still be updated."
CATEGORY_LICENSE_RENAME_ERROR_HE = (
    "לקטגוריה הזאת יש דרישת רישיון של משרד הבריאות שמזוהה לפי השם. "
    "שינוי השם מבטל את הדרישה עבור בתי העסק בקטגוריה, ולכן הוא נעשה במיגרציה "
    "ולא במסך הניהול. אפשר לעדכן את הסמל."
)
CATEGORY_NAME_TAKEN_ERROR_HE = "קטגוריה בשם זה כבר קיימת"

# MEH-1456 chunk 2b — the seeded rows declare their own ownership
# (`categories.is_system`, revision b7d3e5a9c1f4). Same shape as the licensing
# guard above and for the same reason: a rename or a delete of a seed row is a
# reviewed, reversible Alembic revision (the MEH-927 pattern), not a text field
# in the admin panel. Industry precedent on the card §2.6 — Oracle Siebel
# "Protect Seed Data", IBM RDU `WRITE_PROTECTED`: ownership is a column on the
# row, never a hardcoded list in application code.
#
# No escape hatch in v1, deliberately. Siebel and IBM both ship one; here a
# second authority over the same row is exactly what this closes, and the
# sanctioned path already exists (a migration).
#
# Copy approved by Sapir 06/09 (rule 22), with one amendment she made on
# approval: the closing sentence says «הסמל» and not «האימוג'י», because
# MEH-2163 moves the category glyphs to a slug-keyed registry and the word
# "emoji" goes stale the day that lands. English twin, approved with it:
# "This is a system category — its name is set in code and changes only in a
# migration, not in the admin screen. The symbol can still be updated."
# Recorded here rather than as an en.json key because nothing reads such a
# mirror (the MEH-1571 pair at the top of this block has one and it is dead).
CATEGORY_SYSTEM_RENAME_ERROR_HE = (
    "זו קטגוריית מערכת — השם שלה נקבע בקוד ומשתנה רק במיגרציה, "
    "לא במסך הניהול. אפשר לעדכן את הסמל."
)
CATEGORY_SYSTEM_DELETE_ERROR_HE = (
    "זו קטגוריית מערכת ואי אפשר למחוק אותה ממסך הניהול. הסרה נעשית במיגרציה."
)


# ============================================================
# USERS
# ============================================================


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    search: str | None = None,
    role: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[UserAdminOut]:
    q = db.query(User)
    if search:
        # F13 (MEH-1188): escape LIKE metacharacters so a user-supplied % / _
        # matches literally instead of acting as a wildcard (same class as F1).
        like = f"%{escape_like(search)}%"
        q = q.filter(
            User.email.ilike(like, escape=LIKE_ESCAPE)
            | User.name.ilike(like, escape=LIKE_ESCAPE)
        )
    if role and role != "all":
        q = q.filter(User.role == role)
    users = q.order_by(User.created_at.desc()).limit(500).all()

    fav_counts: dict[Any, int] = dict(
        db.query(Favorite.user_id, func.count(Favorite.producer_id))  # type: ignore[arg-type]  # Row is a tuple at runtime
        .group_by(Favorite.user_id)
        .all()
    )
    # MEH-3226: one grouped query, the same count the reserve gate reads.
    no_shows = active_no_show_counts(db, [u.id for u in users])  # type: ignore[misc]
    gb_no_shows = group_buy_no_show_counts(db, [u.id for u in users])  # MEH-3735
    out = []
    for u in users:
        out.append(
            UserAdminOut(
                id=u.id,
                email=u.email,
                name=u.name,
                city=u.city,
                phone=u.phone,
                role=u.role,
                is_blocked=bool(u.is_blocked),
                # MEH-2890: the page hides role/delete actions on this row; it
                # no longer carries the address itself.
                is_super_admin=is_super_admin(u),
                producer_id=u.producer_id,
                favorites_count=fav_counts.get(u.id, 0),
                rescue_active_no_shows=no_shows.get(u.id, 0),
                rescue_blocked=no_shows.get(u.id, 0) >= NO_SHOW_BLOCK_AT,
                group_buy_active_no_shows=gb_no_shows.get(u.id, 0),
                group_buy_blocked=gb_no_shows.get(u.id, 0) >= NO_SHOW_BLOCK_AT,
                created_at=u.created_at or utc_now(),
            )
        )
    return out


# Wording approved word for word (rulings 17/11 §א3) — do not edit here.
_DEMOTE_LINKED_OWNER = (
    "אי אפשר להוריד את ההרשאה כל עוד המשתמשת מקושרת לבית עסק. קודם מנתקים את הבעלות."
)


# NEW copy, waiting for Sapir's word-for-word OK (rule 22) — see the PR body.
_PROMOTE_LINKED_OWNER = "אי אפשר לתת הרשאת אדמין למי שמקושרת לבית עסק."


@router.put("/users/{user_id}/role", response_model=None)
def update_user_role(
    user_id: UUID,
    data: UserRoleUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
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


@router.post("/users/{user_id}/block", response_model=None)
def block_user(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
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


@router.get("/users/{user_id}/block-impact", response_model=BlockImpactOut)
def block_impact(
    user_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> BlockImpactOut:
    """MEH-3375: what blocking ``user_id`` would take down, read before the
    admin confirms — the business that would be hidden (same rule as
    block_user) and how many open bookings would be cancelled and mailed.
    Reads only. Already blocked → nothing (the next click unblocks)."""
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    business = None if target.is_blocked else _business_left_ownerless(db, target)
    if business is None:
        return BlockImpactOut(business_name=None, open_bookings=0)
    return BlockImpactOut(
        business_name=business.name, open_bookings=count_open_bookings(db, business)
    )


@router.get("/audit-log", response_model=None)
def list_audit_log(
    limit: int = Query(50, ge=1, le=200),
    before: datetime | None = None,
    before_id: UUID | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """MEH-3306: the admin audit log, newest first. `before` pages back by
    `created_at`; with `before_id` too (the last row's id) it is a keyset
    cursor on (created_at, id), so two rows sharing one created_at at a page
    boundary are not skipped. The stored IP is not returned: it is kept for an
    investigation, not for a list. `actor_email` is looked up in one query
    for the page, and is None when that account no longer exists (actor_id
    is not a FK, on purpose — models/admin_ops.py)."""
    query = db.query(AdminAuditLog)
    if before is not None and before_id is not None:
        query = query.filter(
            tuple_(AdminAuditLog.created_at, AdminAuditLog.id) < (before, before_id)
        )
    elif before is not None:
        query = query.filter(AdminAuditLog.created_at < before)
    rows = (
        query.order_by(AdminAuditLog.created_at.desc(), AdminAuditLog.id.desc())
        .limit(limit)
        .all()
    )
    actor_ids = {r.actor_id for r in rows}
    emails: dict[Any, str | None] = {}
    if actor_ids:
        rows_found = db.query(User.id, User.email).filter(User.id.in_(actor_ids)).all()
        emails = {row_id: email for row_id, email in rows_found}
    return {
        "items": [
            {
                "id": str(r.id),
                "actor_id": str(r.actor_id),
                "actor_email": emails.get(r.actor_id),
                "action": r.action,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "details": r.details,
                "created_at": r.created_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.delete("/users/{user_id}", response_model=None)
def admin_delete_user(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """MEH-2585: hard-delete a user and her data — same cascade as the
    self-service POST /auth/me/delete (services/user_deletion.py), minus the
    confirmation email (an admin removal, often of a test account).

    Admins are refused: demote first, so removing an admin is always two
    deliberate steps and the protected super-admin can never be deleted.
    """
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="אי אפשר למחוק את עצמך מכאן")
    # MEH-3248: one rule for both doors (services/account_guards.py).
    assert_deletable(target, door="admin")
    # Irreversible, so leave a trail in the Railway logs: ids only, no email.
    logger.info(
        "[admin.delete_user] admin_id=%s deleted user_id=%s role=%s producer_id=%s",
        user.id,
        target.id,
        target.role,
        target.producer_id,
    )
    delete_user_and_data(db, target, background_tasks, context="admin.delete_user")
    return {"detail": "User deleted"}


@router.get("/users/{user_id}/favorites", response_model=None)
def user_favorites(
    user_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any] | list[dict[str, str | Any | None]]:
    favs = db.query(Favorite).filter(Favorite.user_id == user_id).all()
    return [
        {
            "producer_id": str(f.producer_id),
            "producer_name": f.producer.name if f.producer else None,
            "created_at": f.created_at.isoformat() if f.created_at else None,
        }
        for f in favs
    ]


# ============================================================
# CONTENT — categories CRUD + static pages
# ============================================================


@router.get("/categories", response_model=list[CategoryOut])
def list_categories_admin(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> list[CategoryOut]:
    # MEH-1034: annotate each category with its producer count in ONE query
    # (outerjoin + group_by — no N+1). Query-time only; no DB column.
    rows = (
        db.query(Category, func.count(ProducerCategory.producer_id))
        .outerjoin(ProducerCategory, ProducerCategory.category_id == Category.id)
        .group_by(Category.id)
        .order_by(Category.id)
        .all()
    )
    categories = []
    for cat, producer_count in rows:
        cat.producer_count = producer_count
        categories.append(cat)
    return categories


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    data: CategoryCreate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CategoryOut | Category:
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(status_code=400, detail="קטגוריה בשם זה כבר קיימת")
    # MEH-2139 chunk 2: the column default (models.py) already derives a slug
    # from the name, so this line would work without the argument. It is passed
    # explicitly HERE because this is the one writer whose input is arbitrary
    # user text — the default cannot query the session to dodge a collision, and
    # a collision would surface as a 500 from the UNIQUE constraint instead of a
    # category that simply got `-2` appended.
    cat = Category(
        name=data.name,
        emoji=data.emoji,
        slug=resolve_unique_slug(db, data.name),
        requires_license=data.requires_license,  # MEH-3255
    )
    db.add(cat)
    # MEH-2139: `resolve_unique_slug` above is a SELECT and this is the INSERT,
    # so the two are not atomic — a concurrent create whose name transliterates
    # to the same base slug can pass the same check and take the slug first.
    # Both requests then insert the same value and the loser hits
    # `uq_categories_slug` as an unhandled IntegrityError -> 500 with a psycopg2
    # message. The window is small and the admin team is one person, so this is
    # unlikely rather than impossible; it is handled because a 500 here is
    # indistinguishable from the app being broken, while 409 says what happened.
    #
    # Deliberately NOT a retry loop: a second attempt would need a fresh
    # `resolve_unique_slug` on a rolled-back session and could lose the race
    # again, which trades a clear error for an unbounded one. The admin retries
    # the request and `-2` is free by then.
    #
    # `rollback()` is required, not tidiness — the session is unusable after an
    # IntegrityError, and returning without it poisons the next request that
    # borrows this connection.
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="הקטגוריה נוצרה במקביל בבקשה אחרת. נסי שוב.",
        ) from None
    db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    data: CategoryIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> CategoryOut | Category:
    """Rename / re-emoji a category. Two guards, both on the rename path only.

    MEH-1571: the licensing requirement used to be pinned to the category NAME
    (`LICENSE_REQUIRED_CATEGORIES`), so renaming a licensed row dropped it out
    of the regulatory set silently. Since MEH-3255 the row's own
    `requires_license` column decides and a rename no longer changes the
    answer, but the guard stays: a licensed row keeps its name so an admin
    cannot relabel a regulated category into something it is not.
    The rename is refused; re-keying the taxonomy belongs in a reviewed,
    reversible Alembic revision (the MEH-927 pattern), which writes raw SQL and
    does not pass through this endpoint.

    The second guard is the `categories_name_key` collision: this handler wrote
    the new name with no pre-check, so renaming onto a name another row already
    holds surfaced as an unhandled IntegrityError -> 500. `create_category`
    above has always pre-checked; this mirrors it.
    """
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="הקטגוריה לא נמצאה")

    # Emoji-only edits skip both guards — nothing about the licensing lookup or
    # the UNIQUE constraint depends on the emoji.
    if data.name != cat.name:
        # MEH-1456 chunk 2b: ownership first. Every LICENSE_REQUIRED_CATEGORIES
        # name is also a seeded row, so the licensing guard below would answer
        # for both and tell an admin about a licensing requirement when the
        # actual reason is that the row belongs to the seed. Specific before
        # general — and an unlicensed seed row (most of the 18) reaches only
        # this one.
        if cat.is_system:
            raise HTTPException(status_code=422, detail=CATEGORY_SYSTEM_RENAME_ERROR_HE)
        # MEH-3255: the licence rule now reads the row's column, so a rename
        # no longer moves a category out of it. The guard stays (a licensed
        # category keeps its name, as before), keyed on the column.
        if cat.requires_license:
            raise HTTPException(
                status_code=422, detail=CATEGORY_LICENSE_RENAME_ERROR_HE
            )
        # REUSES: backend/app/routers/admin_extra.py:198 — create_category's
        # duplicate-name SELECT. Same shape, scoped to OTHER rows so re-saving
        # a row under its own name is not a false collision.
        if (
            db.query(Category)
            .filter(Category.name == data.name, Category.id != cat.id)
            .first()
        ):
            raise HTTPException(status_code=422, detail=CATEGORY_NAME_TAKEN_ERROR_HE)

    cat.name = data.name  # type: ignore[assignment]
    cat.emoji = data.emoji  # type: ignore[assignment]
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}", response_model=None)
def delete_category(
    category_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="הקטגוריה לא נמצאה")
    # MEH-1456 chunk 2b: a seeded row is not deletable from here even when the
    # MEH-1297 count below is zero — an empty system category is still the
    # taxonomy's, and removing it is a migration. Ordered first so the admin is
    # told the real reason instead of "0 businesses are linked".
    if cat.is_system:
        raise HTTPException(status_code=422, detail=CATEGORY_SYSTEM_DELETE_ERROR_HE)
    # MEH-1297: block deleting a category still linked to producers — a silent
    # cascade would orphan those businesses (uncategorised → invisible).
    linked = (
        db.query(func.count(ProducerCategory.producer_id))
        .filter(ProducerCategory.category_id == category_id)
        .scalar()
    )
    if linked:
        raise HTTPException(
            status_code=409,
            detail=f"לא ניתן למחוק — {linked} בתי עסק משויכים לקטגוריה זו",
        )
    db.delete(cat)
    db.commit()
    return {"detail": "Category deleted"}


@router.get("/pages/{slug}", response_model=StaticPageOut)
def get_static_page(
    slug: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StaticPageOut | StaticPage:
    page = db.query(StaticPage).filter(StaticPage.slug == slug).first()
    if not page:
        # Auto-create empty page on first access so editor has something to edit
        page = StaticPage(slug=slug, title=slug, body="")
        db.add(page)
        db.commit()
        db.refresh(page)
    return page


@router.put("/pages/{slug}", response_model=StaticPageOut)
def update_static_page(
    slug: str,
    data: StaticPageUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> StaticPageOut | StaticPage:
    page = db.query(StaticPage).filter(StaticPage.slug == slug).first()
    if not page:
        page = StaticPage(slug=slug, title=data.title, body=data.body)
        db.add(page)
    else:
        page.title = data.title  # type: ignore[assignment]
        page.body = data.body  # type: ignore[assignment]
    db.commit()
    db.refresh(page)
    return page


# ============================================================
# ANALYTICS
# ============================================================


@router.get("/analytics", response_model=None)
def get_analytics(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compact analytics for the admin dashboard."""
    return build_analytics(db)


# ============================================================
# SETTINGS
# ============================================================

# The known keys and their defaults: app/services/admin_settings.py
# (DEFAULT_SETTINGS, MEH-3538).


@router.get("/settings", response_model=None)
def get_settings(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    return read_settings(db)


@router.put("/settings", response_model=None)
def update_settings(
    data: dict[str, Any] = Body(...),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    write_settings(db, data)
    return {"detail": "Settings updated"}


# --- MEH-509 PR2a — vacation mode (typed wrapper over AdminSetting) ---------
# Logic: app/services/admin_settings.py (read_vacation_mode /
# write_vacation_mode, MEH-3538).


@router.get("/settings/vacation", response_model=VacationModeState)
def get_vacation_mode(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> VacationModeState:
    return read_vacation_mode(db)


@router.post("/settings/vacation", response_model=VacationModeState)
def set_vacation_mode(
    body: VacationModeState,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> VacationModeState:
    return write_vacation_mode(db, body)


@router.post("/settings/test/{service}", response_model=None)
def test_service(
    service: str,
    user: User = Depends(require_admin),
) -> dict[str, Any]:
    """Smoke-test integrations. Returns ok=true/false without raising."""
    from app.config import settings as cfg

    if service == "whatsapp":
        ok = bool(cfg.whatsapp_phone_number_id and cfg.whatsapp_access_token)
        return {"ok": ok, "configured": ok, "service": "whatsapp"}
    if service == "cloudinary":
        ok = bool(
            cfg.cloudinary_cloud_name
            and cfg.cloudinary_api_key
            and cfg.cloudinary_api_secret
        )
        return {"ok": ok, "configured": ok, "service": "cloudinary"}
    raise HTTPException(status_code=400, detail="שירות לא מוכר")


# ============================================================
# DASHBOARD SUMMARY (used by /admin home page)
# ============================================================


@router.get("/dashboard", response_model=None)
def get_dashboard(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Single endpoint that returns everything the dashboard needs."""
    return build_dashboard(db)
