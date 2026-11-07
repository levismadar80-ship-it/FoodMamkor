"""MEH-2794 — the /join screenshot fixtures on the demo business.

Covers the three seed-side acceptance criteria:

  * the QA-leftover requirement («(בדיקה)» / «QA» rows attached to the demo
    producer do not survive a --refresh) — see the docstring on
    ``test_refresh_sweeps_qa_leftovers`` for why this is a TEST and not new
    deletion code;
  * ``seed_marketing_fixtures`` adds the offer, the rescue bag and the insight
    numbers, and is idempotent ("add if missing", per the ticket);
  * the raw analytics rows and the daily roll-up AGREE, which is the one
    property that cannot be eyeballed off a screenshot and the one whose
    failure would make the owner's dashboard contradict itself.

NOT RUN LOCALLY. The CC sandbox has no database it can reach — `psql` and
`su postgres` are both denied actions here, and `alembic upgrade` is denied by
workflow.md §B3 — so these assertions were written against the models and the
seed source, and their first real execution is CI's `Backend tests (pytest)`
job. There is therefore NO demonstrated failing run for this file, which
MEH-1619 would otherwise require; that is stated here rather than implied by
its absence.
"""

import importlib.util
import os
from datetime import timedelta, timezone

import pytest

from app.models.models import (
    ContactClick,
    Favorite,
    GroupBuy,
    Producer,
    ProducerAnalyticsDaily,
    ProducerOffer,
    ProducerPageView,
    ProducerReview,
    ProducerWhatsAppClick,
    User,
)
from app.routers.rescue import RESERVE_CLOSES_BEFORE_END
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now

# Placed in its own block, matching tests/test_seed_demo_business.py:31. Ruff
# 0.16.x sorts `tests.*` up with the third-party block instead, but the pinned
# version in backend/uv.lock is 0.15.22 and THAT is what `Backend lint (ruff)`
# runs — and it accepts this layout today in the sibling file. Local ruff
# flagging I001 here is the same version drift as its RUF100 complaints about
# the `noqa: E402` lines the pinned version still needs.
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


@pytest.fixture()
def seeded(db, seed_mod, bakery_category):
    """The demo business plus the MEH-2794 fixtures, as `main()` orders them."""
    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    return producer


# How far back the arranged watermark sits. 5 puts it inside the seed's 30-day
# window with days on both sides of it, which is what lets the partition below
# be asserted in both directions from one arrangement.
WATERMARK_OFFSET = 5


def _arrange_watermark(db, category):
    """Put a roll-up watermark `WATERMARK_OFFSET` days back, and return it.

    MEH-2801: `_seed_insights` writes an aggregate row only for a day at or
    below `rollup_watermark()`, and the `db` fixture truncates every table, so
    without an arrangement the watermark is None and the seed writes NO
    aggregate rows at all — correctly, since an empty table owns no day. The
    three tests below are about the agreement between the raw rows and the
    roll-up, so they need a watermark to exist before there is any agreement to
    check.

    The anchor row belongs to a DIFFERENT producer on purpose: the watermark is
    global (`analytics_rollup.py:105-110`), so this also pins that the seed
    reads a watermark it did not set itself.
    """
    other = make_producer(db, name="מחלבת הבקרה", category=category)
    anchor = israel_today() - timedelta(days=WATERMARK_OFFSET)
    db.add(
        ProducerAnalyticsDaily(
            producer_id=other.id,
            day=anchor,
            views_unique=0,
            views_search_unique=0,
            whatsapp_clicks=0,
        )
    )
    db.commit()
    return anchor


@pytest.fixture()
def seeded_with_watermark(db, seed_mod, bakery_category):
    """`(producer, watermark)` — the fixtures seeded against a watermark that
    already existed, which is the staging shape."""
    anchor = _arrange_watermark(db, bakery_category)
    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    return producer, anchor


def _israel_date(stamp):
    return stamp.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ).date()


