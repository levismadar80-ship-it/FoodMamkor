from dataclasses import dataclass
from datetime import datetime, timedelta, date
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.rate_limit import limiter
from app.models import (
    ContactClick,
    DeliveryArea,
    Favorite,
    HomeProduct,
    Producer,
    Product,
    ProducerFollower,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)
import logging
import os
import secrets
import string

from app.models.models import PhoneOtpToken, KashrutBadgeRequest
from app.schemas.schemas import (
    AVAILABILITY_STATES,
    AvailabilityStateUpdate,
    AvailabilityStatusUpdate,
    BioGenerateIn,
    KashrutRequestCreate,
    KashrutRequestOut,
    OtpConfirmIn,
    ProducerDetailOut,
    ProducerUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from app.services.trust_tier import VALID_BADGE_CODES
from app.slug_utils import RESERVED_SLUGS, slugify as _slugify_me

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerDetailOut)
def get_my_producer(
    user: User = Depends(require_producer), db: Session = Depends(get_db)
):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == user.producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]):
    """Replace all delivery areas for this producer with the given city list."""
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        if city:
            db.add(DeliveryArea(producer_id=producer.id, city=city))


def _resolve_unique_slug(db: Session, raw_slug: str, producer_id: UUID) -> str:
    """MEH-447: extracted from update_my_producer to keep that handler under
    C901's complexity threshold. Validates against RESERVED_SLUGS and finds
    a non-colliding suffix (`-2`, `-3`, ...) against other producers."""
    raw = _slugify_me(raw_slug)
    if raw in RESERVED_SLUGS:
        raise HTTPException(
            status_code=400, detail="שם זה שמור לשימוש האתר. בחרי שם אחר."
        )
    candidate = raw
    counter = 2
    while True:
        if candidate not in RESERVED_SLUGS:
            existing = (
                db.query(Producer)
                .filter(
                    Producer.slug == candidate,
                    Producer.id != producer_id,
                )
                .first()
            )
            if not existing:
                return candidate
        candidate = f"{raw}-{counter}"
        counter += 1


