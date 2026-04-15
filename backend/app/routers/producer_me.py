from datetime import datetime, timedelta, date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.models import (
    Favorite,
    HomeProduct,
    Producer,
    ProducerFollower,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)
from app.models.models import HomeProductWhatsAppClick
from app.schemas.schemas import ProducerDetailOut, ProducerUpdate

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
        raise HTTPException(status_code=404, detail="Producer not found")
    return producer


@router.put("", response_model=ProducerDetailOut)
def update_my_producer(
    data: ProducerUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(producer, field, value)

    db.commit()
    db.refresh(producer)
    return producer


@router.post("/availability")
def toggle_availability(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Toggle today's availability for the logged-in producer."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
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
            detail=f"Invalid status. Must be one of: {sorted(AVAILABILITY_STATUSES)}",
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="Producer not found")
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
        raise HTTPException(status_code=404, detail="Producer not found")

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
        raise HTTPException(status_code=404, detail="Producer not found")

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