# ── the QA-leftover requirement ──────────────────────────────────────────────
def test_refresh_sweeps_qa_leftovers(db, seed_mod, bakery_category):
    """The ticket asks for «--refresh also removes QA leftovers … (group buys,
    reviews, events)». Phase 0 found that `_delete_existing` ALREADY does:
    it deletes the demo producer, whose ORM cascade covers reviews (and
    products / areas / recipes), and it deletes Events and GroupBuys
    explicitly.

    So the right artifact is this test, not a second deletion pass. New code
    that re-deletes rows the cascade has already taken would be unreachable by
    construction — the shape `testing.md` calls a guard that can never fail —
    while the actual risk is that someone later narrows the cascade and nobody
    notices. That is what this pins.

    DISCRIMINATES: it inserts rows that are specifically «(בדיקה)»-marked and
    checks they are gone by NAME, so it fails if `_delete_existing` stops
    reaping either table. A count-only assertion would pass on a re-seed that
    happened to produce the same number of rows.
    """
    producer = seed_mod.seed_demo_business(db)

    db.add(
        GroupBuy(
            producer_id=producer.id,
            title="מארז לחמי מחמצת לשכונה (בדיקה)",
            product_name="לחם מחמצת",
            unit="כיכר",
            price_per_unit_regular=32,
            price_per_unit_group=26,
            min_participants=5,
            max_participants=20,
            deadline=seed_mod.utc_now() + seed_mod.timedelta(days=5),
            city=seed_mod.DEMO_PRODUCER["city"],
            status="open",
        )
    )
    # The demo CONSUMER, not one of the DEMO_REVIEWS authors: there is a
    # unique constraint of one review per (producer, user), and all three
    # reviewers already used theirs in the seed. The consumer is a group-buy
    # committer only, so it is the one seeded account still free to review.
    qa_reviewer = (
        db.query(User).filter(User.email == seed_mod.DEMO_CONSUMER_EMAIL).one()
    )
    db.add(
        ProducerReview(
            producer_id=producer.id,
            user_id=qa_reviewer.id,
            stars=3,
            body="ביקורת (בדיקה) שנוצרה בריצת QA",
        )
    )
    db.commit()

    seed_mod.seed_demo_business(db, refresh=True)

    fresh = db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()
    titles = [g.title for g in db.query(GroupBuy).all()]
    bodies = [r.body for r in db.query(ProducerReview).all()]
    assert not any("(בדיקה)" in t for t in titles), titles
    assert not any("(בדיקה)" in b for b in bodies), bodies
    # ...and the re-seeded business still has its own content, so the sweep is
    # not passing merely because everything was deleted.
    assert db.query(GroupBuy).filter(GroupBuy.producer_id == fresh.id).count() == 1
    assert db.query(ProducerReview).filter(
        ProducerReview.producer_id == fresh.id
    ).count() == len(seed_mod.DEMO_REVIEWS)


# ── the new fixtures ─────────────────────────────────────────────────────────
def test_offer_is_active_now_and_future_dated(db, seeded, seed_mod):
    offer = db.query(ProducerOffer).filter(ProducerOffer.producer_id == seeded.id).one()
    # starts_at NULL is what "active now" means (models.py:1281); a date here
    # would make the offer scheduled and photograph as nothing.
    assert offer.starts_at is None
    assert offer.is_active is True
    assert offer.expires_at > israel_today()
    # The type must be one the CHECK allows. This assertion exists because the
    # first version of the seed used "discount_first_order", which is not —
    # CI's seed job caught it with a raw IntegrityError, and a test naming the
    # allowed set fails in a way that says what to do instead.
    assert offer.offer_type in {
        "free_delivery_above",
        "gift_above",
        "first_order",
        "pickup_discount",
        "custom",
    }
    # Both threshold columns NULL together — producer_offer_threshold_pair.
    assert (offer.threshold_value is None) == (offer.threshold_unit is None)


