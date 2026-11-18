"""Extended admin endpoints for the full dashboard:
users management, content (categories + static pages), analytics, settings.

Lives in a separate file from admin.py to keep things readable.

MEH-460 Pkg 1: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

from typing import Any, cast
import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Body, Depends, HTTPException, Query
from sqlalchemy import func, tuple_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.models.admin_ops import AdminAuditLog
from app.services import admin_audit
from app.constants import LICENSE_REQUIRED_CATEGORIES
from app.database import get_db
from app.services.producer_listing import is_business  # MEH-2459
from app.models import (
    AdminSetting,
    Category,
    Event,
    Experience,
    Favorite,
    HomeProduct,
    Producer,
    ProducerCategory,
    ProducerLocation,
    ProducerPageView,
    Report,
    StaticPage,
    User,
)
from app.models.models import (
    CategoryRequest,
    GroupBuy,
    KashrutBadgeRequest,
    OutboundMessage,
    ProducerNameChangeRequest,
    ProducerRecipe,
)
from app.schemas.schemas import (
    CategoryCreate,
    CategoryIn,
    CategoryOut,
    RiskScoreResponse,
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
from app.services.analytics import israel_day_of, server_health, unique_views_count
from app.services import indexnow  # MEH-2871
from app.services.booking_cancellations import hide_business  # MEH-2871
from app.services.category_slug import resolve_unique_slug
from app.services.rescue_no_show import (
    NO_SHOW_BLOCK_AT,
    active_no_show_counts,
)  # MEH-3226
from app.services.user_deletion import delete_user_and_data  # MEH-2585
from app.services.vacation_state import read_vacation_state
from app.services.whatsapp import undelivered_predicate
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now
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
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    target.is_blocked = not bool(target.is_blocked)  # type: ignore[assignment]
    admin_audit.note(user, after={"is_blocked": bool(target.is_blocked)})
    # MEH-2871 (Sapir 18/11): blocking the only owner of a live business takes
    # the business off the site, the way an admin pause does — otherwise it
    # stayed live with nobody able to hand over a bag or answer a booking.
    # Airbnb and Etsy hide a suspended account's listings the same way.
    # Unblocking does not put it back: an admin un-pauses it, through the
    # approval gates (admin.py toggle).
    hidden = None
    if target.is_blocked:
        hidden = _business_left_ownerless(db, target)
        if hidden is not None:
            hide_business(db, hidden, background_tasks)
    db.commit()
    if hidden is not None:
        indexnow.schedule(background_tasks, indexnow.producer_urls(hidden))
    return {
        "detail": "Blocked toggled",
        "is_blocked": target.is_blocked,
        "business_hidden": hidden is not None,
    }


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

    MEH-1571: `LICENSE_REQUIRED_CATEGORIES` (app/constants.py) pins a משרד
    הבריאות licensing requirement to the category NAME, and
    `license_validation.categories_require_license` resolves ids -> names ->
    intersection at request time. Renaming a licensed row here therefore
    dropped it out of the regulatory set silently — no error, no log, and the
    next producer in that category was no longer asked for a license number.
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
        raise HTTPException(status_code=404, detail="Category not found")

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
        # Guard on the row's CURRENT name: that is the value the regulatory
        # lookup matches on today. Checking the INCOMING name instead would
        # invert the guard and let the bypass through.
        if cat.name in LICENSE_REQUIRED_CATEGORIES:
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
        raise HTTPException(status_code=404, detail="Category not found")
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


def _primary_location_points(db: Session, *, limit: int | None = None) -> list[Any]:
    """(producer_id, name, lat, lng) for every approved business that has a
    primary `producer_locations` row with usable coordinates.

    MEH-1938 chunk 5a (Contract): the two admin map surfaces used to read
    `Producer.lat/lng`. Those columns are the Contract target — every other
    reader has moved to the location rows, the geo query and the submit gate
    lost their fallback to them in this same chunk, and chunk 5b drops them.
    Reading the PRIMARY row (not MIN over all rows) keeps the shape the admin
    pages already render: one point per business, at its main location.

    Inner join on purpose: a business with no primary row, or a primary row
    with a cleared pin (the admin path mirrors a clear onto the row rather
    than deleting it — producer_queries.upsert_primary_branch_location),
    has no point to plot and drops out. That is what a NULL column did
    before, plus one population the column never expressed: rows that exist
    but none flagged primary. By the STRICT ruling (02/09) that is a data
    defect to surface, not to paper over with "any row".

    # DO NOT fall back to Producer.lat/lng here — that is the read chunk 5a
    #        exists to remove, and chunk 5b's revision assumes zero readers.
    """
    q = (
        db.query(Producer.id, Producer.name, ProducerLocation.lat, ProducerLocation.lng)
        .join(ProducerLocation, ProducerLocation.producer_id == Producer.id)
        .filter(
            is_business(),  # MEH-2459
            ProducerLocation.is_primary.is_(True),
            ProducerLocation.lat.isnot(None),
            ProducerLocation.lng.isnot(None),
        )
    )
    if limit is not None:
        q = q.limit(limit)
    return cast(list[Any], q.all())


def _last_six_months(now: datetime) -> list[tuple[datetime, datetime]]:
    """[(month_start, next_month_start)] for the last 6 months, oldest first.

    A month starts at 00:00 on day 1 (UTC). `now.replace(day=1)` alone kept the
    request's time of day, so whatever was created on day 1 before that hour
    counted in the month before — on day 1 itself, everything created that day.
    """
    # Step back one calendar month at a time: fixed 30-day steps skipped
    # February and doubled a neighbour whenever it was in the window.
    ref = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    starts = [ref]
    for _ in range(5):
        ref = (ref - timedelta(days=1)).replace(day=1)
        starts.append(ref)
    return [(s, (s + timedelta(days=32)).replace(day=1)) for s in reversed(starts)]


def _counts_per_bucket(
    db: Session,
    id_col: Any,
    created_col: Any,
    buckets: list[tuple[datetime, datetime]],
    *filters: Any,
) -> list[int]:
    """One SELECT for every bucket: count(id) FILTER (WHERE start <= created < end).

    MEH-2553: was one count query per month (Sentry N+1 MEHAMAKOR-BACKEND-25/-1N).
    Same half-open boundaries as before, so the numbers cannot move.
    """
    q = db.query(
        *[
            func.count(id_col).filter(created_col >= start, created_col < end)
            for start, end in buckets
        ]
    )
    if filters:
        q = q.filter(*filters)
    return [int(n or 0) for n in q.one()]


@router.get("/analytics", response_model=None)
def get_analytics(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compact analytics for the admin dashboard."""
    now = utc_now()

    # Time series: producers/users per month for last 6 months
    buckets = _last_six_months(now)
    producer_counts = _counts_per_bucket(
        db,
        Producer.id,
        Producer.created_at,
        buckets,
        Producer.kind == "producer",  # MEH-2465
    )
    user_counts = _counts_per_bucket(db, User.id, User.created_at, buckets)
    months = [
        {"month": ref.strftime("%Y-%m"), "producers": p, "users": u}
        for (ref, _), p, u in zip(buckets, producer_counts, user_counts)
    ]

    # Producers per category
    cat_rows = (
        db.query(Category.name, Category.emoji, func.count(Producer.id))
        .join(Category.producers)
        .filter(is_business())  # MEH-2459
        .group_by(Category.id, Category.name, Category.emoji)
        .order_by(func.count(Producer.id).desc())
        .all()
    )
    by_category = [
        {"name": name, "emoji": emoji, "count": int(count)}
        for name, emoji, count in cat_rows
    ]

    # Producers per city
    city_rows = (
        db.query(Producer.city, func.count(Producer.id))
        .filter(is_business(), Producer.city.isnot(None))  # MEH-2459
        .group_by(Producer.city)
        .order_by(func.count(Producer.id).desc())
        .limit(10)
        .all()
    )
    by_city = [{"city": city, "count": int(count)} for city, count in city_rows]

    # Most-favorited producers (proxy for "most viewed")
    top_rows = (
        db.query(Producer.id, Producer.name, func.count(Favorite.user_id).label("favs"))
        .outerjoin(Favorite, Favorite.producer_id == Producer.id)
        .filter(is_business())  # MEH-2459
        .group_by(Producer.id, Producer.name)
        .order_by(func.count(Favorite.user_id).desc())
        .limit(10)
        .all()
    )
    top_producers = [
        {"id": str(pid), "name": name, "favorites": int(favs)}
        for pid, name, favs in top_rows
    ]

    # Heat map points — one per approved business, at its PRIMARY location.
    # MEH-1938 chunk 5a: read from `producer_locations`, not the
    # `Producer.lat/lng` mirror — those columns are the Contract target and no
    # reader may depend on them. The primary row is the business's "where",
    # so the count stays one-per-business, which is what a heat map wants.
    points = _primary_location_points(db)
    map_points = [
        {"id": str(pid), "name": name, "lat": lat, "lng": lng}
        for pid, name, lat, lng in points
    ]

    return {
        "monthly": months,
        "by_category": by_category,
        "by_city": by_city,
        "top_producers": top_producers,
        "map_points": map_points,
    }


