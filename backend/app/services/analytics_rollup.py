"""
Module:   analytics_rollup
Purpose:  Roll the raw producer analytics rows (`producer_page_views`,
          `producer_whatsapp_clicks`) up into one anonymous row per
          (business, Israel day) in `producer_analytics_daily`, so the raw
          rows can later be purged (chunk C) without the owner's dashboard
          numbers moving. MEH-2079 chunk B2 (MEH-2283).
Touches:  DB table `producer_analytics_daily` — INSERT only, never UPDATE,
          never DELETE. Reads the two raw tables. Commits per day.
Does NOT: purge anything (chunk C, gated on MEH-1981); decide WHEN to run —
          the CronTrigger in startup.py owns timing, `scripts/rollup_analytics.py`
          owns the explicit backfill; count anything with a bare
          `func.count(id)` on page views — `unique_views_count` (analytics.py)
          is THE dedupe expression and this module reuses it verbatim.
Related:  backend/app/models/models.py::ProducerAnalyticsDaily;
          backend/app/services/analytics.py:70 (unique_views_count);
          backend/app/routers/producer_me.py (`_count_in_window` — the
          `total` arm reads through `rollup_watermark` + `rolled_up_sum`);
          backend/app/startup.py (`_run_analytics_rollup_job`).
History:  MEH-2079 chunk B2 / MEH-2283 (creation, 06/09). Rulings by Sapir,
          06/09 evening, restated in the function docstrings below.

THE THREE PROPERTIES, IN THE ORDER THEY MATTER
----------------------------------------------
1. A ROLLED-UP DAY IS IMMUTABLE. Once a day has any aggregate row it is never
   re-rolled — `ON CONFLICT DO NOTHING`, and a day-level skip before that.
   Not "upsert and correct": after chunk C a re-roll would read a day whose
   raw rows are partially purged and silently UNDERCOUNT, and an upsert would
   write that undercount over a correct number. Skip is the only safe verb.

2. NEVER TODAY. The Israel day is not over until Israel midnight, so the
   automatic range ends at `israel_today() - 1`. Rolling a partial day would
   freeze it (property 1) at whatever it had reached by the run.

3. THE AGGREGATE OWNS EVERY DAY UP TO THE WATERMARK. `rollup_watermark()` is
   the global `max(day)`; readers sum the aggregate for the producer and read
   raw rows only where `israel_day > watermark`. So the automatic range is
   always `[watermark + 1 .. yesterday]` — contiguous, no holes — and the
   backfill CLI refuses a range that would START above `watermark + 1`, since
   a hole below the watermark is a range of days the reader would never see
   again once the raw rows are purged.

WHY THE ISRAEL DAY AND NOT THE UTC DAY. The go-message said "day boundary
UTC, same as the job". Built on the Israel day instead, and flagged on the
card, for one mechanical reason: the dedupe key is `(israel_day, hash)`
(MEH-160, ruling 09/08), and the equality the same message requires — raw
total == Σ aggregate + raw-above-watermark, before AND after roll-up — only
holds when the partition grain equals the dedupe grain. Partition on UTC days
and one visitor at 23:30 UTC + 00:30 UTC (one Israel day) counts 2 through the
aggregate and 1 through the raw path. `test_utc_partition_would_break_the_
equality` pins that with numbers. The "never today" property is preserved
either way — `today` is `israel_today()`.

# DO NOT add ON CONFLICT DO UPDATE here — a rolled-up day is immutable.
# DO NOT count `producer_page_views` with func.count(id) — use unique_views_count.
# DO NOT roll `today` — the day is not over.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import func, literal, select, union
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.models import (
    ProducerAnalyticsDaily,
    ProducerPageView,
    ProducerWhatsAppClick,
)
from app.services.analytics import israel_day_of, unique_views_count
from app.utils.clock import israel_today

logger = logging.getLogger(__name__)

# The constraint the skip rides on — named in models.py so the two cannot
# drift: a rename there fails the INSERT here loudly, not silently.
UNIQUE_CONSTRAINT = "uq_producer_analytics_daily_producer_day"

#: Sapir's ruling 05/09: the raw tables keep 90 days. Recorded here so the
#: backfill CLI can refuse a range it cannot honestly fill — a day older than
#: the retention window has (after chunk C) no raw rows left to count, and a
#: zero written for it would be an undercount frozen forever (property 1).
#: Chunk C must use the same number; if it does not, the `days=N` arms in
#: producer_me.py need the same seam as `total` (recorded on MEH-2283).
RAW_RETENTION_DAYS = 90


@dataclass(frozen=True)
class RollupResult:
    """What one run did. `days_rolled` counts days whose INSERT ran (possibly
    inserting zero rows — a day nobody visited); `days_skipped` counts days
    that already had an aggregate row and were therefore left alone."""

    first_day: date | None
    last_day: date | None
    days_rolled: int
    days_skipped: int
    rows_inserted: int


def rollup_watermark(db: Session) -> date | None:
    """The last Israel day the aggregate owns, or None if nothing is rolled
    up yet. GLOBAL, not per producer: the job rolls every producer for a day
    in one INSERT, so `max(day)` means "every producer's numbers for every
    day up to here live in the aggregate"."""
    return db.execute(select(func.max(ProducerAnalyticsDaily.day))).scalar()