def test_rescue_bag_satisfies_its_db_checks(db, seeded, seed_mod):
    """Every NOT NULL column set, every CHECK respected.

    Written after CI caught an invalid `offer_type` on the sibling fixture: the
    sandbox has no database, so a missing NOT NULL (`cancel_until`) or an
    out-of-range qty surfaces only as a raw IntegrityError in a CI log. This
    turns that into a named failure. Skipped where the rescue tables are
    absent, the same condition the seed itself checks.
    """
    from sqlalchemy import inspect as sa_inspect

    if not sa_inspect(db.get_bind()).has_table("rescue_offers"):
        pytest.skip("rescue tables absent — the seed skips the bag too")

    from app.models.models import RESCUE_MAX_QTY_PER_OFFER, RescueOffer

    bag = db.query(RescueOffer).one()
    assert bag.cancel_until is not None, "nullable=False with no default"
    assert 1 <= bag.qty_total <= RESCUE_MAX_QTY_PER_OFFER
    assert 0 <= bag.qty_left <= bag.qty_total
    assert bag.price_agorot >= 0
    assert bag.pickup_end > bag.pickup_start
    assert bag.status == "active"
    # MEH-2808 — this used to read `bag.date == israel_today()`, justified as
    # "a bag for TODAY, so /rescue shows it". That reasoning was the bug: today
    # is not what makes a bag visible, beating the listing's margin is, and a
    # bag for today seeded after ~18:45 is exactly what /rescue HIDES. The
    # window is now derived from the clock and may legitimately land on
    # tomorrow, so what gets asserted is the property the old line was reaching
    # for — stated directly, against the router's own constant.
    assert bag.pickup_end > utc_now() + RESERVE_CLOSES_BEFORE_END, (
        f"the seeded bag closes {bag.pickup_end} UTC, which the public listing "
        f"filter at rescue.py:463 hides"
    )
    assert bag.date in (israel_today(), israel_today() + timedelta(days=1)), (
        f"the bag landed on {bag.date}, neither today nor tomorrow in Israel"
    )

    # MEH-2679: these naive columns hold UTC INSTANTS. `datetime.combine` of an
    # Israel wall hour would store 18:00 as if it were UTC — 21:00 in Israel in
    # summer — so a bag advertised for 18:00 would open three hours late. The
    # wall hours are no longer constants to compare against, so what is pinned
    # is the invariant underneath: every stored instant is naive, and all three
    # read back on the SAME Israel day as the offer's own `date`. A stripped
    # tzinfo would shift one of them across midnight and break that.
    for stored in (bag.pickup_start, bag.pickup_end, bag.cancel_until):
        assert stored.tzinfo is None, "the column convention is naive-UTC"
        in_israel = stored.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)
        assert in_israel.date() == bag.date, (
            f"stored {stored} reads as {in_israel:%d/%m %H:%M %Z} in Israel, "
            f"but the offer is dated {bag.date}"
        )
    # Collection opens before it closes, and cancellation runs to the opening.
    assert bag.cancel_until == bag.pickup_start


