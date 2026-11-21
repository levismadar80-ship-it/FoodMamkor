"""
Module:   seed_demo_business
Purpose:  Seed ONE complete "sample perfect listing" demo business on the
          STAGING database (MEH-1074 Wave 3): full profile story, photos,
          products, an approved recipe, a future event, delivery areas,
          reviews from seed consumers (one with an owner reply), verified
          tier, open-for-orders.
Touches:  DB tables producers / users / products / delivery_areas /
          producer_categories / producer_recipes / producer_reviews / events.
Does NOT: touch production — a hard environment guard refuses any non-local
          DB host unless RAILWAY_ENVIRONMENT == "staging". Does NOT create
          categories (backend/seed_data.py owns that; this script looks the
          category up by name and aborts if missing). Does NOT regenerate the
          MEH-2794 marketing numbers on a plain re-run: `seed_marketing_fixtures`
          skips the insights-and-followers block as soon as ANY analytics or
          page-view row exists for the demo business, and one real page view on
          staging is enough. **`--refresh` is REQUIRED, not optional, when you
          want those numbers rebuilt** (MEH-2808). The rescue bag is the one
          exception: a bag whose pickup window has already closed is replaced on
          any run, so /rescue is never left with a dead card.
Related:  backend/seed_data.py (base seed patterns) · MEH-999 (producer
          dogfood) · MEH-997 (E2E seed) · MEH-409 (first-10 — the demo is
          swapped for the best real profile after first-10).
History:  MEH-1074 Wave 3 (creation); MEH-1241 (--sync-users QA passwords);
          MEH-1432 (multi-location + delivery-only demo); MEH-1528 (QA admin
          account + dietary-scope demo producers for auth-free QA); MEH-2897
          (--golden: the seven golden-path personas, see GOLDEN_BUSINESSES);
          MEH-2952 chunk 4 (--mark-test: opt-in is_test, off by default).

Run (Sapir, Git Bash, after approving the demo identity below):
    railway run python backend/scripts/seed_demo_business.py
    railway run python backend/scripts/seed_demo_business.py --golden  # personas only
Local:
    python backend/scripts/seed_demo_business.py            # skip-if-exists
    python backend/scripts/seed_demo_business.py --refresh  # recreate
    python backend/scripts/seed_demo_business.py --golden   # golden personas only
    python backend/scripts/seed_demo_business.py --mark-test  # hide the demos (local only)
"""

import argparse
import os
import secrets
import sys
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from sqlalchemy import inspect as sa_inspect  # noqa: E402  # imports must follow sys.path.insert (script shim)

from app.auth import hash_password  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.database import SessionLocal, engine  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.models import (  # noqa: E402  # imports must follow sys.path.insert (script shim)
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    ProducerLocation,
    Product,
    ProducerRecipe,
)
from app.models.models import (  # noqa: E402  # imports must follow sys.path.insert (script shim)
    ContactClick,
    Event,
    Experience,
    Favorite,
    GroupBuy,
    GroupBuyCommit,
    ProducerAnalyticsDaily,
    ProducerOffer,
    ProducerPageView,
    ProducerReview,
    ProducerWhatsAppClick,
    RescueOffer,
    User,
)
from app.services.analytics_rollup import rollup_watermark  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.utils.clock import israel_today, utc_now  # noqa: E402  # imports must follow sys.path.insert (script shim)

# MEH-3542: the rest of this program lives in the parts below, moved
# verbatim and dependencies-first; every name is re-exported here.
from scripts._seed_demo_business_p01 import (  # noqa: E402, F401 — re-exported
    ADMIN_NOTE,
    AVAILABILITY_DEMOS,
    DELIVERY_ONLY_LOCATION,
    DELIVERY_ONLY_PRODUCER,
    DELIVERY_ONLY_SLUG,
    DEMO_ADMIN_EMAIL,
    DEMO_ADMIN_NAME,
    DEMO_CATEGORY_NAME,
    DEMO_CONSUMER_EMAIL,
    DEMO_CONSUMER_NAME,
    DEMO_DELIVERY_AREAS,
    DEMO_EVENT,
    DEMO_EXPERIENCES,
    DEMO_FOLLOWER_EMAIL_TEMPLATE,
    DEMO_GROUP_BUY,
    DEMO_GROUP_BUY_COMMIT_QUANTITIES,
    DEMO_INSIGHTS,
    DEMO_KASHRUT_REQUEST,
    DEMO_LOCATIONS,
    DEMO_MODERATION_EXPERIENCES,
    DEMO_OFFER,
    DEMO_OWNER_EMAIL,
    DEMO_PRODUCER,
    DEMO_PRODUCTS,
    DEMO_RECIPE,
    DEMO_RESCUE_BAG,
    DEMO_REVIEWS,
    DEMO_SLUG,
    DIETARY_DEMO_CITY,
    DIETARY_DEMO_IMAGE,
    DIETARY_SCOPE_DEMOS,
    ISRAEL_TZ,
    KashrutBadgeRequest,
    RESERVE_CLOSES_BEFORE_END,
    RETIRED_AVAILABILITY_DEMO_SLUGS,
    _bag_still_open,
    _delete_existing,
    _israel_hhmm,
    _israel_wall_to_utc,
    _seed_kashrut_request,
    _stale_bags_query,
    _to_naive_utc,
    time,
)
from scripts._seed_demo_business_p02 import (  # noqa: E402, F401 — re-exported
    GOLDEN_ADMIN,
    GOLDEN_ADMIN_NOTE,
    GOLDEN_ADMIN_PASSWORD_ENV,
    GOLDEN_BUSINESSES,
    GOLDEN_CONSUMER_PASSWORD_ENV,
    GOLDEN_CUSTOMER,
    GOLDEN_DESCRIPTION,
    GOLDEN_EVENT,
    GOLDEN_EXPERIENCE,
    GOLDEN_MARKETS,
    GOLDEN_OWNER_PASSWORD_ENV,
    GOLDEN_PICKUPS,
    GOLDEN_PRODUCTS,
    _demo_pickup_window,
    _golden_dated_rows,
    _golden_events,
    _golden_extras,
    _golden_locations_kashrut,
    _golden_markets,
    _golden_passwords,
    _golden_products,
    _golden_refresh_dates,
    _golden_user,
    _seed_moderation_experiences,
    _seed_offer,
    _spread,
    _sync_users,
    golden_persona_emails,
    seed_availability_demos,
    seed_dietary_scope_demos,
)