def rolled_up_sum(db: Session, producer_id, column) -> int:
    """Σ `column` over the producer's aggregate rows. Every aggregate row is
    at or below the watermark by construction, so no day filter is needed —
    and adding one would let a reader disagree with the job about who owns
    a day."""
    total = db.execute(
        select(func.coalesce(func.sum(column), 0)).where(
            ProducerAnalyticsDaily.producer_id == producer_id
        )
    ).scalar()
    return int(total or 0)


def _earliest_raw_day(db: Session) -> date | None:
    """The oldest Israel day with any raw row, across both raw tables — the
    starting point of the very first run, before a watermark exists."""
    views = db.execute(
        select(func.min(israel_day_of(ProducerPageView.created_at)))
    ).scalar()
    clicks = db.execute(
        select(func.min(israel_day_of(ProducerWhatsAppClick.clicked_at)))
    ).scalar()
    candidates = [d for d in (views, clicks) if d is not None]
    return min(candidates) if candidates else None


def pending_days(db: Session, *, today: date | None = None) -> list[date]:
    """The automatic range: `[watermark + 1 .. today - 1]`, or from the
    earliest raw day when nothing is rolled up yet. Empty when the aggregate
    is already current, or when there is nothing raw to roll. `today` is the
    Israel day (injectable for tests); the range never includes it."""
    today = today or israel_today()
    yesterday = today - timedelta(days=1)
    wm = rollup_watermark(db)
    start = wm + timedelta(days=1) if wm is not None else _earliest_raw_day(db)
    if start is None or start > yesterday:
        return []
    return [start + timedelta(days=i) for i in range((yesterday - start).days + 1)]


def _day_select(day: date):
    """One SELECT producing every producer's counts for `day`, in the column
    order of the INSERT below.

    Three grouped sub-selects (all views · search views · clicks) LEFT-joined
    onto the union of producer ids active that day, so a business with clicks
    and no views (or the reverse) still gets its row, with 0 in the empty
    columns. The views dedupe through `unique_views_count(israel_day_of(...))`
    — the day is constant inside each group, so the tuple form is exactly the
    per-day count the raw readers compute; the search count applies the same
    `referrer == "search"` WHERE that `_count_in_window` applies.
    """
    pv_day = israel_day_of(ProducerPageView.created_at)
    wc_day = israel_day_of(ProducerWhatsAppClick.clicked_at)

    active = union(
        select(ProducerPageView.producer_id).where(pv_day == day),
        select(ProducerWhatsAppClick.producer_id).where(wc_day == day),
    ).subquery("active")

    views = (
        select(
            ProducerPageView.producer_id.label("pid"),
            unique_views_count(pv_day).label("n"),
        )
        .where(pv_day == day)
        .group_by(ProducerPageView.producer_id)
        .subquery("views")
    )
    search = (
        select(
            ProducerPageView.producer_id.label("pid"),
            unique_views_count(pv_day).label("n"),
        )
        .where(pv_day == day, ProducerPageView.referrer == "search")
        .group_by(ProducerPageView.producer_id)
        .subquery("search")
    )
    clicks = (
        select(
            ProducerWhatsAppClick.producer_id.label("pid"),
            func.count(ProducerWhatsAppClick.id).label("n"),
        )
        .where(wc_day == day)
        .group_by(ProducerWhatsAppClick.producer_id)
        .subquery("clicks")
    )

    return (
        select(
            active.c.producer_id,
            literal(day).label("day"),
            func.coalesce(views.c.n, 0).label("views_unique"),
            func.coalesce(search.c.n, 0).label("views_search_unique"),
            func.coalesce(clicks.c.n, 0).label("whatsapp_clicks"),
        )
        .select_from(active)
        .outerjoin(views, views.c.pid == active.c.producer_id)
        .outerjoin(search, search.c.pid == active.c.producer_id)
        .outerjoin(clicks, clicks.c.pid == active.c.producer_id)
    )


