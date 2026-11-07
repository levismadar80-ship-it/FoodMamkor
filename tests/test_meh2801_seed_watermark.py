"""MEH-2801 — the demo seed must not move the analytics roll-up watermark.

`rollup_watermark()` is `max(producer_analytics_daily.day)` **globally, across
every producer** (`analytics_rollup.py:105-110`, which says so in its own
docstring). The nightly job starts at `watermark + 1` (`:176`, `:336`) and the
watermark only ever moves forward, while `rollup_snapshot` (`:113-146`)
partitions the reader's rows at it: aggregate at or below, raw above.

So an aggregate row written for TODAY — which is what `_seed_insights` did as
of `7e6385a5` — jumps the watermark past every day the job has not rolled yet.
The job never returns for those days, and the reader finds them in neither
half. They vanish from the `total` arm of **every other producer's** dashboard,
permanently.

WHAT IS AND IS NOT AFFECTED, because the first write-up of MEH-2801 got this
too broad and the difference is the whole size of the bug: `_count_in_window`
(`producer_me.py:1069-1079`) reads the watermark in exactly one of its three
arms. `last_7d` / `last_30d` are raw-only ("the `days=N` arms stay raw-only —
Sapir's ruling 06/09") and `views_by_day` is raw-only (`:1222-1234`). Only
`total` goes through the aggregate. These tests therefore assert on the
aggregate rows and the watermark, which is where the damage actually lands.

DEMONSTRATED FAILING RUN: this file is committed one push BEFORE the fix, so
CI runs it against `7e6385a5`'s behaviour unmodified. The red run and the green
run are both linked in the PR body. The CC sandbox cannot run pytest — `initdb`
succeeds here but starting a postmaster and connecting with credentials are
both refused by the sandbox's command classifier — so CI is the instrument, and
ordering the two pushes is what makes it evidence rather than a claim.
"""

import importlib.util
import os
from datetime import timedelta

import pytest

from app.models.models import ProducerAnalyticsDaily, ProducerPageView
from app.services.analytics_rollup import (
    pending_days,
    roll_up_day,
    rollup_watermark,
    run_rollup,
)
from app.utils.clock import israel_today

# Own block, matching tests/test_meh2794_marketing_fixtures.py:50 — see the
# note there on local ruff 0.16.x vs the pinned 0.15.22 that CI runs.
from tests.conftest import make_category, make_producer