def _assert_not_production() -> None:
    """Refuse to run against anything that is not localhost or Railway staging.

    Two independent signals must both fail before we abort:
    - DB host is local (localhost/127.0.0.1) → always allowed (dev/CI/tests).
    - RAILWAY_ENVIRONMENT == "staging" → the Railway staging service/CLI
      context (deploy.yml sets the same var; production sets "production").
    """
    host = (
        urlparse(str(engine.url).replace("postgresql+psycopg2", "postgresql")).hostname
        or ""
    ).lower()
    if host in ("localhost", "127.0.0.1"):
        return
    if os.getenv("RAILWAY_ENVIRONMENT", "").lower() == "staging":
        return
    sys.exit(
        f"REFUSING to seed demo business: DB host '{host}' is not local and "
        "RAILWAY_ENVIRONMENT != 'staging'. This script must never touch production."
    )


def _seed_group_buy(db, producer) -> None:
    """MEH-1706 §2 item 1 — one open group buy, funded by its own commits.

    Extracted rather than inlined because the loop and its guard pushed
    `seed_demo_business` past Ruff's C901 complexity ceiling (13 > 10).
    """
    group_buy = GroupBuy(
        producer_id=producer.id,
        title=DEMO_GROUP_BUY["title"],
        description=DEMO_GROUP_BUY["description"],
        product_name=DEMO_GROUP_BUY["product_name"],
        unit=DEMO_GROUP_BUY["unit"],
        price_per_unit_regular=DEMO_GROUP_BUY["price_per_unit_regular"],
        price_per_unit_group=DEMO_GROUP_BUY["price_per_unit_group"],
        min_participants=DEMO_GROUP_BUY["min_participants"],
        max_participants=DEMO_GROUP_BUY["max_participants"],
        deadline=utc_now() + timedelta(days=DEMO_GROUP_BUY["days_ahead"]),
        city=DEMO_PRODUCER["city"],
        fulfillment_note=DEMO_GROUP_BUY["fulfillment_note"],
        status="open",
        # DO NOT set funded_notified_at here — it is a one-way latch for the
        # open->funded notification pair (models.py). Seeding it pre-armed means
        # the demo can never demonstrate that notification.
    )
    db.add(group_buy)
    db.flush()

    # Committers reuse users this script already seeds: the QA consumer and the
    # first review author. No new emails (ticket constraint), and each user
    # appears once — UNIQUE (group_buy_id, user_id) makes a repeat a hard error.
    committer_emails = [DEMO_CONSUMER_EMAIL, DEMO_REVIEWS[0]["email"]]
    for email, quantity in zip(committer_emails, DEMO_GROUP_BUY_COMMIT_QUANTITIES):
        committer = db.query(User).filter(User.email == email).first()
        if committer is None:
            # Loud rather than silent: a missing committer leaves the group buy
            # below min_participants, which reads as a product state rather than
            # a broken seed.
            sys.exit(f"Group-buy committer '{email}' not found — seed order changed?")
        db.add(
            GroupBuyCommit(
                group_buy_id=group_buy.id,
                user_id=committer.id,
                quantity=quantity,
                phone=DEMO_PRODUCER["phone"],
            )
        )


def seed_open_group_buy(db) -> bool:
    """MEH-2981 — keep ONE live demo group buy without `--refresh`.

    `_seed_group_buy` runs only when the demo business is CREATED, and its
    deadline is relative (`days_ahead`), so on staging it expires and
    `GET /group-buys` (open + `deadline >= now`, routers/group_buys.py:120-128)
    goes empty — which also hides the «קבוצות רכישה» hub tab (supply gate,
    frontend/lib/use-hub-nav-gate.js). The only way back was `--refresh`, which
    deletes and recreates the demo business and every test row hanging off it.

    Same contract as `seed_marketing_fixtures`: add only if missing, never
    delete. Expired / closed group buys stay exactly as they are.

    Returns True when it seeded one, so the caller prints a derived line.
    """
    producer = db.query(Producer).filter(Producer.slug == DEMO_SLUG).first()
    if producer is None:
        print(f"Demo producer /{DEMO_SLUG} not found — skipping the open group buy.")
        return False
    live = (
        db.query(GroupBuy)
        .filter(
            GroupBuy.producer_id == producer.id,
            GroupBuy.status == "open",
            GroupBuy.deadline >= utc_now(),
        )
        .first()
    )
    if live is not None:
        print(f"Open demo group buy already live for /{DEMO_SLUG} — skipping.")
        return False
    _seed_group_buy(db, producer)
    db.commit()
    print(f"Seeded a fresh open demo group buy for /{DEMO_SLUG}.")
    return True