def test_insights_raw_rows_and_rollup_agree(db, seeded_with_watermark, seed_mod):
    """The property the dashboard depends on and a screenshot cannot show.

    producer_me.py reads the 7d/30d arms from the raw tables and the `total`
    arm through producer_analytics_daily. If the two disagree the owner sees a
    total that contradicts her own 30-day chart — MEH-160's inflation through a
    side door.

    MEH-2801 — THE AGREEMENT IS PER DAY, OVER THE DAYS THE AGGREGATE OWNS, not
    over all 30. `total` is `Σ aggregate + raw WHERE day > watermark`
    (`rollup_snapshot`), so the halves must partition the days exactly: at or
    below the watermark the aggregate carries the day, above it the raw rows
    do. Summing all 30 raw rows against all aggregate rows — which is what this
    test did before — demanded a row for every day and so asserted the very bug
    MEH-2801 fixes.
    """
    seeded, watermark = seeded_with_watermark
    pid = seeded.id
    raw_views = (
        db.query(ProducerPageView).filter(ProducerPageView.producer_id == pid).count()
    )
    raw_search = (
        db.query(ProducerPageView)
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.referrer == "search",
        )
        .count()
    )
    raw_wa = (
        db.query(ProducerWhatsAppClick)
        .filter(ProducerWhatsAppClick.producer_id == pid)
        .count()
    )

    rollup = (
        db.query(ProducerAnalyticsDaily)
        .filter(ProducerAnalyticsDaily.producer_id == pid)
        .all()
    )
    # Every day the aggregate owns, derived from the rows themselves rather
    # than stated — and every one must be at or below the watermark.
    owned = sorted(r.day for r in rollup)
    assert owned, "arrangement failed — the seed wrote no aggregate row at all"
    assert owned[-1] <= watermark, (
        f"the aggregate reaches {owned[-1]}, above the watermark {watermark} — "
        "the MEH-2801 defect"
    )

    # The sums agree OVER THOSE DAYS. Counted from the raw rows on exactly the
    # same days, so this fails if either side moves.
    owned_set = set(owned)
    raw_views_owned = sum(
        1
        for v in db.query(ProducerPageView).filter(ProducerPageView.producer_id == pid)
        if _israel_date(v.created_at) in owned_set
    )
    raw_search_owned = sum(
        1
        for v in db.query(ProducerPageView).filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.referrer == "search",
        )
        if _israel_date(v.created_at) in owned_set
    )
    raw_wa_owned = sum(
        1
        for c in db.query(ProducerWhatsAppClick).filter(
            ProducerWhatsAppClick.producer_id == pid
        )
        if _israel_date(c.clicked_at) in owned_set
    )
    assert sum(r.views_unique for r in rollup) == raw_views_owned
    assert sum(r.views_search_unique for r in rollup) == raw_search_owned
    assert sum(r.whatsapp_clicks for r in rollup) == raw_wa_owned

    # The days ABOVE the watermark are not missing — they are raw-only, which
    # is where the reader counts them until the nightly job rolls them.
    assert raw_views_owned < raw_views, (
        "every raw view landed at or below the watermark, so this test is not "
        "exercising the partition it claims to"
    )

    # And the RAW totals are still the numbers the constants asked for, so a
    # drifting `_spread` cannot quietly halve the traffic. Unchanged by
    # MEH-2801: the raw rows still cover all 30 days.
    assert raw_views == seed_mod.DEMO_INSIGHTS["views_total"]
    assert raw_wa == seed_mod.DEMO_INSIGHTS["whatsapp_clicks"]
    assert raw_search <= raw_views


def test_each_raw_row_lands_on_its_own_rollup_day(db, seeded_with_watermark, seed_mod):
    """The alignment the sums cannot see, now asserted as a PARTITION.

    `test_insights_raw_rows_and_rollup_agree` compares TOTALS, so a raw row
    sitting on the Israel day either side of its roll-up row still sums
    correctly and the chart is still wrong. A UTC stamp N*24h back is the same
    Israel day only while the offset is unchanged at both ends; near midnight
    Israel it is not (MEH-2290). Hence the midday anchor, and hence this.

    MEH-2801 — this asserts BOTH directions, which is strictly more than the
    "no stray raw day" check it replaces:

      * a raw day at or below the watermark MUST have a roll-up row — the
        original alignment property, unchanged, and still the thing that
        catches a midnight-boundary drift;
      * a raw day above the watermark MUST NOT have one — the new half, and
        the one the old assertion could not express, because "every raw day
        has a roll-up row" is exactly what the defect produced.
    """
    seeded, watermark = seeded_with_watermark
    rollup_days = {
        r.day
        for r in db.query(ProducerAnalyticsDaily).filter(
            ProducerAnalyticsDaily.producer_id == seeded.id
        )
    }
    raw_days = {
        _israel_date(v.created_at)
        for v in db.query(ProducerPageView).filter(
            ProducerPageView.producer_id == seeded.id
        )
    }
    at_or_below = {d for d in raw_days if d <= watermark}
    above = {d for d in raw_days if d > watermark}
    assert at_or_below and above, (
        "the arrangement must straddle the watermark for this to discriminate; "
        f"got {len(at_or_below)} at/below and {len(above)} above"
    )

    assert sorted(at_or_below - rollup_days) == [], (
        "page views on an Israel day at or below the watermark with no "
        "roll-up row — the alignment this test has always guarded"
    )
    assert sorted(rollup_days & above) == [], (
        "a roll-up row above the watermark — this is the MEH-2801 defect: it "
        "lifts the global watermark and strands every unrolled day beneath it"
    )


