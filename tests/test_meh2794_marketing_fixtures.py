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
from datetime import timezone

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
from app.utils.clock import ISRAEL_TZ, israel_today

# Placed in its own block, matching tests/test_seed_demo_business.py:31. Ruff
# 0.16.x sorts `tests.*` up with the third-party block instead, but the pinned
# version in backend/uv.lock is 0.15.22 and THAT is what `Backend lint (ruff)`
# runs — and it accepts this layout today in the sibling file. Local ruff
# flagging I001 here is the same version drift as its RUF100 complaints about
# the `noqa: E402` lines the pinned version still needs.
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


@pytest.fixture()
def seeded(db, seed_mod, bakery_category):
    """The demo business plus the MEH-2794 fixtures, as `main()` orders them."""
    producer = seed_mod.seed_demo_business(db)
    seed_mod.seed_marketing_fixtures(db)
    return producer


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
    assert bag.date == israel_today(), "a bag for TODAY, so /rescue shows it"

    # MEH-2679: these naive columns hold UTC INSTANTS. `datetime.combine` of an
    # Israel wall hour would store 18:00 as if it were UTC — 21:00 in Israel in
    # summer — so a bag advertised for 18:00 would open three hours late. Read
    # the stored instant back in Israel and check the wall hour is the one the
    # constants asked for.
    for stored, hour in (
        (bag.pickup_start, seed_mod.DEMO_RESCUE_BAG["pickup_from_hour"]),
        (bag.pickup_end, seed_mod.DEMO_RESCUE_BAG["pickup_to_hour"]),
        (bag.cancel_until, seed_mod.DEMO_RESCUE_BAG["pickup_from_hour"]),
    ):
        assert stored.tzinfo is None, "the column convention is naive-UTC"
        in_israel = stored.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)
        assert in_israel.hour == hour, (
            f"stored {stored} reads as {in_israel:%H:%M %Z} in Israel, "
            f"but the bag is advertised for {hour}:00"
        )
        assert in_israel.date() == bag.date


def test_insights_raw_rows_and_rollup_agree(db, seeded, seed_mod):
    """The property the dashboard depends on and a screenshot cannot show.

    producer_me.py reads the 7d/30d arms from the raw tables and the `total`
    arm through producer_analytics_daily. If the two disagree the owner sees a
    total that contradicts her own 30-day chart — MEH-160's inflation through a
    side door.
    """
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
    assert len(rollup) == seed_mod.DEMO_INSIGHTS["days"]
    assert sum(r.views_unique for r in rollup) == raw_views
    assert sum(r.views_search_unique for r in rollup) == raw_search
    assert sum(r.whatsapp_clicks for r in rollup) == raw_wa

    # And the totals are the numbers the constants asked for, so a drifting
    # `_spread` cannot quietly halve the traffic.
    assert raw_views == seed_mod.DEMO_INSIGHTS["views_total"]
    assert raw_wa == seed_mod.DEMO_INSIGHTS["whatsapp_clicks"]
    assert raw_search <= raw_views


def test_each_raw_row_lands_on_its_own_rollup_day(db, seeded, seed_mod):
    """The alignment the sums cannot see.

    `test_insights_raw_rows_and_rollup_agree` compares TOTALS, so a raw row
    sitting on the Israel day either side of its roll-up row still sums
    correctly and the chart is still wrong. A UTC stamp N*24h back is the same
    Israel day only while the offset is unchanged at both ends; near midnight
    Israel it is not (MEH-2290). Hence the midday anchor, and hence this.
    """
    days_with_rollup = {
        r.day
        for r in db.query(ProducerAnalyticsDaily).filter(
            ProducerAnalyticsDaily.producer_id == seeded.id
        )
    }
    stray = sorted(
        {
            v.created_at.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ).date()
            for v in db.query(ProducerPageView).filter(
                ProducerPageView.producer_id == seeded.id
            )
        }
        - days_with_rollup
    )
    assert stray == [], "page views on an Israel day with no roll-up row"


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