# ============================================================
# SETTINGS
# ============================================================

DEFAULT_SETTINGS = {
    # MEH-1566: `admin_email` + `admin_whatsapp` were removed here — write-only
    # keys with zero readers. Every admin-notification recipient is read from
    # the env-backed settings object (`settings.admin_email` /
    # `settings.admin_whatsapp_to`, backend/app/config.py:85,64), never from
    # this table. Existing rows are left in place and inert, same as below.
    # MEH-1555: `freemium_premium_price` + `freemium_free_image_limit` were
    # removed here — write-only keys with zero readers anywhere in backend or
    # frontend (the /upload/image cap is the hardcoded `>= 3` in
    # routers/upload.py:101, which never consulted the setting). Existing
    # `admin_settings` rows are intentionally left in place: PUT /admin/settings
    # ignores unknown keys, so the orphan rows are inert and no migration runs.
    # MEH-247 — admin-facing holiday + Friday override toggles. Both are
    # persisted server-side so admin A's toggle is visible to admin B on
    # next /admin/settings load. Consumer-side reads happen via the
    # public `GET /holiday-mode` endpoint in main.py (holiday) and
    # `lib/friday-mode.js` on the frontend (Friday — currently localStorage
    # + timezone rule; a public /friday-mode endpoint is TODO).
    "holiday_override_enabled": "false",
    "holiday_override_key": "",
    "friday_mode_override": "false",
    # MEH-509 PR2a: vacation mode. Boolean as string + ISO date as string
    # (matches the existing friday_mode_override pattern). The typed
    # /admin/settings/vacation GET+POST endpoints below wrap the raw
    # str↔bool/date conversion.
    "vacation_mode_active": "false",
    "vacation_return_date": "",
}