def _seed_rescue_bag(db, producer) -> bool:
    """MEH-2794 — one rescue bag for TODAY, so /rescue has a card to shoot.

    Returns whether a bag was actually added, so the caller's count is derived
    from what happened rather than from what was attempted.

    SKIPS SILENTLY when the rescue tables are absent, per the ticket: the
    rescue-bags pilot is dark behind a flag (MEH-2644) and an environment whose
    schema predates it must still seed cleanly. Asked of the live schema via
    `inspect`, not of a flag or a try/except around the INSERT — a flag says
    what the product shows, not what the database has.

    Hangs off producer_location_id, NOT producer_id (models.py:2871): a bag
    belongs to the place it is collected from. Uses the producer's PRIMARY
    location and does nothing if it has none, because a bag with no pickup
    point is not collectable.
    """
    if not sa_inspect(db.get_bind()).has_table("rescue_offers"):
        print(
            "Rescue tables absent — skipping the demo rescue bag (MEH-2644 is dark here)."
        )
        return False

    location = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer.id,
            ProducerLocation.is_primary.is_(True),
        )
        .first()
    )
    if location is None:
        print("Demo producer has no primary location — skipping the rescue bag.")
        return False

    now = utc_now()
    day, pickup_start, pickup_end = _demo_pickup_window(now)

    # IDEMPOTENT, per the ticket's "add if missing". Keyed on (location, date)
    # because that is what a bag IS — one offer from one place on one day; the
    # table indexes exactly that pair (ix_rescue_offers_location_date).
    #
    # This was missing in the first version: `seed_marketing_fixtures` guarded
    # the offer and the insights but delegated the bag's check to this function,
    # which never had one, so a second run left the demo business with two
    # identical bags on /rescue — the "looks odd" the ticket exists to remove.
    # Caught by test_marketing_fixtures_are_idempotent on its first CI run.
    #
    # MEH-2808 — "add if missing" now has one exception: a bag whose window has
    # ALREADY CLOSED is replaced rather than kept. Without it a plain re-run
    # late in the day found today's dead 18:00-19:00 bag, skipped, and left
    # /rescue empty with no way back until tomorrow. The replacement is scoped
    # to a window that can no longer pass `rescue.py:463` — a LIVE bag is still
    # left alone, so this does not reintroduce the double-bag it replaced.
    #
    # `--refresh` needs none of this: `_delete_existing` bulk-deletes the demo's
    # ProducerLocation rows and `RescueOffer.producer_location_id` carries
    # `ondelete="CASCADE"`, so the bag is already gone by the time this runs.
    # Verified in the schema, and pinned by
    # `test_refresh_clears_the_bag_through_the_location_cascade` rather than by
    # deletion code here, which would be unreachable by construction.
    # MEH-2814 — the sweep is per LOCATION, not per (location, day). Keying it
    # on the new window's day left a dead row behind on every evening run: a
    # seed at 18:50 targets tomorrow, so today's already-closed bag was neither
    # replaced nor removed. Hidden from /rescue by the filter, so never
    # user-visible, but it accumulated.
    #
    # Still scoped to bags that can no longer pass `rescue.py:463` — a LIVE bag
    # anywhere is left alone and short-circuits, so this does not reintroduce
    # the double-bag #4114 removed.
    live = (
        db.query(RescueOffer)
        .filter(
            RescueOffer.producer_location_id == location.id,
            _bag_still_open(now),
        )
        .first()
    )
    if live is not None:
        return False

    # MEH-2816 — the sweep deletes through `_stale_bags_query`, which carries
    # its own `pickup_end` condition and is shared with the test that proves
    # it. This previously selected every bag at the location, under the name
    # `closed`, and was correct only because the guard above returned first.
    stale = _stale_bags_query(db, location.id, now).all()
    for dead in stale:
        # Deleting one takes its rescue_orders with it, and their
        # rescue_reviews after that — both FKs are ondelete="CASCADE"
        # (models.py: RescueOffer -> RescueOrder -> RescueReview). Deliberate:
        # this is the demo fixture on staging, and the alternative is the dead
        # rows MEH-2814 removed. Pinned by
        # `test_the_sweep_takes_orders_and_reviews_with_a_closed_bag` so a
        # narrowed cascade is noticed here rather than as an IntegrityError on
        # a seed run.
        print(
            f"Removing the demo rescue bag for {dead.date}: its window closed "
            f"at {_israel_hhmm(dead.pickup_end)} Israel time."
        )
        db.delete(dead)
    if stale:
        db.flush()

    db.add(
        RescueOffer(
            producer_location_id=location.id,
            date=day,
            qty_total=DEMO_RESCUE_BAG["qty_total"],
            qty_left=DEMO_RESCUE_BAG["qty_left"],
            price_agorot=DEMO_RESCUE_BAG["price_agorot"],
            value_min_agorot=DEMO_RESCUE_BAG["value_min_agorot"],
            value_max_agorot=DEMO_RESCUE_BAG["value_max_agorot"],
            pickup_start=pickup_start,
            pickup_end=pickup_end,
            # REQUIRED and has no default — `cancel_until` is nullable=False
            # with no server_default (models.py:2928), and the API takes it
            # from the owner's own body (rescue.py:421). Set to the moment
            # collection opens: "cancel any time until pickup starts", which
            # is the only reading that needs no further policy decision.
            cancel_until=pickup_start,
        )
    )
    return True


