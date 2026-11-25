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
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.models.admin_ops import AdminAuditLog
from app.database import get_db
from app.models import (
    Category,
    Favorite,
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
from app.services.admin_category_writes import (  # MEH-3537
    create_category_row,
    delete_category_row,
    update_category_row,
)
from app.services.admin_user_writes import (  # MEH-3537
    change_user_role,
    read_block_impact,
    toggle_user_block,
)
from app.utils.clock import utc_now
from app.utils.sql import LIKE_ESCAPE, escape_like

router = APIRouter(prefix="/admin", tags=["admin-extra"])
logger = logging.getLogger(__name__)


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


@router.put("/users/{user_id}/role", response_model=None)
def update_user_role(
    user_id: UUID,
    data: UserRoleUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # MEH-3537: the rules live in services/admin_user_writes.py.
    return change_user_role(db, user, user_id, data)


@router.post("/users/{user_id}/block", response_model=None)
def block_user(
    user_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # MEH-3537: the rules live in services/admin_user_writes.py.
    return toggle_user_block(db, user, user_id, background_tasks)


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
    # MEH-3537: the rules live in services/admin_user_writes.py.
    return read_block_impact(db, user_id)


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
    # MEH-3537: the rules live in services/admin_category_writes.py.
    return create_category_row(db, data)


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
    # MEH-3537: the rules live in services/admin_category_writes.py.
    return update_category_row(db, category_id, data)


@router.delete("/categories/{category_id}", response_model=None)
def delete_category(
    category_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # MEH-3537: the rules live in services/admin_category_writes.py.
    return delete_category_row(db, category_id)


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
