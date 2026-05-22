"""Extended admin endpoints for the full dashboard:
users management, content (categories + static pages), analytics, settings.

Lives in a separate file from admin.py to keep things readable.

MEH-460 Pkg 1: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.
"""

from datetime import date, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import (
    AdminSetting,
    Category,
    Event,
    Experience,
    Favorite,
    HomeProduct,
    Producer,
    ProducerPageView,
    Report,
    StaticPage,
    User,
)
from app.models.models import KashrutBadgeRequest
from app.schemas.schemas import (
    CategoryIn,
    CategoryOut,
    StaticPageOut,
    StaticPageUpdate,
    UserAdminOut,
    UserRoleUpdate,
    VacationModeState,
)
from app.services.analytics import server_health

router = APIRouter(prefix="/admin", tags=["admin-extra"])

SUPER_ADMIN_EMAIL = "levismadar80@gmail.com"


# ============================================================
# USERS
# ============================================================


@router.get("/users", response_model=list[UserAdminOut])
def list_users(
    search: str | None = None,
    role: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(User)
    if search:
        like = f"%{search}%"
        q = q.filter((User.email.ilike(like)) | (User.name.ilike(like)))
    if role and role != "all":
        q = q.filter(User.role == role)
    users = q.order_by(User.created_at.desc()).limit(500).all()

    fav_counts = dict(
        db.query(Favorite.user_id, func.count(Favorite.producer_id))
        .group_by(Favorite.user_id)
        .all()
    )
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
                producer_id=u.producer_id,
                favorites_count=fav_counts.get(u.id, 0),
                created_at=u.created_at or datetime.utcnow(),
            )
        )
    return out