def _seed_insights(db, producer, watermark: date | None) -> int:
    """MEH-2794 — believable dashboard numbers for the demo producer.

    Sapir 07/11: a dashboard screenshot reading "0 WhatsApp clicks" on a page
    whose job is to persuade reads as a dead product. These are modest and
    mutually consistent.

    THE RAW ROWS AND THE ROLL-UP MUST AGREE. The dashboard reads its 7d/30d
    arms from the raw tables and its `total` arm through
    `producer_analytics_daily` (producer_me.py's `windowed(..., rollup_col=)`).
    So the roll-up here is DERIVED from the rows just inserted, never written
    from DEMO_INSIGHTS directly — otherwise the owner's total could disagree
    with her own chart, which is the MEH-160 inflation through a side door.

    Page views dedupe per (israel-day, viewer_ip_hash) (MEH-160), so each
    seeded view needs its OWN hash to count: reusing one hash would collapse a
    whole day to 1 and the chart would read flat at 1 regardless of the numbers
    above. The hashes are random hex of the real column width (64) — not real
    IPs, hashed or otherwise. One hash per view is also what makes the
    aggregate values below equal to what the real job computes: the job counts
    DISTINCT (day, hash) pairs, and with a unique hash per row that equals the
    row count.

    MEH-2801 — AN AGGREGATE ROW IS ONLY EVER WRITTEN FOR A DAY AT OR BELOW THE
    WATERMARK, and `watermark` is read ONCE by the caller.
    `analytics_rollup.rollup_watermark()` is `max(producer_analytics_daily.day)`
    GLOBALLY, across every producer — it says so in its own docstring — the
    nightly job starts at `watermark + 1` (`pending_days`, and the same floor
    in `run_rollup`) and the watermark only moves forward. So a row written for
    TODAY — which is what the first version of this function did, `offset`
    starting at 0 — jumps the watermark past every day the job has not rolled
    yet, the job never returns for them, and `rollup_snapshot`'s reader finds
    them in neither half: aggregate ≤ watermark, raw > watermark. Those days
    then vanish from the `total` arm of every OTHER producer's dashboard,
    permanently. (Functions rather than line numbers on purpose — the reviewer
    is right that the numbers drift, and these four names do not.)

    Days above the watermark are left raw-only on purpose. The nightly job
    picks them up like any other traffic, and until it does the dashboard's
    raw half already covers them, so nothing is missing in the meantime.

    `watermark is None` means the aggregate table is empty and owns nothing;
    writing the first row would hand it a watermark it never earned, so this
    writes none.

    Returns the number of aggregate rows written — days at or below the
    watermark on which the producer was active — so the caller reports a
    derived count rather than a sentence that may be false (MEH-1909).
    """
    view_buckets = _spread(DEMO_INSIGHTS["views_total"], DEMO_INSIGHTS["days"])
    search_buckets = _spread(DEMO_INSIGHTS["views_from_search"], DEMO_INSIGHTS["days"])
    wa_buckets = _spread(DEMO_INSIGHTS["whatsapp_clicks"], DEMO_INSIGHTS["days"])
    cities = DEMO_INSIGHTS["top_cities"]
    today = israel_today()
    rolled_rows = 0

    for offset in range(DEMO_INSIGHTS["days"]):
        day_index = DEMO_INSIGHTS["days"] - 1 - offset  # 0 = oldest
        day = today - timedelta(days=offset)
        # ANCHORED AT MIDDAY ISRAEL, not at `now - N days`. The roll-up's `day`
        # is an Israel calendar day; a UTC stamp N*24h back is the same Israel
        # day only while the offset is unchanged at both ends, and near
        # midnight Israel it lands on the day before or after (the MEH-2290
        # class, and `.claude/rules/testing.md` names it). Midday has ~12 hours
        # of margin on either side, so the raw row and its roll-up row always
        # agree. The sums-only assertion in the test would NOT have caught the
        # drift, which is why this is fixed rather than asserted around.
        stamp = _israel_wall_to_utc(day, 12)
        views = view_buckets[day_index]
        searches = min(search_buckets[day_index], views)

        for n in range(views):
            db.add(
                ProducerPageView(
                    producer_id=producer.id,
                    viewer_ip_hash=secrets.token_hex(32),
                    # The first few views of a day round-robin the cities and
                    # every view after that goes to the first one, so the top
                    # city leads the panel by a wide margin while the others
                    # still appear. (An earlier comment here said "weighted by
                    # position", which described a different scheme than the
                    # code: the fall-through is a hard default, not a weight.)
                    city=cities[n % len(cities)] if n < len(cities) * 3 else cities[0],
                    referrer="search" if n < searches else "home",
                    created_at=stamp,
                )
            )
        for _ in range(wa_buckets[day_index]):
            db.add(
                ProducerWhatsAppClick(
                    producer_id=producer.id,
                    clicked_at=stamp,
                    city=cities[0],
                )
            )
        # MEH-2801: at or below the watermark only — see the docstring. The
        # values are the same numbers the rows above carry, because one hash
        # per view makes the job's DISTINCT (day, hash) count equal the row
        # count; `test_seeded_aggregate_matches_what_the_real_job_computes`
        # pins that against `roll_up_day` so the two cannot drift apart
        # quietly.
        # ...and only for a day the producer was actually ACTIVE on, because
        # that is the rule the real job follows: `_day_select` builds its row
        # set from the UNION of producers with a page view OR a WhatsApp click
        # that day, so a day with neither gets no row at all — not a row of
        # zeros. `_spread` is a rising ramp, so the oldest days of the window
        # genuinely have none (measured: 2 of 30 days have no view, 17 have no
        # click), and writing zeros there made the seed emit rows the job never
        # would. Found by test_seeded_aggregate_matches_what_the_real_job_
        # computes once it looped over every day instead of sampling one.
        active_that_day = views > 0 or wa_buckets[day_index] > 0
        if watermark is not None and day <= watermark and active_that_day:
            db.add(
                ProducerAnalyticsDaily(
                    producer_id=producer.id,
                    day=day,
                    views_unique=views,
                    views_search_unique=searches,
                    whatsapp_clicks=wa_buckets[day_index],
                )
            )
            rolled_rows += 1

    # Contact clicks — a phone/website breakdown beside the WhatsApp metric.
    for i in range(DEMO_INSIGHTS["contact_clicks"]):
        db.add(
            ContactClick(
                producer_id=producer.id,
                method="phone" if i % 2 == 0 else "website",
                # Same midday anchor as the views above: these are read in
                # windows counted in Israel days.
                clicked_at=_israel_wall_to_utc(today - timedelta(days=i * 3), 12),
            )
        )

    _seed_followers(db, producer)
    return rolled_rows


