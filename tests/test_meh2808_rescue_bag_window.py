"""MEH-2808 — the demo rescue bag's pickup window is derived from the clock.

`DEMO_RESCUE_BAG` used to fix the window at 18:00–19:00 Israel on
`israel_today()`. The public listing filters
`pickup_end > utc_now() + RESERVE_CLOSES_BEFORE_END` (`rescue.py:463`, 15
minutes at `:106`), so a seed run after ~18:45 produced a bag `/rescue` hides —
and the `(location, date)` idempotency key then stopped a re-run from replacing
it, so there was no way back until the next day. That is the window the media
capture for MEH-2794 runs in.

Sapir's rule (07/11): if `now + 3h` is still before 20:00 Israel, open the
window at `now + 1h` and close it at `now + 3h`; otherwise put it on tomorrow
17:00–19:00.

THE CLOCK IS FROZEN IN EVERY TEST HERE, on both sides of the cutoff. Per
`.claude/rules/testing.md`, a window test that runs against the wall clock is
green at most hours and red at one — and this suite's whole subject is what
happens at a particular hour. `_demo_pickup_window` takes `now` as an argument
precisely so the arithmetic can be pinned without patching anything, and the
two DB-touching tests patch `utc_now` in the seed module, which is the consumer.

NOT RUN LOCALLY: the sandbox has no reachable database — `initdb` succeeds but
starting a postmaster and connecting with credentials are both refused by the
command classifier, and port 5432 already holds a cluster that rejects the
configured password. The pure-arithmetic tests below need no database and DO run
here; the two that seed do not. CI is their first execution.
"""

import importlib.util
import os
from datetime import datetime, timedelta, timezone

import pytest

from app.models.models import ProducerLocation, RescueOffer
from app.routers.rescue import RESERVE_CLOSES_BEFORE_END
from app.utils.clock import ISRAEL_TZ

# Own block, matching tests/test_meh2794_marketing_fixtures.py — see the note
# there on local ruff 0.16.x vs the pinned 0.15.22 that CI runs.
from tests.conftest import make_category

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


def _utc_at_israel(hour, minute=0, *, day=7):
    """The naive-UTC instant of a given Israel wall-clock time on 07/11/2026.

    Built by converting FROM Israel, never by subtracting a fixed offset: the
    offset is +2 or +3 depending on the date, and hardcoding either is the
    MEH-2290 class this file exists to avoid repeating.
    """
    aware = datetime(2026, 11, day, hour, minute, tzinfo=ISRAEL_TZ)
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def _israel(naive_utc):
    return naive_utc.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)


# ── the arithmetic, at every boundary ───────────────────────────────────────
@pytest.mark.parametrize(
    # (israel hh:mm of the seed run) -> (day offset, window from, window to).
    # Grouped into two parameters rather than five: ruff's PLR0913 caps a
    # function at 5 arguments and the pinned config ships it as an error.
    "now_il,expected",
    [
        # Comfortably inside the day: the window is now+1h .. now+3h.
        ((10, 0), (0, "11:00", "13:00")),
        # The last minute that still fits: now+3h = 19:50 < 20:00.
        ((16, 50), (0, "17:50", "19:50")),
        # Twenty minutes later it does not fit, so it moves to tomorrow.
        ((17, 10), (1, "17:00", "19:00")),
        # The hour this card is about: the old code produced a dead bag here.
        ((18, 50), (1, "17:00", "19:00")),
        ((19, 30), (1, "17:00", "19:00")),
        # Late enough that now+3h crosses midnight. A time-of-day comparison
        # would read 02:30 as "before 20:00" and open a window in the small
        # hours; the datetime comparison sends it to tomorrow evening.
        ((23, 30), (1, "17:00", "19:00")),
    ],
)
def test_window_at_each_boundary(seed_mod, now_il, expected):
    """No database needed, so this one really runs in the sandbox too.

    DISCRIMINATES: the three same-day rows and the three tomorrow rows differ
    in the DATE as well as the times, so a rule that always picked one branch
    fails half the table. The 16:50 / 17:10 pair straddles the cutoff twenty
    minutes apart, which is what makes it a boundary test rather than two
    samples; against the old fixed 18:00-19:00 every row fails.
    """
    expect_day_offset, expect_from, expect_to = expected
    now = _utc_at_israel(*now_il)
    day, start, end = seed_mod._demo_pickup_window(now)

    expected_day = datetime(2026, 11, 7, tzinfo=ISRAEL_TZ).date() + timedelta(
        days=expect_day_offset
    )
    assert day == expected_day
    assert f"{_israel(start):%H:%M}" == expect_from
    assert f"{_israel(end):%H:%M}" == expect_to
    # The offer's `date` is the day collection happens on, so it must agree
    # with the start it was derived from — not with israel_today().
    assert _israel(start).date() == day
    assert end > start, "the rescue_offers_pickup_window_check CHECK"