def test_every_view_counts_once_per_day(db, seeded, seed_mod):
    """Page views dedupe per (israel-day, viewer_ip_hash) — MEH-160.

    Seeding one shared hash would collapse each day to a single counted view
    and the chart would read flat at 1 whatever DEMO_INSIGHTS says. So every
    seeded row must carry its own hash.
    """
    hashes = [
        v.viewer_ip_hash
        for v in db.query(ProducerPageView).filter(
            ProducerPageView.producer_id == seeded.id
        )
    ]
    assert len(hashes) == len(set(hashes))
    assert all(h and len(h) <= 64 for h in hashes)


def test_contact_clicks_and_followers(db, seeded, seed_mod):
    assert (
        db.query(ContactClick).filter(ContactClick.producer_id == seeded.id).count()
        == seed_mod.DEMO_INSIGHTS["contact_clicks"]
    )
    # `favorites` has a composite PK (user_id, producer_id), so N followers
    # genuinely needs N users — the count cannot be faked with repeated rows.
    assert (
        db.query(Favorite).filter(Favorite.producer_id == seeded.id).count()
        == seed_mod.DEMO_INSIGHTS["favorites"]
    )


def test_marketing_fixtures_are_idempotent(db, seeded, seed_mod):
    """ "Add if missing", per the ticket — not "add again on every run"."""
    before = (
        db.query(ProducerOffer).count(),
        db.query(ProducerPageView).count(),
        db.query(Favorite).count(),
        db.query(ContactClick).count(),
    )
    added = seed_mod.seed_marketing_fixtures(db)
    after = (
        db.query(ProducerOffer).count(),
        db.query(ProducerPageView).count(),
        db.query(Favorite).count(),
        db.query(ContactClick).count(),
    )
    assert added == 0, "a second run reported seeding something"
    assert before == after

    # Named explicitly, not just covered by the tuple above: `rescue_offers`
    # has only a NON-unique index on (producer_location_id, date), so nothing
    # in the database rejects a duplicate bag — the seed's own probe is the
    # only thing standing between a re-run and two cards on /rescue. The first
    # version of this PR had no probe, and this is the assertion that catches
    # its absence.
    from sqlalchemy import inspect as sa_inspect

    if sa_inspect(db.get_bind()).has_table("rescue_offers"):
        from app.models.models import RescueOffer

        assert db.query(RescueOffer).count() == 1, "a second bag was seeded"