def _seed_followers(db, producer) -> None:
    """MEH-2794 — the follower count, which is `favorites` (MEH-1364 decision A).

    `favorites` has a composite PK (user_id, producer_id), so N followers needs
    N users — the count cannot be faked with repeated rows. These are
    display-only accounts with random unrecorded passwords, exactly like
    DEMO_REVIEWS' three reviewers, and they are torn down with the rest on
    --refresh (see `_delete_existing`'s email set).
    """
    for i in range(DEMO_INSIGHTS["favorites"]):
        email = DEMO_FOLLOWER_EMAIL_TEMPLATE.format(i + 1)
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                email=email,
                name=f"עוקבת {i + 1}",
                password_hash=hash_password(secrets.token_urlsafe(32)),
                role="consumer",
                email_verified=True,
            )
            db.add(user)
            db.flush()
        existing = (
            db.query(Favorite)
            .filter(Favorite.user_id == user.id, Favorite.producer_id == producer.id)
            .first()
        )
        if existing is None:
            db.add(
                Favorite(
                    user_id=user.id,
                    producer_id=producer.id,
                    created_at=utc_now() - timedelta(days=i * 2),
                )
            )


def seed_marketing_fixtures(db) -> int:
    """MEH-2794 — the /join screenshot fixtures, added if missing.

    Same contract as `seed_dietary_scope_demos` / `seed_availability_demos`:
    idempotent, keyed off the demo producer's slug, and called from `main()`
    rather than from `seed_demo_business`. Three reasons, in order of weight:

    1. **"Add if missing", per the ticket.** Each part below checks before it
       inserts, so running the seed twice without --refresh does not give the
       demo business two offers and 60 days of doubled traffic.
    2. It must run on the SKIP-IF-EXISTS path too. That path returns before
       creating anything, so a business seeded last week would never get these
       fixtures if they lived inside `seed_demo_business`.
    3. `seed_demo_business` sits exactly at ruff's PLR0915 ceiling (50
       statements) with no per-file-ignore, so three more calls inside it turn
       `Backend lint (ruff)` red.

    Returns the number of parts it actually seeded, so the caller can print a
    DERIVED count rather than a sentence that may be false (MEH-1909).
    """
    producer = db.query(Producer).filter(Producer.slug == DEMO_SLUG).first()
    if producer is None:
        print(f"Demo producer /{DEMO_SLUG} not found — skipping MEH-2794 fixtures.")
        return 0

    seeded = 0
    skipped: list[str] = []
    if (
        not db.query(ProducerOffer)
        .filter(ProducerOffer.producer_id == producer.id)
        .first()
    ):
        _seed_offer(db, producer)
        seeded += 1
    else:
        skipped.append("offer (one already exists)")
    if _seed_rescue_bag(db, producer):
        seeded += 1
    else:
        skipped.append("rescue bag (already there today, or the tables are absent)")
    # Probe the RAW table as well as the roll-up, and skip if EITHER holds a
    # row. The roll-up alone is not a safe probe on staging, for two reasons
    # that both really happen there:
    #
    #   * the roll-up job runs on staging, so real traffic to the demo page
    #     writes `producer_analytics_daily` rows this seed did not create;
    #   * raw rows are pruned after 90 days while the roll-up is kept forever
    #     (MEH-2079), so an old database legitimately holds roll-up rows with
    #     no raw rows behind them.
    #
    # In both cases a roll-up-only probe reads "already seeded" and the
    # fixtures silently never land — the command in the PR body would appear
    # to succeed and change nothing.
    #
    # Skipping on EITHER is the conservative direction: never stack fabricated
    # traffic on top of numbers that are already there, whatever their origin.
    # The staging flow runs `--refresh` first, which cascades all of these
    # away with the producer, so the intended path still seeds.
    already = (
        db.query(ProducerAnalyticsDaily)
        .filter(ProducerAnalyticsDaily.producer_id == producer.id)
        .first()
        or db.query(ProducerPageView)
        .filter(ProducerPageView.producer_id == producer.id)
        .first()
    )
    if not already:
        # MEH-2801: read ONCE, before any insert, and hand it down. Reading it
        # per-day inside the loop would be read-after-write — the first
        # aggregate row this run inserts would raise the watermark that the
        # next day's decision consults, which is the bug with extra steps.
        watermark = rollup_watermark(db)
        # The nightly job could advance the watermark between this read and the
        # commit below, and that is harmless: every row written stays at or
        # below the value read, so the partition the reader relies on cannot be
        # corrupted either way. The only effect is that a day the job rolled
        # inside that window gets no demo row — a missing fixture, not a wrong
        # number, and the next --refresh supplies it.
        rolled_rows = _seed_insights(db, producer, watermark)
        seeded += 1
        if watermark is None:
            skipped.append(
                f"all {DEMO_INSIGHTS['days']} aggregate rows (the roll-up "
                "table is empty, so it owns no day yet — raw rows only; the "
                "nightly job will roll them)"
            )
        elif rolled_rows < DEMO_INSIGHTS["days"]:
            skipped.append(
                f"{DEMO_INSIGHTS['days'] - rolled_rows} of "
                f"{DEMO_INSIGHTS['days']} aggregate rows (above the roll-up "
                f"watermark {watermark} — raw rows only, by design: the "
                "nightly job rolls them)"
            )
    else:
        skipped.append(
            "insights AND followers (analytics rows already exist for this "
            "business — real traffic, or a previous run)"
        )

    db.commit()
    # Say what was SKIPPED, not only what was seeded. A bare "0 part(s)
    # seeded" on staging is indistinguishable from a broken run, and the
    # operator running this from Railway has no other window into why. The
    # followers are called out explicitly because they ride inside the
    # insights block: skipping that skips them too, and the follower count is
    # the one number whose absence would otherwise look like a product state.
    print(f"MEH-2794 marketing fixtures: {seeded} part(s) seeded for /{DEMO_SLUG}.")
    for note in skipped:
        print(f"  skipped: {note}")
    if skipped and not seeded:
        print(
            "  Nothing was seeded. Run with --refresh first if you want the "
            "demo numbers replaced."
        )
    return seeded