@pytest.mark.parametrize("now_hour,now_minute", [(10, 0), (16, 50), (18, 50), (23, 30)])
def test_the_window_always_survives_the_public_listing_filter(
    seed_mod, now_hour, now_minute
):
    """The property the card is actually about, asserted against the REAL
    constant the listing uses rather than a 15-minute copy of it.

    DISCRIMINATES: it compares `pickup_end` with the same
    `now + RESERVE_CLOSES_BEFORE_END` expression `rescue.py:463` evaluates, so
    if that margin grows past the lead time this fails instead of silently
    producing hidden bags. Against the old fixed window the 18:50 and 23:30
    rows fail, which is exactly the bug.
    """
    now = _utc_at_israel(now_hour, now_minute)
    _day, _start, end = seed_mod._demo_pickup_window(now)
    assert end > now + RESERVE_CLOSES_BEFORE_END, (
        f"a seed at {now_hour:02d}:{now_minute:02d} Israel produces a bag the "
        f"public listing hides (pickup_end {_israel(end):%d/%m %H:%M} Israel)"
    )


def test_the_margin_is_the_routers_own_constant(seed_mod):
    """A guard against the drift the import exists to prevent.

    `_seed_rescue_bag` decides a bag is stale using the router's
    `RESERVE_CLOSES_BEFORE_END`, imported rather than mirrored. If someone
    reintroduces a local copy, this is the assertion that notices: it reads the
    value off the seed module and compares it with the router's.
    """
    assert seed_mod.RESERVE_CLOSES_BEFORE_END is RESERVE_CLOSES_BEFORE_END


# ── the seeded bag, with the clock frozen at 18:50 Israel ───────────────────
def test_bag_seeded_at_1850_israel_is_visible_on_rescue(
    db, seed_mod, bakery_category, monkeypatch
):
    """Sapir's acceptance case, end to end through the seed.

    The clock is frozen at 18:50 Israel by patching `utc_now` IN THE SEED
    MODULE — the consumer, per `.claude/rules/testing.md` — so this asserts
    what happens at 18:50 whatever hour CI runs at.

    DISCRIMINATES: it re-evaluates the listing's own filter against the row the
    seed actually wrote, so it fails if either the window or the margin moves.
    Against the old code the bag exists but `pickup_end` is 19:00 Israel on the
    frozen day, ten minutes out, inside the 15-minute margin — hidden.
    """
    frozen = _utc_at_israel(18, 50)
    monkeypatch.setattr(seed_mod, "utc_now", lambda: frozen)

    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)

    location = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer.id,
            ProducerLocation.is_primary.is_(True),
        )
        .one()
    )
    bag = (
        db.query(RescueOffer)
        .filter(RescueOffer.producer_location_id == location.id)
        .one()
    )

    assert bag.pickup_end > frozen + RESERVE_CLOSES_BEFORE_END, (
        f"seeded at 18:50 Israel the bag closes "
        f"{_israel(bag.pickup_end):%d/%m %H:%M} Israel, which /rescue hides"
    )
    assert bag.date == _israel(bag.pickup_start).date()
    assert f"{_israel(bag.pickup_start):%H:%M}" == "17:00"
    # cancel_until is NOT NULL with no server_default, and the product reading
    # is "cancel any time until collection opens".
    assert bag.cancel_until == bag.pickup_start