@router.put("", response_model=ProducerDetailOut)
@limiter.limit("30/hour")
def update_my_producer(
    request: Request,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    _PRODUCER_WRITABLE_FIELDS = {
        "name",
        "contact_name",
        "description",
        "short_description",
        "city",
        "lat",
        "lng",
        "phone",
        "instagram",
        "website",
        "whatsapp_group",
        "primary_contact_method",
        "contact_email",
        "slug",
        "top_product_name",
        "starting_price_label",
        "price_range",
        "grass_fed",
        "organic_certified",
        "has_delivery",
        "pickup_points",
        "kosher",
        "is_available_today",
        "images",
        "custom_questions",
    }
    payload = data.model_dump(exclude_unset=True)
    category_ids = payload.pop("category_ids", None)
    delivery_cities = payload.pop("delivery_area_cities", None)

    # Validate and deduplicate slug if explicitly provided.
    if "slug" in payload and payload["slug"]:
        payload["slug"] = _resolve_unique_slug(db, payload["slug"], producer.id)

    # MEH-375: snapshot the gallery BEFORE mutation so we can diff old vs
    # new and clean up dropped URLs AFTER db.commit succeeds. Destroying
    # before commit would orphan-leak in the opposite direction (assets
    # gone, DB still references them) if commit raises.
    old_images = list(producer.images or [])

    for field, value in payload.items():
        if field in _PRODUCER_WRITABLE_FIELDS:
            setattr(producer, field, value)

    # Handle delivery area cities (replaces existing areas like admin endpoint)
    new_cities: list[str] = []
    if delivery_cities is not None:
        existing_cities = (
            {da.city for da in producer.delivery_areas}
            if producer.delivery_areas
            else set()
        )
        _apply_delivery_cities(db, producer, delivery_cities)
        new_cities = [c for c in delivery_cities if c and c not in existing_cities]

    # Handle category updates
    if category_ids is not None:
        from app.models.models import ProducerCategory

        db.query(ProducerCategory).filter(
            ProducerCategory.producer_id == producer.id
        ).delete()
        for cid in category_ids:
            db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

    db.commit()
    db.refresh(producer)

    # MEH-375: best-effort destroy of Cloudinary assets the producer
    # dropped from the gallery, AFTER db.commit so a constraint failure
    # / deadlock leaves DB and Cloudinary in sync. Helper does the set
    # diff + dedup + per-URL fail-open destroy; failures log via
    # app.upload and the cleanup script catches misses on its next run.
    if "images" in payload:
        from app.cloudinary_utils import destroy_removed_images
        destroy_removed_images(old_images, producer.images or [])

    # MEH-54: fire delivery area alerts for newly added cities
    if new_cities:
        from app.routers.alerts import AlertContent, fire_alerts

        background_tasks.add_task(
            fire_alerts,
            db,
            producer.id,
            "delivery_area",
            AlertContent(
                title=f"🚚 משלוחים חדשים: {producer.name}",
                body=f"עכשיו מגיעים גם ל: {', '.join(new_cities)}",
                url=f"/producer/{producer.id}",
            ),
        )

    return producer


# MEH-291 — dual-write helpers used during the 7-day overlap.
# Phase 4 (separate PR) drops the legacy is_available_today + availability_status
# columns and removes these helpers along with the legacy endpoints below.


def _state_to_legacy(state: str) -> tuple[bool, str]:
    """Map the new 4-value enum to the (is_available_today, availability_status)
    pair so old readers (ProducerCard, ProducerDetail, dashboard) stay accurate
    until the legacy columns are dropped."""
    return {
        "accepting_orders": (False, "available"),
        "available_today": (True, "available"),
        "full_this_week": (False, "full"),
        "on_vacation": (False, "vacation"),
    }[state]


def _legacy_to_state(
    is_available_today: bool | None, availability_status: str | None
) -> str:
    """Inverse mapping. Precedence matches the Phase 1 backfill CASE WHEN tree:
    vacation > full > is_available_today > default."""
    if availability_status == "vacation":
        return "on_vacation"
    if availability_status == "full":
        return "full_this_week"
    if is_available_today:
        return "available_today"
    return "accepting_orders"


@router.post("/availability")
@limiter.limit("20/hour")
def toggle_availability(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Toggle today's availability for the logged-in producer.

    Legacy endpoint — kept during MEH-291 7-day overlap. Mirrors the toggle to
    `availability_state` so consumers reading the new column stay consistent.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.is_available_today = not bool(producer.is_available_today)
    producer.availability_state = _legacy_to_state(
        producer.is_available_today, producer.availability_status
    )
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "is_available_today": producer.is_available_today,
        "availability_state": producer.availability_state,
    }


# MEH-12: durable availability status ("open | full | vacation") that
# persists until the producer changes it, vs. the per-day
# `is_available_today` flag above. Rendered as a colored-dot badge on
# ProducerCard + ProducerDetail. Keep the two endpoints separate —
# collapsing them would break the existing "זמין היום" UX.
AVAILABILITY_STATUSES = {"available", "full", "vacation"}


@router.post("/availability-status")
def set_availability_status(
    data: AvailabilityStatusUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Legacy endpoint — kept during MEH-291 7-day overlap. Mirrors the
    durable status to `availability_state`."""
    if data.status not in AVAILABILITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"סטטוס לא תקין. חייב להיות אחד מתוך: {sorted(AVAILABILITY_STATUSES)}",
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.availability_status = data.status
    producer.vacation_until = data.vacation_until if data.status == "vacation" else None
    producer.availability_state = _legacy_to_state(
        producer.is_available_today, producer.availability_status
    )
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "availability_status": producer.availability_status,
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


# MEH-291 — new unified endpoint. Phase 3 frontend will call this exclusively;
# the two legacy endpoints above stay during the 7-day overlap and dual-write.


@router.post("/availability-state")
@limiter.limit("20/hour")
def set_availability_state(
    request: Request,
    data: AvailabilityStateUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if data.state not in AVAILABILITY_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"מצב לא תקין. חייב להיות אחד מתוך: {', '.join(AVAILABILITY_STATES)}",
        )
    if data.state == "on_vacation" and data.vacation_until is None:
        raise HTTPException(status_code=422, detail="תאריך חזרה לחופשה נדרש")

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    producer.availability_state = data.state
    is_today, legacy_status = _state_to_legacy(data.state)
    producer.is_available_today = is_today
    producer.availability_status = legacy_status
    producer.vacation_until = (
        data.vacation_until if data.state == "on_vacation" else None
    )
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Minimal producer dashboard summary — kept stable for backward compat
    with the existing `/producer/dashboard` UI that already fetches this
    route. The richer analytics live at /producers/me/analytics."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    favorites_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )

    # feature/producer-analytics: replace the hardcoded 0 with real counts
    # from producer_whatsapp_clicks.
    week_ago = datetime.utcnow() - timedelta(days=7)
    whatsapp_clicks_week = (
        db.query(func.count(ProducerWhatsAppClick.id))
        .filter(
            ProducerWhatsAppClick.producer_id == producer.id,
            ProducerWhatsAppClick.clicked_at >= week_ago,
        )
        .scalar()
        or 0
    )

    return {
        "producer": {
            "id": str(producer.id),
            "name": producer.name,
            "is_available_today": bool(producer.is_available_today),
            # MEH-12 — dashboard toggle reads this to highlight the active pill
            "availability_status": producer.availability_status or "available",
            # MEH-291 — durable 4-value enum that supersedes the two above.
            # Defensive default in case ORM ever returns NULL despite NOT NULL.
            "availability_state": producer.availability_state or "accepting_orders",
            "vacation_until": producer.vacation_until.isoformat()
            if producer.vacation_until
            else None,
            "status": producer.status,
            "plan": producer.plan,
        },
        "favorites_count": int(favorites_count),
        "whatsapp_clicks_week": int(whatsapp_clicks_week),
    }


# ============================================================
# GET /producers/me/analytics — feature/producer-analytics
# ============================================================


@dataclass
class WindowFilter:
    """MEH-447: collapse the 2 optional kwargs of _count_in_window into a
    single value object so the helper stays under PLR0913's 5-arg cap.
    `extra_filter` is a SQLAlchemy ColumnElement — typed as Any to avoid
    Pydantic-arbitrary-type friction on an internal-only helper."""

    days: int | None = None
    extra_filter: Any = None


def _count_in_window(
    db: Session, model, time_col, producer_id, window: WindowFilter = WindowFilter()
):
    """Count rows for the given model, optionally windowed to last N days."""
    q = db.query(func.count(model.id)).filter(model.producer_id == producer_id)
    if window.days is not None:
        cutoff = datetime.utcnow() - timedelta(days=window.days)
        q = q.filter(time_col >= cutoff)
    if window.extra_filter is not None:
        q = q.filter(window.extra_filter)
    return int(q.scalar() or 0)


@router.get("/analytics")
def producer_analytics(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Rich analytics for the producer dashboard.

    Returns:
      - profile_views / search_appearances / whatsapp_clicks as {last_7d, last_30d, total}
      - follower_count + new_followers_this_week
      - average_rating + total_reviews (from the producers.avg_rating aggregate)
      - home_products_count (active only, scoped to the owning user)
      - views_by_day: 30-entry zero-filled daily series for the line chart
      - top_cities: top 5 cities the views come from (NULL excluded)
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    pid = producer.id

    # Time-windowed counts for the 3 main metrics.
    def windowed(model, time_col, *, extra=None):
        return {
            "last_7d": _count_in_window(
                db, model, time_col, pid, WindowFilter(days=7, extra_filter=extra)
            ),
            "last_30d": _count_in_window(
                db, model, time_col, pid, WindowFilter(days=30, extra_filter=extra)
            ),
            "total": _count_in_window(
                db, model, time_col, pid, WindowFilter(days=None, extra_filter=extra)
            ),
        }

    profile_views = windowed(ProducerPageView, ProducerPageView.created_at)
    search_appearances = windowed(
        ProducerPageView,
        ProducerPageView.created_at,
        extra=(ProducerPageView.referrer == "search"),
    )
    whatsapp_clicks = windowed(ProducerWhatsAppClick, ProducerWhatsAppClick.clicked_at)
    contact_clicks = windowed(ContactClick, ContactClick.clicked_at)

    # Followers
    follower_count = (
        db.query(func.count(ProducerFollower.id))
        .filter(ProducerFollower.producer_id == pid)
        .scalar()
        or 0
    )
    week_ago = datetime.utcnow() - timedelta(days=7)
    new_followers_this_week = (
        db.query(func.count(ProducerFollower.id))
        .filter(
            ProducerFollower.producer_id == pid,
            ProducerFollower.created_at >= week_ago,
        )
        .scalar()
        or 0
    )

    # Reviews — use the cached aggregate on the Producer row so we don't
    # re-scan producer_reviews on every dashboard hit.
    average_rating = float(producer.avg_rating or 0)
    total_reviews = int(producer.reviews_count or 0)

    # Home products owned by the producer's user account (is_active only)
    home_products_count = (
        db.query(func.count(HomeProduct.id))
        .filter(
            HomeProduct.user_id == user.id,
            HomeProduct.is_active.is_(True),
        )
        .scalar()
        or 0
    )

    # Views by day for the last 30 days, zero-filled.
    today = date.today()
    thirty_days_ago = datetime.combine(today - timedelta(days=29), datetime.min.time())
    daily_rows = (
        db.query(
            func.date(ProducerPageView.created_at).label("day"),
            func.count(ProducerPageView.id).label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.created_at >= thirty_days_ago,
        )
        .group_by(func.date(ProducerPageView.created_at))
        .all()
    )
    by_day = {str(row.day): int(row.count) for row in daily_rows}
    views_by_day = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        views_by_day.append(
            {"date": d.isoformat(), "count": by_day.get(d.isoformat(), 0)}
        )

    # Top cities (viewers who had a city attached — i.e. logged-in viewers).
    top_city_rows = (
        db.query(
            ProducerPageView.city,
            func.count(ProducerPageView.id).label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.city.isnot(None),
        )
        .group_by(ProducerPageView.city)
        .order_by(func.count(ProducerPageView.id).desc())
        .limit(5)
        .all()
    )
    top_cities = [{"city": row.city, "count": int(row.count)} for row in top_city_rows]

    # MEH-57 ── rank_in_city: 1-based rank among approved producers in same
    # city ordered by 30d views descending. None when producer has no city.
    cutoff_30d = datetime.utcnow() - timedelta(days=30)
    if producer.city:
        city_ranks = (
            db.query(
                Producer.id,
                func.count(ProducerPageView.id).label("views"),
            )
            .outerjoin(
                ProducerPageView,
                and_(
                    ProducerPageView.producer_id == Producer.id,
                    ProducerPageView.created_at >= cutoff_30d,
                ),
            )
            .filter(Producer.city == producer.city, Producer.status == "approved")
            .group_by(Producer.id)
            .order_by(func.count(ProducerPageView.id).desc())
            .all()
        )
        rank_in_city = next(
            (i + 1 for i, row in enumerate(city_ranks) if row.id == pid), None
        )
    else:
        rank_in_city = None

    # MEH-57 ── conversion_rate: whatsapp clicks / profile views × 100 (30d).
    conversion_rate = (
        round(whatsapp_clicks["last_30d"] / profile_views["last_30d"] * 100, 1)
        if profile_views["last_30d"] > 0
        else 0.0
    )

    # MEH-57 ── profile_strength: 0-100 score from 6-item checklist.
    has_delivery_area = (
        db.query(func.count(DeliveryArea.id))
        .filter(DeliveryArea.producer_id == pid)
        .scalar()
        or 0
    ) > 0
    strength_score = sum(
        [
            15 if (producer.images or []) else 0,
            20
            if (producer.description or "").strip()
            and len((producer.description or "").strip()) >= 50
            else 0,
            25 if int(home_products_count) > 0 else 0,
            10 if has_delivery_area else 0,
            15 if int(total_reviews) > 0 else 0,
            15 if producer.phone_verified else 0,
        ]
    )
    profile_strength = int(strength_score)

    # MEH-57 ── weekly_trend: compare last 7d views vs previous 7d (days 14→7).
    now = datetime.utcnow()
    prev_start = now - timedelta(days=14)
    prev_end = now - timedelta(days=7)
    prev_7d_views = int(
        db.query(func.count(ProducerPageView.id))
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.created_at >= prev_start,
            ProducerPageView.created_at < prev_end,
        )
        .scalar()
        or 0
    )
    last_7d = profile_views["last_7d"]
    if last_7d == 0 and prev_7d_views == 0:
        weekly_trend = "stable"
    elif prev_7d_views == 0:
        weekly_trend = "up"
    elif last_7d == 0:
        weekly_trend = "down"
    else:
        change = (last_7d - prev_7d_views) / prev_7d_views
        weekly_trend = "up" if change > 0.10 else "down" if change < -0.10 else "stable"

    return {
        "profile_views": profile_views,
        "search_appearances": search_appearances,
        "whatsapp_clicks": whatsapp_clicks,
        "contact_clicks": contact_clicks,
        "follower_count": int(follower_count),
        "new_followers_this_week": int(new_followers_this_week),
        "average_rating": round(average_rating, 2),
        "total_reviews": total_reviews,
        "home_products_count": int(home_products_count),
        "views_by_day": views_by_day,
        "top_cities": top_cities,
        "rank_in_city": rank_in_city,
        "conversion_rate": conversion_rate,
        "profile_strength": profile_strength,
        "weekly_trend": weekly_trend,
    }


# ---------------------------------------------------------------------------
# MEH-51: Phone verification (WhatsApp OTP)
# ---------------------------------------------------------------------------


def _send_whatsapp_otp(phone: str, code: str) -> bool:
    """Send a 6-digit OTP via Twilio WhatsApp. Fail-open: returns False if
    creds are missing — caller logs and still returns HTTP 200."""
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_wa = os.environ.get("TWILIO_WHATSAPP_FROM")
    if not (sid and token and from_wa):
        log.warning("MEH-51: Twilio creds missing — OTP not sent (fail-open)")
        return False
    try:
        from twilio.rest import Client

        Client(sid, token).messages.create(
            from_=from_wa,
            to=f"whatsapp:{phone}",
            body=f"מהמקור — קוד האימות שלך: *{code}*\nהקוד בתוקף ל-10 דקות.",
        )
        return True
    except Exception as e:
        log.warning("MEH-51: Twilio send failed: %s", e)
        return False


@router.post("/verify-phone", status_code=200)
@limiter.limit("3/10minute")
def send_phone_otp(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if not producer.phone:
        raise HTTPException(status_code=400, detail="לא נמצא מספר טלפון בפרופיל")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    expires = datetime.utcnow() + timedelta(minutes=10)

    # Invalidate any previous unused tokens for this producer
    db.query(PhoneOtpToken).filter(
        PhoneOtpToken.producer_id == producer.id,
        PhoneOtpToken.used.is_(False),
    ).update({"used": True})

    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=code,
            expires_at=expires,
        )
    )
    db.commit()

    _send_whatsapp_otp(producer.phone, code)
    return {"detail": "קוד נשלח"}


@router.post("/verify-phone/confirm", status_code=200)
@limiter.limit("3/minute")
def confirm_phone_otp(
    request: Request,
    body: OtpConfirmIn,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    token = (
        db.query(PhoneOtpToken)
        .filter(
            PhoneOtpToken.producer_id == producer.id,
            PhoneOtpToken.code == body.code,
            PhoneOtpToken.used.is_(False),
            PhoneOtpToken.expires_at > datetime.utcnow(),
        )
        .first()
    )
    if not token:
        raise HTTPException(status_code=400, detail="קוד שגוי או פג תוקף")

    token.used = True
    producer.phone_verified = True
    db.commit()
    return {"detail": "הטלפון אומת בהצלחה"}


# ---------------------------------------------------------------------------
# MEH-51: Kashrut badge requests
# ---------------------------------------------------------------------------


@router.post("/kashrut-request", response_model=KashrutRequestOut, status_code=201)
@limiter.limit("10/hour")
def request_kashrut_badge(
    request: Request,
    body: KashrutRequestCreate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if body.badge_code not in VALID_BADGE_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"קוד badge לא תקין. ערכים מותרים: {', '.join(sorted(VALID_BADGE_CODES))}",
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = (
        db.query(KashrutBadgeRequest)
        .filter(
            KashrutBadgeRequest.producer_id == producer.id,
            KashrutBadgeRequest.badge_code == body.badge_code,
            KashrutBadgeRequest.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="בקשה לbadge זה כבר ממתינה לאישור")

    req = KashrutBadgeRequest(
        producer_id=producer.id,
        badge_code=body.badge_code,
        cert_url=body.cert_url,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    out = KashrutRequestOut.model_validate(req)
    out.producer_name = producer.name
    return out


# ---------------------------------------------------------------------------
# MEH-56: AI bio generator
# ---------------------------------------------------------------------------


@router.post("/bio/generate")
@limiter.limit("5/hour")
def generate_bio_endpoint(
    request: Request,
    body: BioGenerateIn,
    user: User = Depends(require_producer),
):
    """Generate a Hebrew ≤150-char business bio via Claude Haiku.
    Accepts an Instagram handle, URL, or free text.
    Fail-open: returns {"bio": ""} when AI is unavailable.
    """
    from app.services.bio_generator import generate_bio

    bio = generate_bio(body.source)
    return {"bio": bio}


# MEH-88: Product CRUD
# ---------------------------------------------------------------------------


@router.get("/products", response_model=list[ProductOut])
def list_my_products(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    return db.query(Product).filter(Product.producer_id == user.producer_id).all()


@router.post("/products", response_model=ProductOut, status_code=201)
@limiter.limit("60/hour")
def create_my_product(
    request: Request,
    data: ProductCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = Product(producer_id=user.producer_id, **data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)

    # MEH-XXX: notify favoriting users who opted in for new-product alerts.
    # Wires the previously-orphaned "new_product" alert_type
    # (see _ALERT_COL in routers/alerts.py).
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    producer_name = producer.name if producer else "בית העסק"
    from app.routers.alerts import AlertContent, fire_alerts

    background_tasks.add_task(
        fire_alerts,
        db,
        user.producer_id,
        "new_product",
        AlertContent(
            title=f"🆕 מוצר חדש מ{producer_name}",
            body=product.name,
            url=f"/producer/{user.producer_id}",
        ),
    )

    return product


@router.put("/products/{product_id}", response_model=ProductOut)
@limiter.limit("60/hour")
def update_my_product(
    request: Request,
    product_id: UUID,
    data: ProductUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == user.producer_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
def delete_my_product(
    product_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == user.producer_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")

    # MEH-375 (YF-2): capture image_url BEFORE db.delete; destroy after
    # commit per the external-cleanup rule. Truthy guard skips the
    # logger spam for products that never had an image.
    old_image_url = product.image_url

    db.delete(product)
    db.commit()

    if old_image_url:
        from app.cloudinary_utils import destroy_image
        destroy_image(old_image_url)