def seed_demo_business(db, refresh: bool = False) -> Producer | None:
    """Create the demo business. Returns the Producer, or None if it already
    exists and refresh is False (skip-if-exists, matching seed_data.py)."""
    if refresh:
        _delete_existing(db)
    elif db.query(Producer).filter(Producer.slug == DEMO_SLUG).first():
        print(f"Demo business '{DEMO_SLUG}' already exists — skipping (use --refresh).")
        return None

    category = db.query(Category).filter(Category.name == DEMO_CATEGORY_NAME).first()
    if not category:
        sys.exit(
            f"Category '{DEMO_CATEGORY_NAME}' not found — run backend/seed_data.py first."
        )

    now = datetime.now(timezone.utc)
    producer = Producer(
        **DEMO_PRODUCER,
        status="approved",
        admin_notes=ADMIN_NOTE,
        # Trust signals of a "perfect" profile: document-verified tier
        # (ADR-022) + verified phone + open for orders.
        verified_at=now,
        verification_doc_type="license",
        phone_verified=True,
        # MEH-1706 §2 item 4 — relative, per the DEMO_EVENT["days_ahead"] idiom
        # (§2.3): a hardcoded expiry silently lapses and the badge stops
        # rendering months later with nothing pointing at the seed as the cause.
        kashrut_verified_at=now,
        kashrut_expires_at=now + timedelta(days=300),
        availability_state="accepting_orders",
        has_physical_location=True,
        offers_delivery=True,
        delivery_cities=[a["city"] for a in DEMO_DELIVERY_AREAS],
        has_delivery=True,
        avg_rating=round(sum(r["stars"] for r in DEMO_REVIEWS) / len(DEMO_REVIEWS), 1),
        reviews_count=len(DEMO_REVIEWS),
    )
    db.add(producer)
    db.flush()

    db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))

    first_product = None
    for p in DEMO_PRODUCTS:
        product = Product(producer_id=producer.id, **p)
        db.add(product)
        first_product = first_product or product

    for area in DEMO_DELIVERY_AREAS:
        db.add(DeliveryArea(producer_id=producer.id, **area))
    db.flush()

    # MEH-1432 (MEH-1388 chunk 6): the 10-location set — activates the E2E
    # multi-location assertions (per-location markers, cluster-counts-1-business,
    # same-city label). Mirrors the DeliveryArea child pattern above.
    for loc in DEMO_LOCATIONS:
        db.add(ProducerLocation(producer_id=producer.id, **loc))
    db.flush()

    recipe = ProducerRecipe(
        producer_id=producer.id,
        **DEMO_RECIPE,
        moderation_status="approved",
        published=True,
    )
    recipe.products.append(first_product)
    db.add(recipe)

    db.add(
        Event(
            producer_id=producer.id,
            title=DEMO_EVENT["title"],
            description=DEMO_EVENT["description"],
            event_date=date.today() + timedelta(days=DEMO_EVENT["days_ahead"]),
            event_time=datetime.strptime(DEMO_EVENT["event_time"], "%H:%M").time(),
            location=DEMO_EVENT["location"],
            city=DEMO_PRODUCER["city"],
            lat=DEMO_PRODUCER["lat"],
            lng=DEMO_PRODUCER["lng"],
            image_url=DEMO_EVENT["image_url"],
            category=DEMO_EVENT["category"],
            price=DEMO_EVENT["price"],
            max_participants=DEMO_EVENT["max_participants"],
            is_active=True,
        )
    )

    # Owner login (producer role) so the profile is manageable on staging.
    # Password from DEMO_OWNER_PASSWORD env var, else random + unrecorded.
    # MEH-1918: kept in a local now — the seeded experiences are keyed on this
    # user's id (an Experience hangs off a User, not a Producer).
    owner = User(
        email=DEMO_OWNER_EMAIL,
        name=DEMO_PRODUCER["contact_name"],
        password_hash=hash_password(
            os.getenv("DEMO_OWNER_PASSWORD") or secrets.token_urlsafe(16)
        ),
        role="producer",
        producer_id=producer.id,
        # Seed accounts get no verification email — login gates on this
        # (auth.py rejects unverified users at token issue).
        email_verified=True,
    )
    db.add(owner)
    # flush, not commit: the id is needed below and the whole seed still
    # commits once at the end.
    db.flush()

    # MEH-1706: the QA consumer, get-or-create. Until now this user was created
    # ONLY by the --sync-users path, so on a fresh database the main seed left
    # it absent — measured, not assumed: the group-buy committer lookup below
    # exited with "not found" on the first --refresh run against a clean DB.
    # Both new surfaces need it (group-buy commits and the consumer-hosted
    # moderation experiences), and it is an existing constant rather than a new
    # email, so the ticket's "no new user emails" rule is unaffected.
    # Deliberately NOT added to _delete_existing's email set: --sync-users owns
    # this user's password lifecycle, and get-or-create is idempotent either way.
    consumer = db.query(User).filter(User.email == DEMO_CONSUMER_EMAIL).first()
    if consumer is None:
        consumer = User(
            email=DEMO_CONSUMER_EMAIL,
            name=DEMO_CONSUMER_NAME,
            password_hash=hash_password(
                os.getenv("DEMO_CONSUMER_PASSWORD") or secrets.token_urlsafe(16)
            ),
            role="consumer",
            email_verified=True,
        )
        db.add(consumer)
        db.flush()

    # MEH-1918: the experiences themselves. status="approved" +
    # moderation_status="APPROVED" + a future event_date + is_active — i.e.
    # every condition GET /experiences (and /experiences/count) filters on, so
    # the seeded staging site clears the nav threshold instead of hovering
    # under it.
    for ex in DEMO_EXPERIENCES:
        db.add(
            Experience(
                host_user_id=owner.id,
                title=ex["title"],
                description=ex["description"],
                image_url=DEMO_EVENT["image_url"],
                category=ex["category"],
                event_date=date.today() + timedelta(days=ex["days_ahead"]),
                event_time=datetime.strptime(ex["event_time"], "%H:%M").time(),
                duration_minutes=ex["duration_minutes"],
                location_type="public",
                city=DEMO_PRODUCER["city"],
                max_participants=ex["max_participants"],
                price_per_person=ex["price_per_person"],
                status="approved",
                moderation_status="APPROVED",
                is_active=True,
            )
        )

    # MEH-1528: QA admin login (role="admin", NO producer_id) so the Playwright
    # admin.json storageState reaches the admin panel — proving the roles are
    # distinct from the producer owner. Password from DEMO_ADMIN_PASSWORD env,
    # else random + unrecorded (mirrors the owner exactly).
    db.add(
        User(
            email=DEMO_ADMIN_EMAIL,
            name=DEMO_ADMIN_NAME,
            password_hash=hash_password(
                os.getenv("DEMO_ADMIN_PASSWORD") or secrets.token_urlsafe(16)
            ),
            role="admin",
            email_verified=True,
        )
    )

    for r in DEMO_REVIEWS:
        reviewer = User(
            email=r["email"],
            name=r["user_name"],
            password_hash=hash_password(secrets.token_urlsafe(16)),
            role="consumer",
            email_verified=True,
        )
        db.add(reviewer)
        db.flush()
        db.add(
            ProducerReview(
                producer_id=producer.id,
                user_id=reviewer.id,
                stars=r["stars"],
                body=r["body"],
                reply=r.get("reply"),
                reply_at=utc_now() if r.get("reply") else None,
            )
        )

    _seed_kashrut_request(db, producer)
    _seed_group_buy(db, producer)
    _seed_moderation_experiences(db)

    # MEH-1432: the delivery-only-with-pickup demo producer. No own lat/lng — it
    # reappears on /map SOLELY because it owns a pickup location (chunk-2 MEH-213
    # reversal). A zero-location delivery-only producer stays hidden (unchanged).
    delivery_only = Producer(
        **DELIVERY_ONLY_PRODUCER,
        status="approved",
        admin_notes=ADMIN_NOTE,
        has_physical_location=False,
        offers_delivery=True,
        delivery_nationwide=True,
        # MEH-1706 §2 item 8 — MEH-1255's exclusion mode ("משלוחים לכל הארץ חוץ
        # מ:"). The DB CHECK `delivery_excluded_requires_nationwide` only permits
        # a non-empty list when delivery_nationwide is true, which it is above —
        # so this producer is the only correct home for the surface.
        delivery_excluded_cities=["אילת", "קצרין"],
        has_delivery=True,
        lat=None,
        lng=None,
    )
    db.add(delivery_only)
    db.flush()
    db.add(ProducerCategory(producer_id=delivery_only.id, category_id=category.id))
    db.add(ProducerLocation(producer_id=delivery_only.id, **DELIVERY_ONLY_LOCATION))

    db.commit()
    print(f"Demo business seeded: /{DEMO_SLUG} (producer {producer.id})")
    print(
        f"Delivery-only demo seeded: /{DELIVERY_ONLY_SLUG} "
        f"(producer {delivery_only.id}, 1 pickup, no own lat/lng)"
    )
    return producer