def test_a_closed_bag_is_replaced_but_a_live_one_is_left_alone(
    db, seed_mod, bakery_category, monkeypatch
):
    """ "Add if missing" gets exactly one exception, and it is scoped.

    DISCRIMINATES: two runs at two frozen times against the SAME arrangement,
    asserting opposite outcomes — the dead bag is replaced, the live one is
    not. A replacement that fired unconditionally would pass the first half and
    fail the second, which is the double-bag regression #4114 removed; a check
    that never fired would do the reverse.
    """
    morning = _utc_at_israel(10, 0)
    monkeypatch.setattr(seed_mod, "utc_now", lambda: morning)
    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)

    location = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer.id,
            ProducerLocation.is_primary.is_(True),
        )
        .one()
    )
    first = (
        db.query(RescueOffer)
        .filter(RescueOffer.producer_location_id == location.id)
        .one()
    )
    assert f"{_israel(first.pickup_start):%H:%M}" == "11:00"
    first_id = first.id

    # Still inside that window: the bag is live, so it must be kept.
    monkeypatch.setattr(seed_mod, "utc_now", lambda: _utc_at_israel(11, 30))
    assert seed_mod._seed_rescue_bag(db, producer) is False
    db.commit()
    kept = (
        db.query(RescueOffer)
        .filter(RescueOffer.producer_location_id == location.id)
        .one()
    )
    assert kept.id == first_id, "a live bag was replaced"

    # Past its close, and still the same Israel day, so the (location, date)
    # key would have blocked a plain insert. The window is dead, so it goes.
    monkeypatch.setattr(seed_mod, "utc_now", lambda: _utc_at_israel(14, 0))
    assert seed_mod._seed_rescue_bag(db, producer) is True
    db.commit()
    replaced = (
        db.query(RescueOffer)
        .filter(RescueOffer.producer_location_id == location.id)
        .one()
    )
    assert replaced.id != first_id, "the closed bag was kept"
    assert f"{_israel(replaced.pickup_start):%H:%M}" == "15:00"


def test_refresh_clears_the_bag_through_the_location_cascade(
    db, seed_mod, bakery_category, monkeypatch
):
    """`--refresh` needs no bag-specific deletion code, and this is why.

    `_delete_existing` bulk-deletes the demo's `ProducerLocation` rows and
    `RescueOffer.producer_location_id` carries `ondelete="CASCADE"`, so the bag
    is already gone before `seed_marketing_fixtures` runs again. Adding a
    delete for it in the seed would be unreachable by construction — the shape
    `.claude/rules/testing.md` calls a guard that can never fail — so the right
    artifact is this test, exactly as with `test_refresh_sweeps_qa_leftovers`
    for the QA leftovers.

    DISCRIMINATES: it checks the bag is gone by ID and that the reseed produced
    a DIFFERENT one, so it fails if the cascade is ever narrowed — which is the
    real risk here, not the seed forgetting to delete.
    """
    monkeypatch.setattr(seed_mod, "utc_now", lambda: _utc_at_israel(10, 0))
    seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    before = db.query(RescueOffer).count()
    assert before == 1
    first_id = db.query(RescueOffer).one().id

    seed_mod.seed_demo_business(db, refresh=True)
    assert db.query(RescueOffer).count() == 0, (
        "the ProducerLocation cascade did not take the rescue bag with it — "
        "the seed now DOES need its own delete, and this test's premise is gone"
    )

    seed_mod.seed_marketing_fixtures(db)
    db.commit()
    assert db.query(RescueOffer).count() == 1
    assert db.query(RescueOffer).one().id != first_id
