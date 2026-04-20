"""Extended admin endpoints for the full dashboard:
users management, content (categories + static pages), analytics, settings.

Lives in a separate file from admin.py to keep things readable.
"""
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import (
    AdminSetting,
    Category,
    ContactMessage,
    Favorite,
    HomeProduct,
    NewsletterSubscriber,
    Producer,
    Report,
    StaticPage,
    User,
)

router = APIRouter(prefix="/admin", tags=["admin-extra"])


# ============================================================
# USERS
# ============================================================


class UserAdminOut(BaseModel):
    id: UUID
    email: str
    name: str
    city: str | None = None
    phone: str | None = None
    role: str
    is_blocked: bool = False
    producer_id: UUID | None = None
    favorites_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(consumer|producer|admin)$")


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
        out.append(UserAdminOut(
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
        ))
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
        raise HTTPException(status_code=404, detail="User not found")
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
        raise HTTPException(status_code=404, detail="User not found")
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


class CategoryIn(BaseModel):
    name: str
    emoji: str | None = None


class CategoryOut(BaseModel):
    id: int
    name: str
    emoji: str | None = None

    model_config = {"from_attributes": True}


@router.get("/categories", response_model=list[CategoryOut])
def list_categories_admin(user: User = Depends(require_admin), db: Session = Depends(get_db)):
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


class StaticPageOut(BaseModel):
    slug: str
    title: str
    body: str
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class StaticPageUpdate(BaseModel):
    title: str
    body: str


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
        months.append({
            "month": ref.strftime("%Y-%m"),
            "producers": int(producers or 0),
            "users": int(users or 0),
        })

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
        .filter(Producer.status == "approved", Producer.lat.isnot(None), Producer.lng.isnot(None))
        .all()
    )
    map_points = [
        {"id": str(p.id), "name": p.name, "lat": p.lat, "lng": p.lng}
        for p in points
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
    "auto_inactive_days": "180",
    "activity_check_interval": "90",
    "low_rating_threshold": "2.0",
    "report_auto_suspend_count": "3",
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
            db.add(AdminSetting(key=key, value=str(value) if value is not None else None))
    db.commit()
    return {"detail": "Settings updated"}


@router.post("/settings/test/{service}")
def test_service(
    service: str,
    user: User = Depends(require_admin),
):
    """Smoke-test integrations. Returns ok=true/false without raising."""
    from app.config import settings as cfg

    if service == "twilio":
        ok = bool(cfg.twilio_account_sid and cfg.twilio_auth_token and cfg.twilio_whatsapp_from)
        return {"ok": ok, "configured": ok, "service": "twilio"}
    if service == "cloudinary":
        ok = bool(cfg.cloudinary_cloud_name and cfg.cloudinary_api_key and cfg.cloudinary_api_secret)
        return {"ok": ok, "configured": ok, "service": "cloudinary"}
    raise HTTPException(status_code=400, detail="Unknown service")


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

    stats = {
        "total_producers": db.query(func.count(Producer.id)).scalar() or 0,
        "approved_producers": db.query(func.count(Producer.id)).filter(Producer.status == "approved").scalar() or 0,
        "pending_producers": db.query(func.count(Producer.id)).filter(Producer.status == "pending").scalar() or 0,
        "total_users": db.query(func.count(User.id)).scalar() or 0,
        "total_home_products": db.query(func.count(HomeProduct.id)).filter(HomeProduct.is_active.is_(True)).scalar() or 0,
        "hidden_home_products": db.query(func.count(HomeProduct.id)).filter(HomeProduct.is_hidden.is_(True)).scalar() or 0,
        "open_reports": db.query(func.count(Report.id)).scalar() or 0,
        "unread_contact_count": db.query(func.count(ContactMessage.id)).filter(ContactMessage.is_read.is_(False)).scalar() or 0,
        "newsletter_count": db.query(func.count(NewsletterSubscriber.id)).scalar() or 0,
        "premium_count": db.query(func.count(Producer.id)).filter(Producer.plan == "premium").scalar() or 0,
        "free_count": db.query(func.count(Producer.id)).filter(Producer.plan == "free", Producer.status == "approved").scalar() or 0,
    }

    pending = (
        db.query(Producer)
        .filter(Producer.status == "pending")
        .order_by(Producer.created_at.desc())
        .limit(5)
        .all()
    )
    pending_list = [
        {"id": str(p.id), "name": p.name, "city": p.city, "created_at": p.created_at.isoformat() if p.created_at else None}
        for p in pending
    ]

    recent = (
        db.query(Producer)
        .order_by(Producer.created_at.desc())
        .limit(5)
        .all()
    )
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
        months.append({"month": ref.strftime("%Y-%m"), "producers": int(producers or 0)})

    map_points = [
        {"id": str(p.id), "name": p.name, "lat": p.lat, "lng": p.lng}
        for p in db.query(Producer)
        .filter(Producer.status == "approved", Producer.lat.isnot(None), Producer.lng.isnot(None))
        .limit(200)
        .all()
    ]

    return {
        "stats": stats,
        "pending_producers": pending_list,
        "recent_activity": recent_activity,
        "monthly_producers": months,
        "map_points": map_points,
    }


# ============================================================
# CONTACT MESSAGES
# ============================================================


class ContactOut(BaseModel):
    id: UUID
    name: str
    email: str
    message: str
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/contact", response_model=list[ContactOut])
def list_contact_messages(
    is_read: bool | None = None,
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(ContactMessage)
    if is_read is not None:
        q = q.filter(ContactMessage.is_read == is_read)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (ContactMessage.name.ilike(like))
            | (ContactMessage.email.ilike(like))
            | (ContactMessage.message.ilike(like))
        )
    return q.order_by(ContactMessage.created_at.desc()).limit(200).all()


@router.post("/contact/{message_id}/mark-read")
def mark_contact_read(
    message_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    msg = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    msg.is_read = True
    db.commit()
    return {"detail": "Marked as read"}


@router.delete("/contact/{message_id}")
def delete_contact_message(
    message_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    msg = db.query(ContactMessage).filter(ContactMessage.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(msg)
    db.commit()
    return {"detail": "Message deleted"}


# ============================================================
# NEWSLETTER SUBSCRIBERS
# ============================================================


class NewsletterOut(BaseModel):
    id: UUID
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get("/newsletter", response_model=list[NewsletterOut])
def list_newsletter_subscribers(
    search: str | None = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(NewsletterSubscriber)
    if search:
        q = q.filter(NewsletterSubscriber.email.ilike(f"%{search}%"))
    return q.order_by(NewsletterSubscriber.created_at.desc()).limit(500).all()


@router.get("/newsletter/export")
def export_newsletter(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    from fastapi.responses import Response

    subscribers = db.query(NewsletterSubscriber).order_by(NewsletterSubscriber.created_at.desc()).all()
    lines = ["email,created_at"]
    for sub in subscribers:
        dt = sub.created_at.isoformat() if sub.created_at else ""
        lines.append(f"{sub.email},{dt}")
    csv_content = "\ufeff" + "\n".join(lines)
    today = datetime.utcnow().strftime("%Y-%m-%d")
    return Response(
        content=csv_content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="newsletter_{today}.csv"'},
    )


@router.delete("/newsletter/{subscriber_id}")
def delete_newsletter_subscriber(
    subscriber_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    sub = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.id == subscriber_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscriber not found")
    db.delete(sub)
    db.commit()
    return {"detail": "Subscriber removed"}
