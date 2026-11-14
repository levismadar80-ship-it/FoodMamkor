"""
Module:   producer_insights
Purpose:  The counting rules behind the business dashboard's numbers — page
          views, search appearances, WhatsApp clicks, other contact clicks and
          new followers — in ONE place, so the «תובנות» screen and the weekly
          summary email (MEH-3079) cannot say two different numbers for the
          same week.
Touches:  reads producer_page_views, producer_whatsapp_clicks,
          producer_contact_clicks, producer_analytics_daily, favorites.
          No writes.
Does NOT: build the rest of GET /producers/me/analytics (views_by_day,
          top_cities, conversion_rate, weekly_trend stay in
          routers/producer_me.py), or send anything (weekly_owner_summary.py).
Related:  backend/app/routers/producer_me.py `producer_analytics` (caller) ·
          backend/app/services/weekly_owner_summary.py (caller) ·
          backend/app/services/analytics.py (unique_views_count) ·
          backend/app/services/analytics_rollup.py (rollup_snapshot).
History:  MEH-3079 (extracted from producer_me.py, no behaviour change —
          WindowFilter / _count_in_window moved here verbatim).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, TypedDict
from uuid import UUID

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    ContactClick,
    Favorite,
    ProducerAnalyticsDaily,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.services.analytics import israel_day_of, unique_views_count
from app.services.analytics_rollup import rollup_snapshot
from app.utils.clock import utc_now

# The three windows the dashboard shows for every metric.
WINDOWS: tuple[tuple[str, int | None], ...] = (
    ("last_7d", 7),
    ("last_30d", 30),
    ("total", None),
)


@dataclass
class WindowFilter:
    """MEH-447: collapse the 2 optional kwargs of count_in_window into a
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


def count_in_window(
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
        # analytics.py is legacy-untyped; the calls are typed at this boundary.
        counter = unique_views_count(  # type: ignore[no-untyped-call]
            israel_day_of(time_col),  # type: ignore[no-untyped-call]
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
            q = q.filter(israel_day_of(time_col) > watermark)  # type: ignore[no-untyped-call]
    if window.extra_filter is not None:
        q = q.filter(window.extra_filter)
    return int(q.scalar() or 0) + int(rolled_up)


def _metric_specs() -> dict[str, tuple[Any, Any, dict[str, Any]]]:
    """metric name → (model, time column, WindowFilter kwargs).

    MEH-160: page views dedupe per (israel-day, viewer_ip_hash) — one count
    per visitor per 24h day (ruling 09/08). The windowed counters therefore
    equal the SUM of their days' unique counts, so the headline numbers and
    the views_by_day chart agree by construction.
    MEH-2283: `rollup_col` names the aggregate column the `total` arm reads
    through (see WindowFilter). contact_clicks has no aggregate column and
    stays raw on every arm.
    """
    return {
        "profile_views": (
            ProducerPageView,
            ProducerPageView.created_at,
            {
                "distinct_col": ProducerPageView.viewer_ip_hash,
                "rollup_col": ProducerAnalyticsDaily.views_unique,
            },
        ),
        "search_appearances": (
            ProducerPageView,
            ProducerPageView.created_at,
            {
                "extra_filter": (ProducerPageView.referrer == "search"),
                "distinct_col": ProducerPageView.viewer_ip_hash,
                "rollup_col": ProducerAnalyticsDaily.views_search_unique,
            },
        ),
        "whatsapp_clicks": (
            ProducerWhatsAppClick,
            ProducerWhatsAppClick.clicked_at,
            {"rollup_col": ProducerAnalyticsDaily.whatsapp_clicks},
        ),
        "contact_clicks": (ContactClick, ContactClick.clicked_at, {}),
    }


def metric_count(db: Session, producer_id: UUID, metric: str, days: int | None) -> int:
    """One metric over one window — the cell the dashboard shows."""
    model, time_col, kwargs = _metric_specs()[metric]
    return count_in_window(
        db, model, time_col, producer_id, WindowFilter(days=days, **kwargs)
    )


def metric_windows(db: Session, producer_id: UUID) -> dict[str, dict[str, int]]:
    """Every metric × {last_7d, last_30d, total} — the analytics endpoint's
    four headline objects, keyed by their response names."""
    return {
        metric: {
            label: metric_count(db, producer_id, metric, days)
            for label, days in WINDOWS
        }
        for metric in _metric_specs()
    }


def new_followers_since(db: Session, producer_id: UUID, since: datetime) -> int:
    """Followers — MEH-1364 (decision A, MEH-1362): counted from `favorites`,
    the canonical interest record. favorites has a composite PK
    (user_id, producer_id) and NO id column — count on a key column."""
    n: Any = (
        db.query(func.count(Favorite.producer_id))
        .filter(
            Favorite.producer_id == producer_id,
            Favorite.created_at >= since,
        )
        .scalar()
    )
    return int(n or 0)


class WeeklyNumbers(TypedDict):
    profile_views: int
    whatsapp_clicks: int
    contact_clicks: int
    new_followers: int


def weekly_numbers(db: Session, producer_id: UUID) -> WeeklyNumbers:
    """The last-7-days column of the dashboard, for the weekly email.

    Same calls the analytics endpoint makes for `last_7d` and
    `new_followers_this_week` — not a copy of their queries.
    """
    return {
        "profile_views": metric_count(db, producer_id, "profile_views", 7),
        "whatsapp_clicks": metric_count(db, producer_id, "whatsapp_clicks", 7),
        "contact_clicks": metric_count(db, producer_id, "contact_clicks", 7),
        "new_followers": new_followers_since(
            db, producer_id, utc_now() - timedelta(days=7)
        ),
    }