def test_refresh_then_reseed_leaves_exactly_one_of_each(db, seed_mod, bakery_category):
    """`--refresh` after the fixtures exist, then seed again — the staging flow.

    The reviewer asked whether `--refresh` can even survive the new rows.
    Checked at the schema: `producer_page_views`, `producer_whatsapp_clicks`,
    `producer_contact_clicks`, `favorites` and `producer_analytics_daily` all
    carry `ondelete="CASCADE"` on `producer_id`, `rescue_offers` carries it on
    `producer_location_id`, and `ProducerOffer` is reached by
    `Producer.offers`' `cascade="all, delete-orphan"`. So the delete is clean
    in theory — this is the test that says so in practice, because CI seeds a
    FRESH database where `_delete_existing` finds nothing to delete and would
    never exercise this path.
    """
    watermark = _arrange_watermark(db, bakery_category)
    seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    seed_mod.seed_demo_business(db, refresh=True)
    seed_mod.seed_marketing_fixtures(db)

    producer = db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()
    assert db.query(ProducerOffer).count() == 1

    # MEH-2801: the expected number of aggregate rows is DERIVED from the
    # watermark, not stated as DEMO_INSIGHTS["days"]. Stating 30 is what made
    # this test demand a row for today and so assert the defect. The window is
    # `today-29 .. today`, so the rows are the days in it at or below the
    # watermark.
    # Derived from the RAW rows, not from arithmetic over the window: the
    # roll-up covers a day the producer was active on, and `_spread` is a
    # rising ramp whose oldest days carry no traffic at all. Counting
    # "every day <= watermark" would over-count those by exactly the number of
    # silent days, which is drift of the kind this derivation exists to avoid.
    active_days = {
        _israel_date(v.created_at)
        for v in db.query(ProducerPageView).filter(
            ProducerPageView.producer_id == producer.id
        )
    } | {
        _israel_date(c.clicked_at)
        for c in db.query(ProducerWhatsAppClick).filter(
            ProducerWhatsAppClick.producer_id == producer.id
        )
    }
    expected_days = sorted(d for d in active_days if d <= watermark)
    assert expected_days, "arrangement failed — no day in the window is owned"
    demo_rollup = (
        db.query(ProducerAnalyticsDaily)
        .filter(ProducerAnalyticsDaily.producer_id == producer.id)
        .count()
    )
    assert demo_rollup == len(expected_days), (
        f"{demo_rollup} aggregate row(s) after a refresh + reseed; the "
        f"watermark {watermark} owns {len(expected_days)} day(s) of the window"
    )
    assert (
        db.query(ProducerPageView)
        .filter(ProducerPageView.producer_id == producer.id)
        .count()
        == seed_mod.DEMO_INSIGHTS["views_total"]
    ), "the raw rows still cover all 30 days — MEH-2801 changed only the roll-up"

    # No orphans left pointing at the deleted producer: the demo's rows plus
    # the single anchor row belonging to the control producer.
    assert db.query(ProducerAnalyticsDaily).count() == len(expected_days) + 1
    assert db.query(ProducerOffer).count() == 1


def test_insights_skip_when_raw_rows_already_exist(db, seeded, seed_mod):
    """The probe covers the RAW table, not only the roll-up.

    On staging the roll-up job writes `producer_analytics_daily` from real
    traffic, and raw rows are pruned at 90 days while roll-ups are kept
    (MEH-2079) — so a roll-up-only probe would read "already seeded" and the
    fixtures would silently never land. This pins the raw half.
    """
    producer = db.query(Producer).filter(Producer.slug == seed_mod.DEMO_SLUG).one()
    db.query(ProducerAnalyticsDaily).filter(
        ProducerAnalyticsDaily.producer_id == producer.id
    ).delete()
    db.commit()
    # Roll-up gone, raw rows still there — the post-purge shape inverted.
    assert (
        db.query(ProducerPageView)
        .filter(ProducerPageView.producer_id == producer.id)
        .count()
        > 0
    )

    before = db.query(ProducerPageView).count()
    seed_mod.seed_marketing_fixtures(db)
    assert db.query(ProducerPageView).count() == before, (
        "raw rows already present — the seed must not stack more on top"
    )


def test_fixtures_skip_silently_without_a_demo_producer(db, seed_mod):
    """No demo business → 0 parts and no exception.

    `main()` calls this unconditionally, including on a database where the
    demo seed has never run, so a raise here would break an ordinary seed.
    """
    assert seed_mod.seed_marketing_fixtures(db) == 0


def test_refresh_does_not_accumulate_follower_users(db, seed_mod, bakery_category):
    """The display-only follower accounts are in `_delete_existing`'s email set.

    Their `favorites` rows cascade with the producer either way; the users
    themselves would otherwise pile up one set per --refresh.
    """
    seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    seed_mod.seed_demo_business(db, refresh=True)
    seed_mod.seed_marketing_fixtures(db)

    emails = [
        seed_mod.DEMO_FOLLOWER_EMAIL_TEMPLATE.format(i + 1)
        for i in range(seed_mod.DEMO_INSIGHTS["favorites"])
    ]
    assert db.query(User).filter(User.email.in_(emails)).count() == len(emails)