def _golden_new_business(db, spec: dict, category):
    """Create one golden business with its primary location. Not committed."""
    # Imported here, not at the top: the rest of this script never needs it,
    # and the import pulls the producer query layer into every other mode.
    from app.services.producer_queries import create_primary_branch_location

    now = utc_now()
    is_kashrut = spec["extras"] == "locations_kashrut"
    producer = Producer(
        name=spec["name"],
        contact_name=spec["owner_name"],
        slug=spec["slug"],
        kind=spec["kind"],
        description=GOLDEN_DESCRIPTION,
        short_description=GOLDEN_DESCRIPTION,
        city=spec["city"],
        lat=spec["lat"],
        lng=spec["lng"],
        phone=spec["phone"],
        primary_contact_method="whatsapp",
        status="approved",
        admin_notes=GOLDEN_ADMIN_NOTE,
        images=[DIETARY_DEMO_IMAGE],
        has_physical_location=True,
        offers_delivery=False,
        availability_state="accepting_orders",
        kashrut_badges=["badatz"] if is_kashrut else [],
        kashrut_verified_at=now if is_kashrut else None,
        kashrut_expires_at=now + timedelta(days=300) if is_kashrut else None,
    )
    db.add(producer)
    db.flush()
    # An organizer sells nothing and is hidden from every business surface,
    # so it gets no business category (seed_organizer_demo.py, the same).
    if spec["kind"] == "producer":
        db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
    create_primary_branch_location(db, producer)
    db.flush()
    return producer


def _golden_business(db, spec: dict, category, password: str) -> bool:
    """Ensure one business persona exists. Returns True when anything was created.

    Idempotent per slug AND per email: a second run creates nothing, it only
    resets the login's password from the env (the `--sync-users` contract).
    Content (`extras`) is added only together with a NEW business row.
    """
    producer = db.query(Producer).filter(Producer.slug == spec["slug"]).first()
    new_business = producer is None
    if new_business:
        producer = _golden_new_business(db, spec, category)
    owner, new_user = _golden_user(
        db,
        email=spec["email"],
        name=spec["owner_name"],
        role="producer",
        password=password,
    )
    owner.producer_id = producer.id
    db.flush()
    if new_business:
        _golden_extras(db, producer, owner, spec["extras"])
    return new_business or new_user