@router.get("/settings", response_model=None)
def get_settings(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    rows = db.query(AdminSetting).all()
    saved: dict[Any, Any] = {row.key: row.value for row in rows}
    return {key: saved.get(key, default) for key, default in DEFAULT_SETTINGS.items()}


@router.put("/settings", response_model=None)
def update_settings(
    data: dict[str, Any] = Body(...),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    for key, value in data.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
        if row:
            row.value = str(value) if value is not None else None  # type: ignore[assignment]
        else:
            db.add(
                AdminSetting(key=key, value=str(value) if value is not None else None)
            )
    db.commit()
    return {"detail": "Settings updated"}


# --- MEH-509 PR2a — vacation mode (typed wrapper over AdminSetting) ---------
# Reads/writes the same `admin_settings` table the generic /admin/settings
# endpoints use (one source of truth, no parallel table). The PR2b watchdog
# will consume `vacation_mode_active` to decide which Meta-approved template
# to send.


def _read_vacation_state(db: Session) -> VacationModeState:
    """Pydantic wrapper over the shared `read_vacation_state` helper
    (MEH-662). All str→bool/date conversion + corrupt-state defense
    lives in `app/services/vacation_state.py`; this wrapper only adapts
    the tuple shape into the typed VacationModeState model the admin
    GET/POST endpoints expose."""
    # REUSES: app/services/vacation_state.py:read_vacation_state — single
    # source of truth for AdminSetting str→bool/date + corrupt-state coerce
    # (MEH-662 dedup).
    active, return_date = read_vacation_state(db)
    return VacationModeState(active=active, return_date=return_date)


def _write_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row:
        row.value = value  # type: ignore[assignment]
    else:
        db.add(AdminSetting(key=key, value=value))


@router.get("/settings/vacation", response_model=VacationModeState)
def get_vacation_mode(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> VacationModeState:
    return _read_vacation_state(db)


@router.post("/settings/vacation", response_model=VacationModeState)
def set_vacation_mode(
    body: VacationModeState,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> VacationModeState:
    # VacationModeState's model_validator already rejected active+no-date.
    # When deactivating, clear the date so the persisted state can't drift
    # back into "active with stale date" after a future flip.
    if body.active:
        _write_setting(db, "vacation_mode_active", "true")
        _write_setting(
            db,
            "vacation_return_date",
            cast(date, body.return_date).isoformat(),  # validator: active ⇒ date set
        )
    else:
        _write_setting(db, "vacation_mode_active", "false")
        _write_setting(db, "vacation_return_date", "")
    db.commit()
    return _read_vacation_state(db)


# --- MEH-509 PR3 — producer risk score (read-only admin view) ---------------
# Backed by producers.risk_score + producers.risk_reasoning (PR3 migration
# 92afa3cb76e2). Populated asynchronously by app/services/producer_risk.py
# via BackgroundTasks after producer signup. NULL on both = "not scored yet
# OR Anthropic call failed (fail-open)" — admin UI shows the grey "אין מידע"
# badge in that case.


@router.get("/producers/{producer_id}/risk-score", response_model=RiskScoreResponse)
def get_producer_risk_score(
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> RiskScoreResponse:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return RiskScoreResponse(
        score=producer.risk_score,
        reasoning=producer.risk_reasoning,
    )


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
    now = utc_now()
    week_ago = now - timedelta(days=7)

    # feature/producer-analytics: pending moderation is the sum across
    # six queues (MEH-997 added recipes). Individual counts stay
    # available for the alert cards.
    pending_producers = (
        db.query(func.count(Producer.id)).filter(Producer.status == "pending").scalar()
        or 0
    )
    # MEH-1266: count OPEN reports only (status != resolved|dismissed) so the
    # red dashboard alert + sidebar badge (pending_moderation_count) drop as
    # admins close reports, instead of the all-time inflation they had before.
    open_reports = (
        db.query(func.count(Report.id)).filter(Report.status == "open").scalar() or 0
    )
    flagged_home_products = (
        db.query(func.count(HomeProduct.id))
        .filter(HomeProduct.moderation_status == "FLAGGED")
        .scalar()
        or 0
    )
    pending_experiences = (
        db.query(func.count(Experience.id))
        .filter(Experience.status.in_(["pending", "changes_requested"]))
        .scalar()
        or 0
    )
    pending_kashrut_requests = (
        db.query(func.count(KashrutBadgeRequest.id))
        .filter(KashrutBadgeRequest.status == "pending")
        .scalar()
        or 0
    )
    # MEH-997: recipes were the one moderation queue missing from the
    # sidebar badge (admin_recipes.py shipped in MEH-589 with no UI and
    # no count). Mirrors the experiences pair: pending + awaiting-fix.
    pending_recipes = (
        db.query(func.count(ProducerRecipe.id))
        .filter(ProducerRecipe.moderation_status.in_(["pending", "needs_revision"]))
        .scalar()
        or 0
    )
    # MEH-2359: per-queue counts for the admin home + sidebar — a queue entry
    # is shown only while its count is > 0, so each queue needs its own
    # number, not the aggregate below. `pending_experiences` /
    # `pending_recipes` above also count the OWNER's turn (changes_requested /
    # needs_revision) because the aggregate badge was "work in the queue";
    # the per-queue number must be the ADMIN's turn only, or a queue shows
    # "2 items pending approval" while nothing needs a decision. Same predicate
    # as the default «ממתינים» tab of each page (status == "pending").
    experiences_awaiting_review = (
        db.query(func.count(Experience.id))
        .filter(Experience.status == "pending")
        .scalar()
        or 0
    )
    recipes_awaiting_review = (
        db.query(func.count(ProducerRecipe.id))
        .filter(ProducerRecipe.moderation_status == "pending")
        .scalar()
        or 0
    )
    # Same predicates as the pages they link to (category_requests.py /
    # producer_name_requests.py list `pending`; admin_whatsapp.py lists the
    # undelivered 7-day window).
    pending_category_requests = (
        db.query(func.count(CategoryRequest.id))
        .filter(CategoryRequest.status == "pending")
        .scalar()
        or 0
    )
    pending_name_change_requests = (
        db.query(func.count(ProducerNameChangeRequest.id))
        .filter(ProducerNameChangeRequest.status == "pending")
        .scalar()
        or 0
    )
    undelivered_whatsapp_7d = (
        db.query(func.count(OutboundMessage.id))
        .filter(undelivered_predicate(OutboundMessage, now))  # MEH-2122 Chunk E
        .scalar()
        or 0
    )
    pending_moderation_count = int(
        pending_producers
        + open_reports
        + flagged_home_products
        + pending_experiences
        + pending_kashrut_requests
        + pending_recipes
    )

    stats = {
        # MEH-2465: «בתי עסק» counts businesses — organizers are not one.
        "total_producers": db.query(func.count(Producer.id))
        .filter(Producer.kind == "producer")
        .scalar()
        or 0,
        "approved_producers": db.query(func.count(Producer.id))
        .filter(is_business())  # MEH-2459
        .scalar()
        or 0,
        "pending_producers": int(pending_producers),
        "new_producers_this_week": db.query(func.count(Producer.id))
        .filter(Producer.created_at >= week_ago, Producer.kind == "producer")
        .scalar()
        or 0,
        "total_users": db.query(func.count(User.id)).scalar() or 0,
        "new_users_this_week": db.query(func.count(User.id))
        .filter(User.created_at >= week_ago)
        .scalar()
        or 0,
        "total_home_products": db.query(func.count(HomeProduct.id))
        .filter(HomeProduct.is_active.is_(True))
        .scalar()
        or 0,
        "hidden_home_products": db.query(func.count(HomeProduct.id))
        .filter(HomeProduct.is_hidden.is_(True))
        .scalar()
        or 0,
        "open_reports": int(open_reports),
        # MEH-1267: real group-buys count replaces the hardcoded "›" placeholder
        # on the admin dashboard card.
        "total_group_buys": db.query(func.count(GroupBuy.id)).scalar() or 0,
        "total_events": db.query(func.count(Event.id)).scalar() or 0,
        "total_experiences": db.query(func.count(Experience.id)).scalar() or 0,
        "flagged_home_products": int(flagged_home_products),
        "pending_experiences": int(pending_experiences),
        "pending_kashrut_requests": int(pending_kashrut_requests),
        "pending_recipes": int(pending_recipes),
        "pending_category_requests": int(pending_category_requests),
        "pending_name_change_requests": int(pending_name_change_requests),
        "undelivered_whatsapp_7d": int(undelivered_whatsapp_7d),
        "experiences_awaiting_review": int(experiences_awaiting_review),
        "recipes_awaiting_review": int(recipes_awaiting_review),
        "pending_moderation_count": pending_moderation_count,
    }

    pending = (
        db.query(Producer)
        .filter(Producer.status == "pending")
        .order_by(Producer.created_at.desc())
        .limit(5)
        .all()
    )
    pending_list = [
        {
            "id": str(p.id),
            "name": p.name,
            "city": p.city,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in pending
    ]

    recent = db.query(Producer).order_by(Producer.created_at.desc()).limit(5).all()
    recent_activity = [
        {
            "type": "producer_added",
            "id": str(p.id),
            "name": p.name,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in recent
    ]

    # Per-month for last 6 months
    buckets = _last_six_months(now)
    producer_counts = _counts_per_bucket(
        db,
        Producer.id,
        Producer.created_at,
        buckets,
        Producer.kind == "producer",  # MEH-2465
    )
    months = [
        {"month": ref.strftime("%Y-%m"), "producers": n}
        for (ref, _), n in zip(buckets, producer_counts)
    ]

    # MEH-1938 chunk 5a: primary-location rows, not Producer.lat/lng — see
    # _primary_location_points. The 200 cap is the pre-existing one.
    map_points = [
        {"id": str(pid), "name": name, "lat": lat, "lng": lng}
        for pid, name, lat, lng in _primary_location_points(db, limit=200)
    ]

    # ---- feature/producer-analytics additions ----

    # Daily active users over last 30 days (zero-filled).
    # Source: users.last_active_at — updated by the tiny middleware in
    # main.py on every authenticated request. Pre-existing users who
    # haven't made a request since the column was added won't count
    # until they touch the API.
    # MEH-1894: same three-part Israel-day alignment as the producer-side
    # series (producer_me.py). last_active_at is a NAIVE UTC column
    # (models.py:504), so the bucket is labelled UTC and then converted to
    # Israel local before func.date() cuts the day — otherwise the boundary
    # sits at midnight UTC (02:00/03:00 Israel) and a 00:30 session counts as
    # yesterday. The cutoff is Israel midnight expressed back in naive UTC, so
    # the oldest bucket keeps its first 2-3 hours.
    today = israel_today()
    dau_cutoff = (
        datetime.combine(
            today - timedelta(days=29), datetime.min.time(), tzinfo=ISRAEL_TZ
        )
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    israel_day = func.date(
        func.timezone("Asia/Jerusalem", func.timezone("UTC", User.last_active_at))
    )
    dau_rows = (
        db.query(
            israel_day.label("day"),
            func.count(func.distinct(User.id)).label("count"),
        )
        .filter(User.last_active_at.isnot(None), User.last_active_at >= dau_cutoff)
        .group_by(israel_day)
        .all()
    )
    by_day = {str(r.day): int(r.count) for r in dau_rows}
    daily_active_users = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        daily_active_users.append(
            {"date": d.isoformat(), "count": by_day.get(d.isoformat(), 0)}
        )

    # Top 10 cities across ALL producer page views (where city is set).
    # MEH-160: same unit as the per-producer dashboard — one visitor per
    # business per Israel calendar day — via the single dedupe expression in
    # services/analytics.py.
    #
    # `scope_col` is what makes that claim true, and it is not decoration.
    # This query spans EVERY producer, so without the producer in the dedupe
    # key one visitor who opened five Haifa businesses on one day would
    # collapse to a single Haifa view — "distinct people per city", a
    # different metric wearing the same label, and no longer the sum of the
    # per-producer figures. An earlier version of this comment claimed "the
    # same unit" while computing exactly that; caught in adversarial review.
    admin_city_views = unique_views_count(
        israel_day_of(ProducerPageView.created_at),
        scope_col=ProducerPageView.producer_id,
    )
    top_city_rows = (
        db.query(
            ProducerPageView.city,
            admin_city_views.label("count"),
        )
        .filter(ProducerPageView.city.isnot(None))
        .group_by(ProducerPageView.city)
        .order_by(admin_city_views.desc())
        .limit(10)
        .all()
    )
    top_cities = [
        {"city": r.city, "count": int(r.count)}  # type: ignore[call-overload]  # labelled column, not tuple.count
        for r in top_city_rows
    ]

    return {
        "stats": stats,
        "pending_producers": pending_list,
        "recent_activity": recent_activity,
        "monthly_producers": months,
        "map_points": map_points,
        "daily_active_users": daily_active_users,
        "top_cities": top_cities,
        "server_health": server_health(),
    }