@router.put("/users/{user_id}/role")
def update_user_role(
    user_id: UUID,
    data: UserRoleUpdate,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if target.email == SUPER_ADMIN_EMAIL:
        raise HTTPException(
            status_code=403, detail="לא ניתן לשנות הרשאות של האדמין הראשי"
        )
    if target.id == user.id and data.role != "admin":
        raise HTTPException(status_code=403, detail="אדמין לא יכולה להוריד את עצמה")
    target.role = data.role
    db.commit()
    return {"detail": "Role updated", "role": target.role}


@router.post("/users/{user_id}/block")
def block_user(
    user_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Cannot block yourself")
    target.is_blocked = not bool(target.is_blocked)
    db.commit()
    return {"detail": "Blocked toggled", "is_blocked": target.is_blocked}


@router.get("/users/{user_id}/favorites")
def user_favorites(
    user_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
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
):
    return db.query(Category).order_by(Category.id).all()


@router.post("/categories", response_model=CategoryOut, status_code=201)
def create_category(
    data: CategoryIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if db.query(Category).filter(Category.name == data.name).first():
        raise HTTPException(status_code=400, detail="קטגוריה בשם זה כבר קיימת")
    cat = Category(name=data.name, emoji=data.emoji)
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{category_id}", response_model=CategoryOut)
def update_category(
    category_id: int,
    data: CategoryIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    cat.name = data.name
    cat.emoji = data.emoji
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{category_id}")
def delete_category(
    category_id: int,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    cat = db.query(Category).filter(Category.id == category_id).first()
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(cat)
    db.commit()
    return {"detail": "Category deleted"}


@router.get("/pages/{slug}", response_model=StaticPageOut)
def get_static_page(
    slug: str,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
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
):
    page = db.query(StaticPage).filter(StaticPage.slug == slug).first()
    if not page:
        page = StaticPage(slug=slug, title=data.title, body=data.body)
        db.add(page)
    else:
        page.title = data.title
        page.body = data.body
    db.commit()
    db.refresh(page)
    return page


# ============================================================
# ANALYTICS
# ============================================================


@router.get("/analytics")
def get_analytics(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Compact analytics for the admin dashboard."""
    now = datetime.utcnow()

    # Time series: producers/users per month for last 6 months
    months = []
    for i in range(5, -1, -1):
        ref = (now.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        next_month = (ref + timedelta(days=32)).replace(day=1)
        producers = (
            db.query(func.count(Producer.id))
            .filter(Producer.created_at >= ref, Producer.created_at < next_month)
            .scalar()
        )
        users = (
            db.query(func.count(User.id))
            .filter(User.created_at >= ref, User.created_at < next_month)
            .scalar()
        )
        months.append(
            {
                "month": ref.strftime("%Y-%m"),
                "producers": int(producers or 0),
                "users": int(users or 0),
            }
        )

    # Producers per category
    cat_rows = (
        db.query(Category.name, Category.emoji, func.count(Producer.id))
        .join(Category.producers)
        .filter(Producer.status == "approved")
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
        .filter(Producer.status == "approved", Producer.city.isnot(None))
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
        .filter(Producer.status == "approved")
        .group_by(Producer.id, Producer.name)
        .order_by(func.count(Favorite.user_id).desc())
        .limit(10)
        .all()
    )
    top_producers = [
        {"id": str(pid), "name": name, "favorites": int(favs)}
        for pid, name, favs in top_rows
    ]

    # Heat map points
    points = (
        db.query(Producer.id, Producer.name, Producer.lat, Producer.lng)
        .filter(
            Producer.status == "approved",
            Producer.lat.isnot(None),
            Producer.lng.isnot(None),
        )
        .all()
    )
    map_points = [
        {"id": str(p.id), "name": p.name, "lat": p.lat, "lng": p.lng} for p in points
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
    "admin_email": "",
    "admin_whatsapp": "",
    "freemium_premium_price": "0",
    "freemium_free_image_limit": "3",
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


@router.get("/settings")
def get_settings(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(AdminSetting).all()
    saved = {row.key: row.value for row in rows}
    return {key: saved.get(key, default) for key, default in DEFAULT_SETTINGS.items()}


@router.put("/settings")
def update_settings(
    data: dict = Body(...),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    for key, value in data.items():
        if key not in DEFAULT_SETTINGS:
            continue
        row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
        if row:
            row.value = str(value) if value is not None else None
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
    rows = {
        r.key: r.value
        for r in db.query(AdminSetting).filter(
            AdminSetting.key.in_(["vacation_mode_active", "vacation_return_date"])
        )
    }
    active = (rows.get("vacation_mode_active") or "false").lower() == "true"
    return_date_raw = rows.get("vacation_return_date") or ""
    return_date: date | None = None
    if active and return_date_raw:
        try:
            return_date = date.fromisoformat(return_date_raw)
        except ValueError:
            # Corrupt persisted value — surface as inactive rather than 500
            # the GET. PR2b watchdog will skip vacation send if active=false.
            return VacationModeState(active=False, return_date=None)
    return VacationModeState(active=active, return_date=return_date)


def _write_setting(db: Session, key: str, value: str) -> None:
    row = db.query(AdminSetting).filter(AdminSetting.key == key).first()
    if row:
        row.value = value
    else:
        db.add(AdminSetting(key=key, value=value))


@router.get("/settings/vacation", response_model=VacationModeState)
def get_vacation_mode(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return _read_vacation_state(db)


@router.post("/settings/vacation", response_model=VacationModeState)
def set_vacation_mode(
    body: VacationModeState,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # VacationModeState's model_validator already rejected active+no-date.
    # When deactivating, clear the date so the persisted state can't drift
    # back into "active with stale date" after a future flip.
    if body.active:
        _write_setting(db, "vacation_mode_active", "true")
        _write_setting(db, "vacation_return_date", body.return_date.isoformat())
    else:
        _write_setting(db, "vacation_mode_active", "false")
        _write_setting(db, "vacation_return_date", "")
    db.commit()
    return _read_vacation_state(db)


@router.post("/settings/test/{service}")
def test_service(
    service: str,
    user: User = Depends(require_admin),
):
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


@router.get("/dashboard")
def get_dashboard(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Single endpoint that returns everything the dashboard needs."""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)

    # feature/producer-analytics: pending moderation is the sum across
    # four queues. Individual counts stay available for the alert cards.
    pending_producers = (
        db.query(func.count(Producer.id))
        .filter(Producer.status.in_(["pending", "pending_whatsapp"]))
        .scalar()
        or 0
    )
    open_reports = db.query(func.count(Report.id)).scalar() or 0
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
    pending_moderation_count = int(
        pending_producers
        + open_reports
        + flagged_home_products
        + pending_experiences
        + pending_kashrut_requests
    )

    stats = {
        "total_producers": db.query(func.count(Producer.id)).scalar() or 0,
        "approved_producers": db.query(func.count(Producer.id))
        .filter(Producer.status == "approved")
        .scalar()
        or 0,
        "pending_producers": int(pending_producers),
        "new_producers_this_week": db.query(func.count(Producer.id))
        .filter(Producer.created_at >= week_ago)
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
        "total_events": db.query(func.count(Event.id)).scalar() or 0,
        "total_experiences": db.query(func.count(Experience.id)).scalar() or 0,
        "flagged_home_products": int(flagged_home_products),
        "pending_experiences": int(pending_experiences),
        "pending_kashrut_requests": int(pending_kashrut_requests),
        "pending_moderation_count": pending_moderation_count,
    }

    pending = (
        db.query(Producer)
        .filter(Producer.status.in_(["pending", "pending_whatsapp"]))
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
    months = []
    for i in range(5, -1, -1):
        ref = (now.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
        next_month = (ref + timedelta(days=32)).replace(day=1)
        producers = (
            db.query(func.count(Producer.id))
            .filter(Producer.created_at >= ref, Producer.created_at < next_month)
            .scalar()
        )
        months.append(
            {"month": ref.strftime("%Y-%m"), "producers": int(producers or 0)}
        )

    map_points = [
        {"id": str(p.id), "name": p.name, "lat": p.lat, "lng": p.lng}
        for p in db.query(Producer)
        .filter(
            Producer.status == "approved",
            Producer.lat.isnot(None),
            Producer.lng.isnot(None),
        )
        .limit(200)
        .all()
    ]

    # ---- feature/producer-analytics additions ----

    # Daily active users over last 30 days (zero-filled).
    # Source: users.last_active_at — updated by the tiny middleware in
    # main.py on every authenticated request. Pre-existing users who
    # haven't made a request since the column was added won't count
    # until they touch the API.
    today = date.today()
    dau_cutoff = datetime.combine(today - timedelta(days=29), datetime.min.time())
    dau_rows = (
        db.query(
            func.date(User.last_active_at).label("day"),
            func.count(func.distinct(User.id)).label("count"),
        )
        .filter(User.last_active_at.isnot(None), User.last_active_at >= dau_cutoff)
        .group_by(func.date(User.last_active_at))
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
    # Uses the same producer_page_views table as the per-producer dashboard.
    top_city_rows = (
        db.query(
            ProducerPageView.city,
            func.count(ProducerPageView.id).label("count"),
        )
        .filter(ProducerPageView.city.isnot(None))
        .group_by(ProducerPageView.city)
        .order_by(func.count(ProducerPageView.id).desc())
        .limit(10)
        .all()
    )
    top_cities = [{"city": r.city, "count": int(r.count)} for r in top_city_rows]

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
