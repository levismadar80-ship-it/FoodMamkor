"""
Module:   admin_dashboard
Purpose:  The numbers behind the admin home (`GET /admin/dashboard`) and the
          admin analytics page (`GET /admin/analytics`).
Touches:  read-only queries over producers, users, categories, favourites,
          producer_locations, producer_page_views and the moderation queues.
Does NOT: check the caller is an admin — the router does (`require_admin`).
          Writes nothing.
Related:  backend/app/routers/admin_extra.py (the two handlers that call this)
History:  MEH-3538 (moved here unchanged from routers/admin_extra.py)
"""

from datetime import datetime, timedelta, timezone
from typing import Any, cast

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Category,
    Event,
    Experience,
    Favorite,
    Producer,
    ProducerLocation,
    ProducerPageView,
    Report,
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
from app.services.analytics import israel_day_of, server_health, unique_views_count
from app.services.producer_listing import is_business  # MEH-2459
from app.services.whatsapp import undelivered_predicate
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now


def primary_location_points(db: Session, *, limit: int | None = None) -> list[Any]:
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


def last_six_months(now: datetime) -> list[tuple[datetime, datetime]]:
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


def counts_per_bucket(
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


def build_analytics(db: Session) -> dict[str, Any]:
    """Compact analytics for the admin dashboard (`GET /admin/analytics`)."""
    now = utc_now()

    # Time series: producers/users per month for last 6 months
    buckets = last_six_months(now)
    producer_counts = counts_per_bucket(
        db,
        Producer.id,
        Producer.created_at,
        buckets,
        Producer.kind == "producer",  # MEH-2465
    )
    user_counts = counts_per_bucket(db, User.id, User.created_at, buckets)
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
    points = primary_location_points(db)
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


def build_dashboard(db: Session) -> dict[str, Any]:
    """Everything the admin home needs, in one payload (`GET /admin/dashboard`)."""
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
        "open_reports": int(open_reports),
        # MEH-1267: real group-buys count replaces the hardcoded "›" placeholder
        # on the admin dashboard card.
        "total_group_buys": db.query(func.count(GroupBuy.id)).scalar() or 0,
        "total_events": db.query(func.count(Event.id)).scalar() or 0,
        "total_experiences": db.query(func.count(Experience.id)).scalar() or 0,
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
    buckets = last_six_months(now)
    producer_counts = counts_per_bucket(
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
    # primary_location_points. The 200 cap is the pre-existing one.
    map_points = [
        {"id": str(pid), "name": name, "lat": lat, "lng": lng}
        for pid, name, lat, lng in primary_location_points(db, limit=200)
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