def seed_golden_personas(db) -> dict[str, list[str]]:
    """MEH-2897: ensure the seven golden-path logins exist. Returns
    ``{"created": [emails], "existing": [emails]}``.

    Refuses (sys.exit) before any write when a password env var is missing or
    the bakery category is absent. Commits once, at the end.
    """
    passwords = _golden_passwords()
    category = db.query(Category).filter(Category.name == DEMO_CATEGORY_NAME).first()
    if not category:
        sys.exit(
            f"Category '{DEMO_CATEGORY_NAME}' not found — run backend/seed_data.py first."
        )

    result: dict[str, list[str]] = {"created": [], "existing": []}
    for spec in GOLDEN_BUSINESSES:
        created = _golden_business(
            db, spec, category, passwords[GOLDEN_OWNER_PASSWORD_ENV]
        )
        result["created" if created else "existing"].append(spec["email"])
    for spec, role, env in (
        (GOLDEN_CUSTOMER, "consumer", GOLDEN_CONSUMER_PASSWORD_ENV),
        (GOLDEN_ADMIN, "admin", GOLDEN_ADMIN_PASSWORD_ENV),
    ):
        _, created = _golden_user(
            db,
            email=spec["email"],
            name=spec["name"],
            role=role,
            password=passwords[env],
        )
        result["created" if created else "existing"].append(spec["email"])
    db.flush()
    redated = _golden_refresh_dates(db)
    db.commit()
    # Emails only — never a password.
    print(
        f"Golden personas: created {len(result['created'])}, "
        f"re-dated {redated} events/experiences, "
        f"password reset on {len(result['existing'])} existing "
        f"({', '.join(golden_persona_emails())})."
    )
    return result


def demo_business_slugs() -> list[str]:
    """Every business slug a plain run (or --refresh) seeds. The golden
    personas are not here: --golden is its own mode and never combines with
    --mark-test."""
    return [
        DEMO_SLUG,
        DELIVERY_ONLY_SLUG,
        *(spec["slug"] for spec in DIETARY_SCOPE_DEMOS),
        *(spec["slug"] for spec in AVAILABILITY_DEMOS),
    ]


def mark_demo_businesses_as_test(db, *, hidden: bool) -> int:
    """MEH-2952 chunk 4: the seed's side of the «עסק בדיקה» switch.

    OPT-IN ONLY (`--mark-test`, off by default). The staging demo businesses
    must stay visible: the /join clips (MEH-2794) and the E2E run read them
    from public pages, and a hidden row 404s for a visitor. So a plain run,
    and --refresh, never call this. Returns the number of rows changed.
    """
    changed = 0
    for producer in (
        db.query(Producer).filter(Producer.slug.in_(demo_business_slugs())).all()
    ):
        if bool(producer.is_test) != hidden:
            producer.is_test = hidden
            changed += 1
    db.commit()
    print(f"MEH-2952: {changed} demo business(es) set is_test={hidden}.")
    return changed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help=(
            "delete the existing demo business (+ seed users) and recreate. "
            "REQUIRED, not optional, when you want the MEH-2794 marketing "
            "numbers (insights, followers) regenerated: without it the "
            "fixtures skip as soon as ANY analytics or page-view row exists "
            "for the demo business, and one real page view on staging is "
            "enough to trigger that"
        ),
    )
    parser.add_argument(
        "--sync-users",
        action="store_true",
        help=(
            "MEH-1241: non-destructive — set demo-owner + demo-consumer "
            "passwords from DEMO_OWNER_PASSWORD / DEMO_CONSUMER_PASSWORD, "
            "leaving the producer, reviews, products and the 3 display "
            "reviewers untouched. Mutually exclusive with --refresh."
        ),
    )
    parser.add_argument(
        "--golden",
        action="store_true",
        help=(
            "MEH-2897: ensure ONLY the seven golden-path personas "
            "(golden-*@example.com) exist, with passwords from "
            "DEMO_OWNER_PASSWORD / DEMO_CONSUMER_PASSWORD / DEMO_ADMIN_PASSWORD. "
            "Idempotent. Does not touch the demo business. Mutually exclusive "
            "with --refresh and --sync-users."
        ),
    )
    parser.add_argument(
        "--mark-test",
        action="store_true",
        help=(
            "MEH-2952: after seeding, mark the demo businesses as test rows "
            "(«עסק בדיקה — מוסתר מהאתר»), hidden from every public page and "
            "every send. OFF by default, local databases only (refused when "
            "RAILWAY_ENVIRONMENT=staging): the /join clips (MEH-2794) and the "
            "E2E run need the staging demos visible. Not with --sync-users or "
            "--golden."
        ),
    )
    args = parser.parse_args()
    if sum((args.sync_users, args.refresh, args.golden)) > 1:
        sys.exit("--sync-users, --refresh and --golden are mutually exclusive.")
    if args.mark_test and (args.sync_users or args.golden):
        sys.exit(
            "--mark-test seeds the demo businesses; not with --sync-users or --golden."
        )
    # MEH-2952 (rule-5a review): the staging demos must stay public (the /join
    # clips, MEH-2794, and the E2E run), and no CLI path unmarks them. Local
    # databases only; on staging the admin switch is the one way to hide a row.
    if args.mark_test and os.environ.get("RAILWAY_ENVIRONMENT") == "staging":
        sys.exit(
            "--mark-test is for a local database only — the staging demos must stay visible."
        )
    _assert_not_production()
    db = SessionLocal()
    try:
        if args.golden:
            seed_golden_personas(db)
        elif args.sync_users:
            _sync_users(db)
        else:
            seed_demo_business(db, refresh=args.refresh)
            # MEH-1528: always run — idempotent per-slug, so it seeds the
            # dietary demos even when the main business already existed (the
            # skip-if-exists path above returns before creating anything).
            seed_dietary_scope_demos(db)
            # MEH-1706: same contract as the dietary demos — idempotent
            # per-slug, so it runs even when the main business already existed.
            seed_availability_demos(db)
            # MEH-2794: same contract again — the /join screenshot fixtures
            # (offer, rescue bag, insight numbers), added only if missing.
            seed_marketing_fixtures(db)
            # MEH-2981: same contract — a live demo group buy, added only if
            # none is open, so a plain run (no --refresh) restores the tab.
            seed_open_group_buy(db)
            # MEH-2952 chunk 4: opt-in only — see mark_demo_businesses_as_test.
            if args.mark_test:
                mark_demo_businesses_as_test(db, hidden=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()