def _day_is_rolled(db: Session, day: date) -> bool:
    return (
        db.execute(
            select(literal(1)).where(ProducerAnalyticsDaily.day == day).limit(1)
        ).scalar()
        is not None
    )


def roll_up_day(db: Session, day: date) -> int | None:
    """Roll one Israel day for every producer. Returns the number of rows
    inserted, or None when the day already had an aggregate row and was
    skipped (property 1). Commits on success; on failure rolls back and
    re-raises so the session stays usable (the MEH-1824 invariant).

    Two layers of "never overwrite": the day-level check first, so a partial
    re-roll can never add rows for producers a previous run happened not to
    see; then `ON CONFLICT DO NOTHING` on the (producer, day) constraint, so
    two runs racing on the same day cannot double or overwrite either.
    """
    try:
        if _day_is_rolled(db, day):
            return None
        stmt = (
            pg_insert(ProducerAnalyticsDaily.__table__)
            .from_select(
                [
                    "producer_id",
                    "day",
                    "views_unique",
                    "views_search_unique",
                    "whatsapp_clicks",
                ],
                _day_select(day),
                # MEASURED, not assumed: without this, SQLAlchemy evaluates
                # the model's Python-side `default=uuid.uuid4` ONCE per
                # statement and binds that single value as the `id` of every
                # selected row — the second producer of the day then fails
                # the primary key. With it, `id` is left to the DB, which is
                # exactly what MEH-2282's server_default exists for.
                include_defaults=False,
            )
            .on_conflict_do_nothing(constraint=UNIQUE_CONSTRAINT)
        )
        inserted = db.execute(stmt).rowcount
        db.commit()
        return int(inserted or 0)
    except Exception:
        db.rollback()
        raise


def run_rollup(
    db: Session,
    *,
    from_day: date | None = None,
    to_day: date | None = None,
    today: date | None = None,
) -> RollupResult:
    """Roll every pending day (no arguments — the scheduler's call) or an
    explicit inclusive `[from_day .. to_day]` backfill (the CLI's call).
    Either way each day is skip-on-conflict and today is refused.

    The backfill guards are the property-3 guards, not policy: a range that
    starts above `watermark + 1` would leave days the reader never sees again
    once purged, and a range older than the retention window would freeze
    zeros for days whose raw rows are gone.
    """
    today = today or israel_today()
    if (from_day is None) != (to_day is None):
        raise ValueError("backfill needs both --from and --to")
    if from_day is None:
        days = pending_days(db, today=today)
    else:
        assert to_day is not None  # for the type checker; guarded above
        if from_day > to_day:
            raise ValueError(f"--from {from_day} is after --to {to_day}")
        if to_day >= today:
            raise ValueError(f"--to {to_day} includes today ({today}) — never today")
        if from_day < today - timedelta(days=RAW_RETENTION_DAYS):
            raise ValueError(
                f"--from {from_day} is older than the {RAW_RETENTION_DAYS}-day raw "
                "retention window — the raw rows to count are not guaranteed to exist"
            )
        wm = rollup_watermark(db)
        if wm is not None and from_day > wm + timedelta(days=1):
            raise ValueError(
                f"--from {from_day} would leave a hole after the watermark {wm}; "
                f"start at or before {wm + timedelta(days=1)}"
            )
        days = [
            from_day + timedelta(days=i) for i in range((to_day - from_day).days + 1)
        ]

    rolled = skipped = rows = 0
    for day in days:
        inserted = roll_up_day(db, day)
        if inserted is None:
            skipped += 1
        else:
            rolled += 1
            rows += inserted

    result = RollupResult(
        first_day=days[0] if days else None,
        last_day=days[-1] if days else None,
        days_rolled=rolled,
        days_skipped=skipped,
        rows_inserted=rows,
    )
    logger.info(
        "[ANALYTICS-ROLLUP] range=%s..%s days_rolled=%d days_skipped=%d rows_inserted=%d",
        result.first_day,
        result.last_day,
        result.days_rolled,
        result.days_skipped,
        result.rows_inserted,
    )
    return result
