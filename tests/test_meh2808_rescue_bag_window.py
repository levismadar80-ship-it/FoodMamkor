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
from datetime import date, datetime, timedelta, timezone

import pytest

from app.models.models import (
    ProducerLocation,
    RescueOffer,
    RescueOrder,
    RescueReview,
)
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


_ANCHOR = date(2026, 11, 7)


def _utc_at_israel(hour, minute=0, *, on=None):
    """The naive-UTC instant of an Israel wall-clock time, on `on` (a date) or
    on the 07/11/2026 anchor.

    Built by converting FROM Israel, never by subtracting a fixed offset: the
    offset is +2 or +3 depending on the date, and hardcoding either is the
    MEH-2290 class this file exists to avoid repeating.

    Takes a whole date rather than a day-of-month (MEH-2816): a day-of-month
    form pins the month, so an arrangement reaching back across a month
    boundary would silently build a date in the wrong one.
    """
    d = on or _ANCHOR
    aware = datetime(d.year, d.month, d.day, hour, minute, tzinfo=ISRAEL_TZ)
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


@pytest.mark.parametrize(
    # (switch day, israel hh:mm, which branch the window MUST take).
    #
    # MEH-2816: the expected branch is a PARAMETER, not something the test
    # discovers. The previous shape chose its assertions with
    # `if start - now < 12h`, so a row that switched branches because the code
    # changed quietly got the OTHER branch's assertions and still passed —
    # `.claude/rules/testing.md`'s "guard that can never fail". Now a row that
    # switches fails on the branch assertion itself, by name.
    #
    # The 01:30 rows are the ones that exercise the lead-time arithmetic this
    # fix is about; the 23:00 rows are kept because they pin that a late-night
    # seed still lands on tomorrow evening ACROSS the switch, which is a
    # different thing that could also break.
    "switch_day,now_il,branch",
    [
        ((2026, 10, 25), (1, 30), "same_day"),
        ((2026, 10, 24), (23, 0), "tomorrow"),
        ((2026, 3, 27), (1, 30), "same_day"),
        ((2026, 3, 27), (23, 0), "tomorrow"),
    ],
)
def test_the_lead_times_are_real_hours_across_a_dst_switch(
    seed_mod, switch_day, now_il, branch
):
    """MEH-2814 — the window promises `now + 1h .. now + 3h` in REAL hours.

    `now_il + timedelta(hours=3)` is wall-clock arithmetic: on the October
    switch night `01:30 + 3h` reads 04:30 Israel while FOUR real hours have
    passed. The fix adds to the UTC instant and converts afterwards.

    DISCRIMINATES: the lead times are asserted as ELAPSED time on naive-UTC
    instants, where a timedelta is unambiguous — never on the Israel-local
    renderings, which is the arithmetic under test. Against the wall-clock
    form the October `same_day` row reads 4:00:00 against an expected 3:00:00
    and fails by name. The normal-day tests above pass in both versions, which
    is exactly why they could not have caught this.
    """
    y, mo, d = switch_day
    hour, minute = now_il
    now = (
        datetime(y, mo, d, hour, minute, tzinfo=ISRAEL_TZ)
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    _day, start, end = seed_mod._demo_pickup_window(now)

    took = "same_day" if start - now < timedelta(hours=12) else "tomorrow"
    assert took == branch, (
        f"a seed at {hour:02d}:{minute:02d} Israel on {d:02d}/{mo:02d} took the "
        f"{took!r} branch, not {branch!r} — the assertions below are written "
        "for the expected branch and would otherwise pass against the wrong one"
    )

    if branch == "same_day":
        # Both lead times must be exact REAL hours.
        assert start - now == timedelta(
            hours=seed_mod.DEMO_RESCUE_BAG["lead_hours_start"]
        ), f"collection opens {start - now} after the seed, not one real hour"
        assert end - now == timedelta(
            hours=seed_mod.DEMO_RESCUE_BAG["lead_hours_end"]
        ), f"collection closes {end - now} after the seed, not three real hours"
    else:
        # The tomorrow-evening branch is a wall-clock window by design
        # (17:00-19:00 Israel), so what matters is that it reads back as those
        # hours on the far side of the switch.
        assert f"{_israel(start):%H:%M}" == "17:00"
        assert f"{_israel(end):%H:%M}" == "19:00"
    assert end > start, "the rescue_offers_pickup_window_check CHECK"


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


# ── MEH-2816: the sweep is safe on its own, and what it takes with it ───────
def test_the_stale_filter_selects_only_closed_bags(
    db, seed_mod, bakery_category, monkeypatch
):
    """The sweep's predicate, exercised WITHOUT `_seed_rescue_bag`.

    Inside that function the live-bag guard always returns before the sweep,
    so the negated predicate is unreachable there and no test driving the
    function can discriminate on it. That is the gap the reviewer found in the
    first version of this PR, where a comment claimed a proof that did not
    exist. `_bag_still_open` is module-level for exactly this reason.

    DISCRIMINATES: one live bag and one closed bag at the same location, and
    the query must return exactly the closed one. It calls
    `_stale_bags_query` — the function the sweep deletes through — so dropping
    `~_bag_still_open(now)` from the real query reds this test. A version that
    re-typed the filter here would have passed that edit, which is what round
    3 of the review pointed out.
    """
    now = _utc_at_israel(10, 0)
    monkeypatch.setattr(seed_mod, "utc_now", lambda: now)
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
    live_id = db.query(RescueOffer).one().id

    yesterday = _israel(now).date() - timedelta(days=1)
    closed = RescueOffer(
        producer_location_id=location.id,
        date=yesterday,
        qty_total=4,
        qty_left=4,
        price_agorot=2500,
        pickup_start=_utc_at_israel(17, 0, on=yesterday),
        pickup_end=_utc_at_israel(19, 0, on=yesterday),
        cancel_until=_utc_at_israel(17, 0, on=yesterday),
    )
    db.add(closed)
    db.commit()
    closed_id = closed.id

    # THE SEED'S OWN QUERY, called rather than re-typed. A test that rebuilt
    # the same filter here would pass even if the real `stale` query dropped
    # its condition, which is the whole thing this is supposed to catch
    # (reviewer on #4136, round 3).
    selected = {o.id for o in seed_mod._stale_bags_query(db, location.id, now)}
    assert closed_id in selected, "the closed bag was not selected for sweeping"
    assert live_id not in selected, (
        "the filter selected a LIVE bag — this is the query that deletes, so "
        "that is a delete of a bag /rescue is currently showing"
    )


def test_the_sweep_is_per_location_and_a_live_bag_protects_the_rest(
    db, seed_mod, bakery_category, monkeypatch
):
    """MEH-2814 widened the sweep from `(location, day)` to the whole
    location. This pins both halves of what that means, with several bags in
    the table rather than the single one every other test here arranges.

    The predicate's own behaviour is covered by
    `test_the_stale_filter_selects_only_closed_bags`, which runs it directly;
    what this one covers is the BEHAVIOUR with more than one row, which is
    what the widened sweep changed.

    DISCRIMINATES: the first half fails if the sweep deletes anything while a
    live bag exists (the double-bag #4114 removed, reached from the other
    side); the second fails if it removes only the bag for the new window's
    day, which is exactly the pre-MEH-2814 behaviour that left dead rows
    behind. One arrangement, two opposite expectations.
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
    live_id = db.query(RescueOffer).one().id

    # Two bags from earlier days, both long closed, both at this location.
    for offset in (1, 2):
        day = _israel(morning).date() - timedelta(days=offset)
        db.add(
            RescueOffer(
                producer_location_id=location.id,
                date=day,
                qty_total=4,
                qty_left=4,
                price_agorot=2500,
                pickup_start=_utc_at_israel(17, 0, on=day),
                pickup_end=_utc_at_israel(19, 0, on=day),
                cancel_until=_utc_at_israel(17, 0, on=day),
            )
        )
    db.commit()
    assert db.query(RescueOffer).count() == 3

    # 1. While the live bag is live, NOTHING is touched — not even the two
    #    dead ones. The short-circuit owns this case.
    assert seed_mod._seed_rescue_bag(db, producer) is False
    db.commit()
    assert db.query(RescueOffer).count() == 3, "a live bag did not protect the table"
    assert live_id in {o.id for o in db.query(RescueOffer).all()}

    # 2. Past the live bag's close, ALL THREE go and one fresh bag replaces
    #    them. Pre-MEH-2814 only the row for the new window's day was
    #    considered, so the two older ones would have survived.
    monkeypatch.setattr(seed_mod, "utc_now", lambda: _utc_at_israel(14, 0))
    assert seed_mod._seed_rescue_bag(db, producer) is True
    db.commit()
    remaining = db.query(RescueOffer).all()
    assert len(remaining) == 1, (
        f"{len(remaining)} bags left after the sweep; the per-location sweep "
        "should have taken all three closed ones and left exactly the new one"
    )
    assert remaining[0].id != live_id
    assert f"{_israel(remaining[0].pickup_start):%H:%M}" == "15:00"


def test_the_sweep_takes_orders_and_reviews_with_a_closed_bag(
    db, seed_mod, bakery_category, monkeypatch
):
    """What deleting a closed bag costs, pinned rather than assumed.

    The chain is `RescueOffer -> RescueOrder -> RescueReview`, every FK
    `ondelete="CASCADE"` (models.py). So a closed bag's reservations go with
    it, and their reviews after that. Deliberate — this is the demo fixture on
    staging, and the alternative is the dead rows MEH-2814 removed — but it is
    worth a test, because a narrowed cascade would otherwise surface as an
    IntegrityError on someone's seed run rather than here.

    DISCRIMINATES: it asserts the order is gone BY ID and that the sweep
    returned True, so it fails both if the cascade is narrowed (IntegrityError
    or a surviving row) and if the sweep stops running. A bare count would
    pass on a run that deleted nothing and created nothing.
    """
    morning = _utc_at_israel(10, 0)
    monkeypatch.setattr(seed_mod, "utc_now", lambda: morning)
    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    bag = db.query(RescueOffer).one()

    consumer = (
        db.query(seed_mod.User)
        .filter(seed_mod.User.email == seed_mod.DEMO_CONSUMER_EMAIL)
        .one()
    )
    order = RescueOrder(
        offer_id=bag.id,
        user_id=consumer.id,
        qty=1,
        # FOUR DIGITS: character(4) with a CHECK of `^[0-9]{4}$` (models.py).
        pickup_code="2816",
        status="reserved",
    )
    db.add(order)
    db.flush()
    order_id = order.id

    # ...and a review hanging off that order, so the test covers the second
    # hop its name claims. Without it the name said "orders and reviews"
    # while only orders were asserted (reviewer on #4136).
    review = RescueReview(order_id=order_id, rating=5)
    db.add(review)
    db.commit()
    review_id = review.id
    assert db.query(RescueOrder).filter(RescueOrder.id == order_id).one()
    assert db.query(RescueReview).filter(RescueReview.id == review_id).one()

    # Past the window's close, so the bag is stale and the sweep takes it.
    monkeypatch.setattr(seed_mod, "utc_now", lambda: _utc_at_israel(14, 0))
    assert seed_mod._seed_rescue_bag(db, producer) is True
    db.commit()

    assert db.query(RescueOrder).filter(RescueOrder.id == order_id).first() is None, (
        "the reservation outlived the bag it belonged to — the cascade narrowed"
    )
    assert (
        db.query(RescueReview).filter(RescueReview.id == review_id).first() is None
    ), "the review outlived the order it belonged to — the second hop narrowed"
