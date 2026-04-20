from datetime import datetime, timedelta, date
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.rate_limit import limiter
from app.models import (
    DeliveryArea,
    Favorite,
    HomeProduct,
    Producer,
    ProducerFollower,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)
import logging
import os
import secrets
import string

from app.models.models import HomeProductWhatsAppClick, PhoneOtpToken, KashrutBadgeRequest
from app.schemas.schemas import (
    ProducerDetailOut,
    ProducerUpdate,
    KashrutRequestCreate,
    KashrutRequestOut,
    OtpConfirmIn,
)
from app.services.trust_tier import VALID_BADGE_CODES

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerDetailOut)
def get_my_producer(user: User = Depends(require_producer), db: Session = Depends(get_db)):
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
        "name", "contact_name", "description", "short_description", "city",
        "lat", "lng", "phone", "instagram", "website", "whatsapp_group",
        "primary_contact_method", "contact_email", "slug", "top_product_name",
        "starting_price_label", "price_range", "grass_fed", "organic_certified",
        "has_delivery", "pickup_points", "kosher", "is_available_today",
        "images",
    }
    payload = data.model_dump(exclude_unset=True)
    category_ids = payload.pop("category_ids", None)
    delivery_cities = payload.pop("delivery_area_cities", None)

    for field, value in payload.items():
        if field in _PRODUCER_WRITABLE_FIELDS:
            setattr(producer, field, value)

    # Handle delivery area cities (replaces existing areas like admin endpoint)
    new_cities: list[str] = []
    if delivery_cities is not None:
        existing_cities = {da.city for da in producer.delivery_areas} if producer.delivery_areas else set()
        _apply_delivery_cities(db, producer, delivery_cities)
        new_cities = [c for c in delivery_cities if c and c not in existing_cities]

    # Handle category updates
    if category_ids is not None:
        from app.models import Category
        from app.models.models import ProducerCategory
        db.query(ProducerCategory).filter(ProducerCategory.producer_id == producer.id).delete()
        for cid in category_ids:
            db.add(ProducerCategory(producer_id=producer.id, category_id=cid))

    db.commit()
    db.refresh(producer)

    # MEH-54: fire delivery area alerts for newly added cities
    if new_cities:
        from app.routers.alerts import fire_alerts
        background_tasks.add_task(
            fire_alerts, db, producer.id, "delivery_area",
            f"🚚 משלוחים חדשים: {producer.name}",
            f"עכשיו מגיעים גם ל: {', '.join(new_cities)}",
            f"/producer/{producer.id}",
        )

    return producer


@router.post("/availability")
@limiter.limit("20/hour")
def toggle_availability(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Toggle today's availability for the logged-in producer."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.is_available_today = not bool(producer.is_available_today)
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {"is_available_today": producer.is_available_today}


# MEH-12: durable availability status ("open | full | vacation") that
# persists until the producer changes it, vs. the per-day
# `is_available_today` flag above. Rendered as a colored-dot badge on
# ProducerCard + ProducerDetail. Keep the two endpoints separate —
# collapsing them would break the existing "זמין היום" UX.
AVAILABILITY_STATUSES = {"available", "full", "vacation"}


class AvailabilityStatusUpdate(BaseModel):
    status: str = Field(..., description="available | full | vacation")


@router.post("/availability-status")
def set_availability_status(
    data: AvailabilityStatusUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if data.status not in AVAILABILITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"סטטוס לא תקין. חייב להיות אחד מתוך: {sorted(AVAILABILITY_STATUSES)}",
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.availability_status = data.status
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {"availability_status": producer.availability_status}


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
            "status": producer.status,
            "plan": producer.plan,
        },
        "favorites_count": int(favorites_count),
        "whatsapp_clicks_week": int(whatsapp_clicks_week),
    }


# ============================================================
# GET /producers/me/analytics — feature/producer-analytics
# ============================================================


def _count_in_window(db: Session, model, time_col, producer_id, *, days=None, extra_filter=None):
    """Count rows for the given model, optionally windowed to last N days."""
    q = db.query(func.count(model.id)).filter(model.producer_id == producer_id)
    if days is not None:
        cutoff = datetime.utcnow() - timedelta(days=days)
        q = q.filter(time_col >= cutoff)
    if extra_filter is not None:
        q = q.filter(extra_filter)
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
            "last_7d": _count_in_window(db, model, time_col, pid, days=7, extra_filter=extra),
            "last_30d": _count_in_window(db, model, time_col, pid, days=30, extra_filter=extra),
            "total": _count_in_window(db, model, time_col, pid, days=None, extra_filter=extra),
        }

    profile_views = windowed(ProducerPageView, ProducerPageView.created_at)
    search_appearances = windowed(
        ProducerPageView, ProducerPageView.created_at,
        extra=(ProducerPageView.referrer == "search"),
    )
    whatsapp_clicks = windowed(ProducerWhatsAppClick, ProducerWhatsAppClick.clicked_at)

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
        views_by_day.append({"date": d.isoformat(), "count": by_day.get(d.isoformat(), 0)})

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

    return {
        "profile_views": profile_views,
        "search_appearances": search_appearances,
        "whatsapp_clicks": whatsapp_clicks,
        "follower_count": int(follower_count),
        "new_followers_this_week": int(new_followers_this_week),
        "average_rating": round(average_rating, 2),
        "total_reviews": total_reviews,
        "home_products_count": int(home_products_count),
        "views_by_day": views_by_day,
        "top_cities": top_cities,
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
        PhoneOtpToken.used == False,
    ).update({"used": True})

    db.add(PhoneOtpToken(
        producer_id=producer.id,
        phone=producer.phone,
        code=code,
        expires_at=expires,
    ))
    db.commit()

    _send_whatsapp_otp(producer.phone, code)
    return {"detail": "קוד נשלח"}


@router.post("/verify-phone/confirm", status_code=200)
@limiter.limit("5/minute")
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
            PhoneOtpToken.used == False,
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

class BioGenerateIn(BaseModel):
    source: str = Field(..., min_length=1, max_length=500)


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