_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "backend", "scripts", "seed_demo_business.py"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("seed_demo_business", _SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture()
def seed_mod():
    return _load_module()


@pytest.fixture()
def bakery_category(db, seed_mod):
    return make_category(db, name=seed_mod.DEMO_CATEGORY_NAME, emoji="🍞")


def _midday_utc(seed_mod, day):
    """The same midday-Israel anchor the seed uses, so a raw row written here
    lands on the Israel day it is meant to (MEH-2290: a `now - N*24h` stamp is
    N Israel days back only while the UTC offset is equal at both ends)."""
    return seed_mod._israel_wall_to_utc(day, 12)


def _view(seed_mod, producer_id, day, token):
    """One page view on `day`. Each row needs its OWN `viewer_ip_hash`: the
    roll-up and the dashboard both count DISTINCT (israel-day, hash) pairs
    (MEH-160), so reusing one hash would collapse a day to 1 and the assertions
    below would be measuring the dedup rather than the roll-up."""
    return ProducerPageView(
        producer_id=producer_id,
        viewer_ip_hash=f"{token:064d}",
        city="חיפה",
        referrer="home",
        created_at=_midday_utc(seed_mod, day),
    )


def _run_the_seed(db, seed_mod):
    """The demo business plus the MEH-2794 fixtures, in the order `main()` calls
    them — `seed_marketing_fixtures` is deliberately not inside
    `seed_demo_business`."""
    seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    db.commit()


# ── 1. the watermark does not move ───────────────────────────────────────────
def test_seed_does_not_move_the_rollup_watermark(db, seed_mod, bakery_category):
    """The property in one line. Everything else in this file is a consequence.

    DISCRIMINATES: the watermark is captured from the live table before AND
    after, so this cannot pass by the table happening to be empty — the
    `assert before == anchor` line fails loudly if the arrangement did not take.
    Against `7e6385a5` the seed writes a row for `israel_today()`, so `after`
    is today and this goes red naming both values.
    """
    other = make_producer(db, name="מחלבת הבקרה", category=bakery_category)
    anchor = israel_today() - timedelta(days=5)
    db.add(_view(seed_mod, other.id, anchor, 1))
    db.add(
        ProducerAnalyticsDaily(
            producer_id=other.id,
            day=anchor,
            views_unique=1,
            views_search_unique=0,
            whatsapp_clicks=0,
        )
    )
    db.commit()

    before = rollup_watermark(db)
    assert before == anchor, "arrangement failed — the anchor row did not land"

    _run_the_seed(db, seed_mod)

    after = rollup_watermark(db)
    assert after == before, (
        f"the seed moved the global watermark from {before} to {after}; the "
        "nightly job starts at watermark+1, so every day in between is now "
        "unreachable for every producer"
    )


# ── 2. another producer's days survive the seed AND the real roll-up ─────────
def test_another_producers_days_survive_the_seed_and_the_real_rollup(
    db, seed_mod, bakery_category
):
    """Sapir's acceptance case: watermark 10 days back, run the seed, then run
    the REAL `run_rollup`, and the other producer's numbers for those 10 days
    are intact.

    This is the test that measures the actual harm. Test 1 pins the mechanism;
    this one pins the consequence, through the real job rather than a model of
    it — `run_rollup()` with no arguments is the scheduler's own call path.

    DISCRIMINATES: it asserts a row EXISTS for each gap day and that its count
    equals the raw rows behind it. Against `7e6385a5` the seed lifts the
    watermark to today, `pending_days` then yields nothing, and every gap day
    is missing — so the first missing day fails by name. An assertion that only
    summed the aggregate would also pass on a run that rolled the wrong days.
    """
    other = make_producer(db, name="מחלבת הבקרה", category=bakery_category)
    today = israel_today()
    anchor = today - timedelta(days=10)

    # One view a day for the anchor day and the nine days above it. The anchor
    # day gets its aggregate row here (that is what makes it the watermark);
    # the nine above are raw-only and are the job's work.
    token = 100
    for offset in range(10, 0, -1):
        db.add(_view(seed_mod, other.id, today - timedelta(days=offset), token))
        token += 1
    db.add(
        ProducerAnalyticsDaily(
            producer_id=other.id,
            day=anchor,
            views_unique=1,
            views_search_unique=0,
            whatsapp_clicks=0,
        )
    )
    db.commit()
    assert rollup_watermark(db) == anchor

    _run_the_seed(db, seed_mod)
    assert rollup_watermark(db) == anchor, "precondition for the roll-up below"

    # DERIVED from the job itself, not hardcoded. `pending_days` is the range
    # `run_rollup()` will actually walk, so if the job ever caps a batch or
    # narrows its catch-up window this test says so by name instead of failing
    # with a bare list of missing days (reviewer, rounds 1-3).
    gap = pending_days(db)
    assert gap == [anchor + timedelta(days=i) for i in range(1, 10)], (
        "the job's pending range is not the nine days this test arranged: "
        f"{[str(d) for d in gap]}"
    )

    run_rollup(db)

    assert rollup_watermark(db) == today - timedelta(days=1), (
        "after a full roll-up the watermark should sit at yesterday "
        f"({today - timedelta(days=1)}) — anything else means the job did not "
        "walk the range it reported"
    )
    rolled = {
        row.day: row.views_unique
        for row in db.query(ProducerAnalyticsDaily)
        .filter(ProducerAnalyticsDaily.producer_id == other.id)
        .all()
    }
    missing = [str(d) for d in gap if d not in rolled]
    assert not missing, (
        f"the control producer lost {len(missing)} of {len(gap)} days from the "
        f"aggregate after the seed + a real roll-up: {missing}"
    )
    assert all(rolled[d] == 1 for d in gap), (
        f"the roll-up landed but the counts are wrong: "
        f"{ {str(d): rolled[d] for d in gap} }"
    )


# ── 3. an empty aggregate table owns nothing, so nothing is written ─────────
def test_no_aggregate_rows_when_the_table_is_empty(db, seed_mod, bakery_category):
    """`wm is None` means the aggregate owns no day at all. Writing the first
    row would hand it a watermark it never earned — the same bug, from zero.

    DISCRIMINATES: asserts the COUNT is zero, not merely that today is absent.
    Against `7e6385a5` all 30 rows are written and this reports 30.
    """
    assert rollup_watermark(db) is None, "arrangement: the table must start empty"

    _run_the_seed(db, seed_mod)

    rows = db.query(ProducerAnalyticsDaily).count()
    assert rows == 0, (
        f"{rows} aggregate row(s) written against an empty table — the seed "
        "handed the roll-up a watermark it never earned"
    )
    assert rollup_watermark(db) is None


# ── 4. the seeded values are the ones the real job would have computed ──────
def test_seeded_aggregate_matches_what_the_real_job_computes(
    db, seed_mod, bakery_category
):
    """The seed writes its aggregate values from its own bucket arithmetic
    rather than through `roll_up_day`, because `roll_up_day` writes rows for
    EVERY producer active that day and the ruling forbids touching another
    producer. That is a second path computing the same fact — the shape
    `workflow.md` calls smell #1 — so it needs pinning rather than trusting.

    DISCRIMINATES: it re-derives the row with the job's own SQL on the same raw
    rows and demands equality on all three columns. A drift in either direction
    (the job changing its dedup, the seed changing its buckets) fails here. A
    test that only checked the row existed would not move.
    """
    other = make_producer(db, name="מחלבת הבקרה", category=bakery_category)
    today = israel_today()
    anchor = today - timedelta(days=5)
    db.add(_view(seed_mod, other.id, anchor, 1))
    db.add(
        ProducerAnalyticsDaily(
            producer_id=other.id,
            day=anchor,
            views_unique=1,
            views_search_unique=0,
            whatsapp_clicks=0,
        )
    )
    db.commit()

    _run_the_seed(db, seed_mod)
    demo = (
        db.query(seed_mod.Producer)
        .filter(seed_mod.Producer.slug == seed_mod.DEMO_SLUG)
        .one()
    )

    # EVERY day the seed wrote a row for, strictly below the watermark so that
    # clearing and re-rolling cannot disturb the watermark itself. One day was
    # a thin sample for a "cannot drift" claim, because the per-day bucket
    # values differ (reviewer, rounds 2 and 3).
    seeded_rows = {
        r.day: (r.views_unique, r.views_search_unique, r.whatsapp_clicks)
        for r in db.query(ProducerAnalyticsDaily).filter(
            ProducerAnalyticsDaily.producer_id == demo.id,
            ProducerAnalyticsDaily.day < anchor,
        )
    }
    assert len(seeded_rows) > 1, (
        f"only {len(seeded_rows)} day(s) below the anchor — the arrangement is "
        "not exercising more than one bucket"
    )

    for day, expected in sorted(seeded_rows.items()):
        # `roll_up_day` skips a day ANY producer already has a row for, so the
        # day is cleared first. Clearing unconditionally would erase the
        # control producer's row if the arrangement ever placed one here, so
        # the demo must be the only owner first (reviewer, round 2).
        owners = {
            r.producer_id
            for r in db.query(ProducerAnalyticsDaily).filter(
                ProducerAnalyticsDaily.day == day
            )
        }
        assert owners == {demo.id}, (
            f"{day} is owned by {len(owners)} producer(s), not the demo alone — "
            "clearing it here would destroy another producer's data"
        )
        db.query(ProducerAnalyticsDaily).filter(
            ProducerAnalyticsDaily.day == day
        ).delete()
        db.commit()
        assert roll_up_day(db, day) is not None, f"the job skipped {day}"

        recomputed = (
            db.query(ProducerAnalyticsDaily)
            .filter(
                ProducerAnalyticsDaily.producer_id == demo.id,
                ProducerAnalyticsDaily.day == day,
            )
            .one()
        )
        actual = (
            recomputed.views_unique,
            recomputed.views_search_unique,
            recomputed.whatsapp_clicks,
        )
        assert actual == expected, (
            f"on {day} the seed's aggregate values disagree with what the "
            f"roll-up job computes from the same raw rows: seeded {expected}, "
            f"job {actual}"
        )
