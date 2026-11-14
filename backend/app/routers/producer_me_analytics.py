"""
Module:    producer_me_analytics
Purpose:   The owner's own traffic numbers under /producers/me/analytics:
           views, WhatsApp clicks and favourites per window, measured on the
           Israel calendar day.
Does NOT:  Record events (routers/producers.py and services/analytics.py do)
           or serve admin-wide numbers (routers/admin_extra.py).
Split out of producer_me.py (MEH-3266); the code is moved verbatim.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.auth import require_producer
from app.database import get_db
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now
from app.models import (
    ContactClick,
    DeliveryWaitlistEntry,
    Favorite,
    HomeProduct,
    Producer,
    ProducerAnalyticsDaily,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)
import logging
from app.services.analytics import israel_day_of, unique_views_count
from app.services.analytics_rollup import rollup_snapshot

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


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
    # MEH-160: when set, count DISTINCT (israel-day, value) pairs instead of
    # rows — one count per visitor per 24h Israel calendar day (Sapir's 09/08
    # ruling: the 24h window is the analytics norm). Rows where the column IS
    # NULL are still counted individually — they cannot be deduped against
    # anything, and dropping them (which COUNT(DISTINCT) does silently) would
    # trade over-counting for under-counting.
    distinct_col: Any = None
    # MEH-2079 chunk B2 (MEH-2283): the `producer_analytics_daily` column that
    # holds this metric's per-day roll-up. Only the `total` arm (days=None)
    # reads it — the `days=N` arms stay raw-only (Sapir's ruling 06/09), which
    # is safe exactly as long as chunk C's retention window is ≥ 30 days.
    rollup_col: Any = None


def _count_in_window(
    db: Session,
    model: Any,
    time_col: Any,
    producer_id: UUID,
    window: WindowFilter = WindowFilter(),
) -> int:
    """Count rows for the given model, optionally windowed to last N days.

    MEH-160: with ``window.distinct_col`` set, counts DISTINCT
    (israel-day, value) pairs PLUS the NULL rows one-by-one — a visitor counts
    once per 24h Israel calendar day (ruling 09/08), and a hit with no hash
    counts individually. `producer_page_views` writes `viewer_ip_hash` on every
    row and nothing ever read it, so one visitor refreshing N times counted as
    N profile views — the inflation the ticket describes, reachable without
    any spoofed user-agent. hash_ip's salt is settings.secret_key — stable per
    deploy, not time-rotating — so the day grain comes from created_at, not
    from the hash itself (a secret rotation resets uniques; acceptable, rare).

    MEH-2283: with ``window.rollup_col`` set AND no day window, the aggregate
    owns every Israel day up to the watermark and the raw table is read
    only ABOVE it — `Σ aggregate.col + deduped raw WHERE israel_day > watermark`.
    The raw side never reads a day the aggregate has, so once chunk C purges
    those raw rows the number does not move. Same day grain as the job (the
    Israel day — see analytics_rollup.py's header for why not UTC), so the
    two halves partition the rows exactly and the sum equals the raw-only
    count to the row (asserted before, after, and after-purge in
    tests/test_meh2283_analytics_rollup.py).
    """
    if window.distinct_col is not None:
        counter = unique_views_count(
            israel_day_of(time_col),
            hash_col=window.distinct_col,
            row_id_col=model.id,
        )
    else:
        counter = func.count(model.id)
    q = db.query(counter).filter(model.producer_id == producer_id)
    rolled_up = 0
    if window.days is not None:
        cutoff = utc_now() - timedelta(days=window.days)
        q = q.filter(time_col >= cutoff)
    elif window.rollup_col is not None:
        # One statement for both halves — a roll-up committing between a
        # separate watermark read and the sum double-counts the rolled day
        # for the request that straddles it (see rollup_snapshot's docstring).
        watermark, rolled_up = rollup_snapshot(db, producer_id, window.rollup_col)
        if watermark is not None:
            q = q.filter(israel_day_of(time_col) > watermark)
    if window.extra_filter is not None:
        q = q.filter(window.extra_filter)
    return int(q.scalar() or 0) + rolled_up


@router.get("/analytics", response_model=None)
def producer_analytics(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Rich analytics for the producer dashboard.

    Returns:
      - profile_views / search_appearances / whatsapp_clicks as {last_7d, last_30d, total}
      - follower_count + new_followers_this_week
      - average_rating + total_reviews (from the producers.avg_rating aggregate)
      - home_products_count (active only, scoped to the owning user)
      - views_by_day: 30-entry zero-filled daily series for the line chart
      - top_cities: top 5 cities the views come from (NULL excluded)
      - pickup_hosts: [{email, city}] waitlist visitors who offered to host a
        pickup point for THIS business (MEH-2673), newest first, max 50
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    pid = producer.id

    # Time-windowed counts for the 3 main metrics.
    # MEH-2283: `rollup_col` names the aggregate column the `total` arm reads
    # through (see WindowFilter). The three metrics the roll-up carries pass
    # one; contact_clicks has no aggregate column and stays raw on every arm.
    def windowed(
        model: Any,
        time_col: Any,
        *,
        extra: Any = None,
        distinct_col: Any = None,
        rollup_col: Any = None,
    ) -> dict[str, int]:
        return {
            label: _count_in_window(
                db,
                model,
                time_col,
                pid,  # type: ignore[arg-type]
                WindowFilter(
                    days=days,
                    extra_filter=extra,
                    distinct_col=distinct_col,
                    rollup_col=rollup_col,
                ),
            )
            for label, days in (("last_7d", 7), ("last_30d", 30), ("total", None))
        }

    # MEH-160: page views dedupe per (israel-day, viewer_ip_hash) — one count
    # per visitor per 24h day (ruling 09/08). "Unique inside a window" is what
    # models.py's own docstring said the column was for; until now nothing read
    # it. The windowed counters therefore equal the SUM of their days' unique
    # counts, so the headline numbers and the views_by_day chart agree by
    # construction.
    profile_views = windowed(
        ProducerPageView,
        ProducerPageView.created_at,
        distinct_col=ProducerPageView.viewer_ip_hash,
        rollup_col=ProducerAnalyticsDaily.views_unique,
    )
    search_appearances = windowed(
        ProducerPageView,
        ProducerPageView.created_at,
        extra=(ProducerPageView.referrer == "search"),
        distinct_col=ProducerPageView.viewer_ip_hash,
        rollup_col=ProducerAnalyticsDaily.views_search_unique,
    )
    whatsapp_clicks = windowed(
        ProducerWhatsAppClick,
        ProducerWhatsAppClick.clicked_at,
        rollup_col=ProducerAnalyticsDaily.whatsapp_clicks,
    )
    contact_clicks = windowed(ContactClick, ContactClick.clicked_at)

    # Followers — MEH-1364 (decision A, MEH-1362): counted from `favorites`,
    # the canonical interest record, since MEH-1363 removed the follow button.
    # The follow endpoints went in MEH-2370 and the producer_followers table
    # was dropped in MEH-2392.
    # favorites has a composite PK (user_id, producer_id) and NO id column —
    # count on a key column (REUSES: :510 func.count(Favorite.producer_id)).
    follower_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == pid)
        .scalar()
        or 0
    )
    week_ago = utc_now() - timedelta(days=7)
    new_followers_this_week = (
        db.query(func.count(Favorite.producer_id))
        .filter(
            Favorite.producer_id == pid,
            Favorite.created_at >= week_ago,
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
    # MEH-1894: the whole window runs on the Israel calendar day. Three parts
    # move together, and they have to — fixing only one is what produces an
    # off-by-a-few-hours bucket.
    #   1. the anchor: israel_today(), not the server's UTC date.
    #   2. the bucket: created_at is a NAIVE UTC column (models.py:1461), so
    #      it is first labelled UTC and then converted to Israel local before
    #      func.date() cuts the day. Without this the day boundary falls at
    #      midnight UTC = 02:00/03:00 Israel, so a 00:30 view counts as
    #      yesterday. The double cast is required precisely BECAUSE the column
    #      is naive; a tz-aware column would need only the inner one.
    #   3. the cutoff: Israel midnight of the oldest day, expressed back in
    #      naive UTC to match the column. Leaving the old naive
    #      datetime.combine() here would silently drop the first 2-3 hours of
    #      the oldest bucket, since that bucket starts at 21:00/22:00 UTC the
    #      previous day.
    today = israel_today()
    window_start = (
        datetime.combine(
            today - timedelta(days=29), datetime.min.time(), tzinfo=ISRAEL_TZ
        )
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    israel_day = israel_day_of(ProducerPageView.created_at)
    # MEH-160: the chart dedupes per DAY on the same column the windowed
    # counters use, so the series and the headline number cannot disagree.
    # Grouped by the day already, so the day-less shape of the helper applies.
    daily_rows = (
        db.query(
            israel_day.label("day"),
            # `israel_day` is already the GROUP BY key, so the day inside
            # the DISTINCT tuple is constant per group — the same count, and
            # no shorthand to get wrong (adversarial review, round 2).
            unique_views_count(israel_day).label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.created_at >= window_start,
        )
        .group_by(israel_day)
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
    # MEH-160: same unit as profile_views — one visitor per city per day.
    # Grouped by city, not by day, so the day travels inside the DISTINCT.
    city_views = unique_views_count(israel_day)
    top_city_rows = (
        db.query(
            ProducerPageView.city,
            city_views.label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.city.isnot(None),
        )
        .group_by(ProducerPageView.city)
        .order_by(city_views.desc())
        .limit(5)
        .all()
    )
    top_cities = [{"city": row.city, "count": int(row.count)} for row in top_city_rows]  # type: ignore[call-overload]  # labelled column, not tuple.count

    # MEH-1676 ── coverage_requests: "לא מגיעים ל{עיר}?" clicks grouped by
    # the city they asked about, last 30 days, most-requested first. The city
    # has been captured since MEH-1677 (`producer_whatsapp_clicks.city`) and
    # no screen read it until now. `city IS NOT NULL` is the whole filter: an
    # ordinary WhatsApp click stores NULL there by construction (only
    # CoverageRequestCta sends a body), so NULL means "not a coverage click"
    # and the two kinds cannot be confused. Counted raw, like the WhatsApp KPI
    # above — the table carries no viewer hash — so one visitor tapping twice
    # is two requests; the dashboard copy says "פניות", not "אנשים".
    # The city is the visitor's typed text (outer whitespace stripped only), so
    # «Haifa» / «haifa» and a doubled inner space are one city: group on a
    # case- and whitespace-folded key and show one spelling of it.
    city_key = func.lower(
        func.regexp_replace(func.trim(ProducerWhatsAppClick.city), r"\s+", " ", "g")
    )
    coverage_rows = (
        db.query(
            func.min(ProducerWhatsAppClick.city).label("city"),
            func.count(ProducerWhatsAppClick.id).label("count"),
        )
        .filter(
            ProducerWhatsAppClick.producer_id == pid,
            ProducerWhatsAppClick.city.isnot(None),
            ProducerWhatsAppClick.clicked_at >= utc_now() - timedelta(days=30),
        )
        .group_by(city_key)
        .order_by(func.count(ProducerWhatsAppClick.id).desc(), city_key)
        .limit(5)
        .all()
    )
    coverage_requests = [
        {"city": row.city, "count": int(row.count)}  # type: ignore[call-overload]  # labelled column, not tuple.count
        for row in coverage_rows
    ]

    # MEH-2673 ── pickup_hosts: waitlist visitors who ticked «אשמח לארח נקודת
    # מסירה ב{עיר}». Ticking is consent for THIS business to see the email —
    # the form says so under the box — so the filter is this producer's rows
    # only (`pid` is the caller's own business, require_producer above), and
    # a plain waitlist signup (wants_to_host False) never appears. Newest
    # CONFIRMATION first (not signup — a late click on an old signup is still
    # news); capped so a popular business gets a readable card, not a dump.
    host_rows = (
        db.query(DeliveryWaitlistEntry.email, DeliveryWaitlistEntry.city)
        .filter(
            DeliveryWaitlistEntry.producer_id == pid,
            DeliveryWaitlistEntry.wants_to_host.is_(True),
        )
        .order_by(
            DeliveryWaitlistEntry.host_confirmed_at.desc().nulls_last(),
            DeliveryWaitlistEntry.created_at.desc(),
        )
        .limit(50)
        .all()
    )
    pickup_hosts = [{"email": row.email, "city": row.city} for row in host_rows]

    # MEH-57 ── conversion_rate: contact actions / profile views × 100 (30d).
    #
    # MEH-2157: the numerator is EVERY logged contact action — the WhatsApp CTA
    # plus the non-WhatsApp contact clicks — not WhatsApp alone. A business
    # whose primary_contact_method is phone/email/website/external_order used to
    # read 0% forever, because the only table consulted was one it never writes
    # to. Industry anchor: Google Business Profile's headline number is likewise
    # the SUM of contact actions ("Interactions"), with the per-channel split
    # kept as a breakdown — which is why `whatsapp_clicks` and `contact_clicks`
    # are returned unchanged above and stay separate KPIs on the dashboard.
    #
    # The two tables CANNOT double-count one tap, and that is structural rather
    # than a convention anyone has to maintain: they are written by two distinct
    # endpoints (`producers.py:471` writes ProducerWhatsAppClick only,
    # `producers.py:507` writes ContactClick only), and
    # `_VALID_CONTACT_METHODS` (`producers.py:481`) has no "whatsapp" member, so
    # a WhatsApp tap has no path into the contact table at all.
    #
    # MEH-160 contract note, still in force and now covering both arms: the
    # denominator is unique daily viewers, while NEITHER click table is counted
    # per-viewer here — `producer_whatsapp_clicks` carries no viewer hash at all
    # (models.py:1722-1751 — only a nullable user_id), and although
    # `producer_contact_clicks` does have one (`ip_hash`, models.py:1779) it is
    # deliberately counted raw so both halves of the sum share one unit. The
    # ratio therefore CAN exceed 100 legitimately — one viewer acting twice in a
    # day — and widening the numerator makes that more likely, not less. The
    # display does not clamp it; clamping hid a wrong contract behind a screen
    # that looked fine. Alternative (Sapir's call, drafted on the MEH-160 card):
    # hash the viewer on both tables and restore a bounded percentage.
    contact_actions_30d = whatsapp_clicks["last_30d"] + contact_clicks["last_30d"]
    conversion_rate = (
        round(contact_actions_30d / profile_views["last_30d"] * 100, 1)
        if profile_views["last_30d"] > 0
        else 0.0
    )

    # MEH-57 ── weekly_trend: compare last 7d views vs previous 7d (days 14→7).
    now = utc_now()
    prev_start = now - timedelta(days=14)
    prev_end = now - timedelta(days=7)
    # MEH-160: the comparison arm has to use the SAME unit as `last_7d`, which
    # is deduped. Comparing deduped-now against raw-then reads "down" on
    # perfectly flat traffic — a permanent regression, not a rounding wobble:
    # any repeat visitor deflates only one side of the subtraction.
    prev_7d_views = int(
        db.query(unique_views_count(israel_day))
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
        "coverage_requests": coverage_requests,
        "pickup_hosts": pickup_hosts,
        # MEH-2529: `rank_in_city` (a per-request city ranking query) and
        # `profile_strength` (a second completeness score beside the
        # dashboard's own, MEH-1002) were computed here and read by no screen.
        "conversion_rate": conversion_rate,
        "weekly_trend": weekly_trend,
    }
