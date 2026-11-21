"""Part 2 of 2 of `seed_demo_business.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `seed_demo_business.py` re-exports every name, so callers and
tests keep using that module.
"""

import os
import sys
from datetime import date, datetime, time, timedelta, timezone

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.auth import hash_password  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.models import Category, Producer, ProducerCategory, ProducerLocation, Product  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.models.models import Event, Experience, ProducerOffer, User  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.utils.clock import ISRAEL_TZ, israel_today  # noqa: E402  # imports must follow sys.path.insert (script shim)

from scripts._seed_demo_business_p01 import ADMIN_NOTE  # noqa: E402
from scripts._seed_demo_business_p01 import AVAILABILITY_DEMOS  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_ADMIN_EMAIL  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_ADMIN_NAME  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_CATEGORY_NAME  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_CONSUMER_EMAIL  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_CONSUMER_NAME  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_EVENT  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_MODERATION_EXPERIENCES  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_OFFER  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_OWNER_EMAIL  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_PRODUCER  # noqa: E402
from scripts._seed_demo_business_p01 import DEMO_RESCUE_BAG  # noqa: E402
from scripts._seed_demo_business_p01 import DIETARY_DEMO_CITY  # noqa: E402
from scripts._seed_demo_business_p01 import DIETARY_DEMO_IMAGE  # noqa: E402
from scripts._seed_demo_business_p01 import DIETARY_SCOPE_DEMOS  # noqa: E402
from scripts._seed_demo_business_p01 import _seed_kashrut_request  # noqa: E402
from scripts._seed_demo_business_p01 import _to_naive_utc  # noqa: E402


def _demo_pickup_window(now_utc: datetime) -> tuple[date, datetime, datetime]:
    """`(israel day, pickup_start, pickup_end)` for the demo bag, from `now`.

    Pure arithmetic on an injected `now`, so the tests can pin both sides of
    the cutoff with a frozen clock instead of passing only at the hour the
    suite happens to run (`.claude/rules/testing.md`).

    The cutoff is compared as a DATETIME, not as a time-of-day: `now + 3h` at
    23:00 Israel is 02:00 the next day, whose *time* is before 20:00 while the
    moment plainly is not, and a time-only comparison would open a window in
    the small hours and call it this evening.

    The lead times are added to the UTC INSTANT and only then read in Israel
    (MEH-2814) — see the comment in the body for why the wall-clock form was
    an hour out on the two switch nights.

    Known shape, flagged rather than changed: the rule is literal `now + 1h`
    and `now + 3h`, so a seed at 10:17 produces 11:17-13:17 rather than a
    rounded hour, and a seed at 00:30 produces 01:30-03:30 — odd for a bakery
    but visible, which is what the window is for. Rounding or an early-morning
    floor would be a change to Sapir's rule, not an implementation detail.
    """
    # MEH-2814 — THE LEAD TIMES ARE ADDED TO THE UTC INSTANT, not to the
    # Israel wall clock. Adding a timedelta to a zoneinfo-aware datetime is
    # wall-clock arithmetic: on the night the clocks go back,
    # `01:30 Israel + 3h` reads 04:30 Israel but FOUR real hours have passed
    # (measured; the March switch is the mirror case). The window would then
    # promise three hours and store four. The cutoff below stays a wall-clock
    # comparison on purpose — "before 20:00 Israel" is a wall-clock idea — and
    # comparing two aware datetimes compares instants, so it is still correct
    # across the switch.
    now_aware = now_utc.replace(tzinfo=timezone.utc)
    now_il = now_aware.astimezone(ISRAEL_TZ)
    cutoff_il = datetime.combine(
        now_il.date(),
        time(hour=DEMO_RESCUE_BAG["evening_cutoff_hour"]),
        tzinfo=ISRAEL_TZ,
    )
    end_il = (
        now_aware + timedelta(hours=DEMO_RESCUE_BAG["lead_hours_end"])
    ).astimezone(ISRAEL_TZ)
    if end_il < cutoff_il:
        start_il = (
            now_aware + timedelta(hours=DEMO_RESCUE_BAG["lead_hours_start"])
        ).astimezone(ISRAEL_TZ)
    else:
        tomorrow = now_il.date() + timedelta(days=1)
        start_il = datetime.combine(
            tomorrow,
            time(hour=DEMO_RESCUE_BAG["tomorrow_from_hour"]),
            tzinfo=ISRAEL_TZ,
        )
        end_il = datetime.combine(
            tomorrow,
            time(hour=DEMO_RESCUE_BAG["tomorrow_to_hour"]),
            tzinfo=ISRAEL_TZ,
        )
    # The offer's `date` is the Israel day the collection happens on, which is
    # the start's day — not `israel_today()`, which would mislabel a window
    # that landed on tomorrow.
    return start_il.date(), _to_naive_utc(start_il), _to_naive_utc(end_il)


def _seed_offer(db, producer) -> None:
    """MEH-2794 — the active offer, for the offer badge on the business page.

    `starts_at` is left NULL on purpose: models.py:1281 defines NULL as "active
    now", and a seeded date would make the offer scheduled-but-not-live, which
    photographs as nothing at all.
    """
    db.add(
        ProducerOffer(
            producer_id=producer.id,
            offer_type=DEMO_OFFER["offer_type"],
            threshold_value=DEMO_OFFER["threshold_value"],
            threshold_unit=DEMO_OFFER["threshold_unit"],
            headline=DEMO_OFFER["headline"],
            starts_at=None,
            expires_at=israel_today() + timedelta(days=DEMO_OFFER["days_ahead"]),
            is_active=True,
        )
    )


def _spread(total: int, days: int) -> list[int]:
    """`total` split across `days` buckets, newest last, summing EXACTLY to total.

    Derived rather than written out: a hand-made list drifts from the constant
    the moment either changes, and the roll-up below is built from these same
    buckets, so a mismatch would put the dashboard's "total" at odds with its
    own 30-day chart.

    Shaped (a gentle rise toward today) rather than flat, so the insights line
    chart has something to show. The remainder lands on the most recent days.
    """
    weights = [i + 1 for i in range(days)]
    scale = sum(weights)
    counts = [total * w // scale for w in weights]
    for i in range(total - sum(counts)):
        counts[-1 - (i % days)] += 1
    return counts


def _seed_moderation_experiences(db) -> None:
    """MEH-1706 §2 item 2 — the non-approved experiences (the moderation queue).

    The three DEMO_EXPERIENCES are all `approved` on purpose (MEH-1918), so
    these are ADDITIVE rather than a re-status of those: turning two of the
    three into pending/changes_requested would drop `GET /experiences` back
    under the nav threshold MEH-1918 exists to clear.
    """
    consumer = db.query(User).filter(User.email == DEMO_CONSUMER_EMAIL).first()
    if consumer is None:
        sys.exit(
            f"Demo consumer '{DEMO_CONSUMER_EMAIL}' not found — seed order changed?"
        )
    for ex in DEMO_MODERATION_EXPERIENCES:
        db.add(
            Experience(
                host_user_id=consumer.id,
                title=ex["title"],
                description=ex["description"],
                image_url=DEMO_EVENT["image_url"],
                category="בישול",
                event_date=date.today() + timedelta(days=ex["days_ahead"]),
                event_time=datetime.strptime("17:00", "%H:%M").time(),
                duration_minutes=90,
                location_type="public",
                city=DEMO_PRODUCER["city"],
                max_participants=10,
                price_per_person=120,
                status=ex["status"],
                moderation_status=ex["moderation_status"],
                is_active=True,
            )
        )


def seed_availability_demos(db) -> int:
    """MEH-1706 §2 item 9 — the `on_vacation` producer (`full_this_week` was
    removed in MEH-2782).

    Per-slug skip-if-exists, mirroring seed_dietary_scope_demos, so a re-run
    without --refresh inserts nothing. --refresh clears them via
    _delete_existing before this recreates them. Returns rows inserted.
    """
    category = db.query(Category).filter(Category.name == DEMO_CATEGORY_NAME).first()
    if not category:
        sys.exit(
            f"Category '{DEMO_CATEGORY_NAME}' not found — run backend/seed_data.py first."
        )

    inserted = 0
    for spec in AVAILABILITY_DEMOS:
        if db.query(Producer).filter(Producer.slug == spec["slug"]).first():
            print(f"Availability demo '{spec['slug']}' already exists — skipping.")
            continue
        days = spec["vacation_days_ahead"]
        producer = Producer(
            name=spec["name"],
            contact_name=spec["contact_name"],
            slug=spec["slug"],
            short_description=spec["short_description"],
            description=spec["short_description"],
            city=DIETARY_DEMO_CITY,
            primary_contact_method="whatsapp",
            status="approved",
            admin_notes=ADMIN_NOTE,
            images=[DIETARY_DEMO_IMAGE],
            has_physical_location=True,
            availability_state=spec["availability_state"],
            vacation_until=(date.today() + timedelta(days=days)) if days else None,
        )
        db.add(producer)
        db.flush()
        db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
        db.commit()
        inserted += 1
        print(
            f"Availability demo seeded: /{spec['slug']} "
            f"(state={spec['availability_state']}, vacation_until={producer.vacation_until})"
        )
    if inserted == 0:
        print("Availability demos: all present — nothing to insert.")
    return inserted


def seed_dietary_scope_demos(db) -> int:
    """MEH-1528 (Component B): idempotently upsert the dietary-scope demo
    producers (gluten_free_facility unknown/shared/dedicated + vegan_scope /
    vegetarian_scope all/some).

    Per-slug skip-if-exists so re-running never duplicates (B3) and so this
    runs even when the main demo already exists (seed_demo_business returns
    early on skip-if-exists). --refresh clears them via _delete_existing before
    this recreates them. Returns the number of producers inserted this run.
    """
    category = db.query(Category).filter(Category.name == DEMO_CATEGORY_NAME).first()
    if not category:
        sys.exit(
            f"Category '{DEMO_CATEGORY_NAME}' not found — run backend/seed_data.py first."
        )

    inserted = 0
    for spec in DIETARY_SCOPE_DEMOS:
        if db.query(Producer).filter(Producer.slug == spec["slug"]).first():
            print(f"Dietary demo '{spec['slug']}' already exists — skipping.")
            continue
        producer = Producer(
            name=spec["name"],
            contact_name=spec["contact_name"],
            slug=spec["slug"],
            short_description=spec["short_description"],
            description=spec["short_description"],
            city=DIETARY_DEMO_CITY,
            primary_contact_method="whatsapp",
            status="approved",
            admin_notes=ADMIN_NOTE,
            images=[DIETARY_DEMO_IMAGE],
            has_physical_location=True,
            availability_state="accepting_orders",
            # MEH-1528: the scope columns under test (schema chunk 1).
            gluten_free_facility=spec["gluten_free_facility"],
            vegan_scope=spec["vegan_scope"],
            vegetarian_scope=spec["vegetarian_scope"],
        )
        db.add(producer)
        db.flush()
        db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))
        db.commit()
        inserted += 1
        print(
            f"Dietary demo seeded: /{spec['slug']} "
            f"(gluten={spec['gluten_free_facility']}, "
            f"vegan={spec['vegan_scope']}, vegetarian={spec['vegetarian_scope']})"
        )
    if inserted == 0:
        print("Dietary-scope demos: all present — nothing to insert.")
    return inserted


def _sync_users(db) -> None:
    """MEH-1241: non-destructive, users-only sync for staging QA fixtures.

    Repairs exactly the two ``users`` rows Playwright needs a KNOWN password
    for, WITHOUT touching the producer, its reviews/products/recipes/events, or
    the 3 display-only demo reviewers. Deliberately does NOT go through
    ``_delete_existing`` — no cascade, no new producer UUID (see the --refresh
    path, which is left untouched).

    - ``demo-owner@example.com`` (role=producer, already linked to the demo
      producer): reset ``password_hash`` from ``DEMO_OWNER_PASSWORD`` + ensure
      ``email_verified``. UPDATE-only — its ``producer_id`` linkage is created
      solely by the full seed, so a MISSING owner means the demo business isn't
      seeded yet → abort rather than create a producer-less "producer".
    - ``demo-consumer@example.com``: upsert as a verified consumer with a
      password from ``DEMO_CONSUMER_PASSWORD`` (no producer linkage).
    - ``demo-admin@example.com`` (MEH-1528): upsert as a verified admin
      (role="admin", no producer linkage) with a password from
      ``DEMO_ADMIN_PASSWORD`` — the only new env var this ticket adds.

    All three env passwords are mandatory: abort if any is unset — never write a
    random password again (that random-at-seed gap was the MEH-1241 root cause).
    Passwords are never printed. Idempotent: re-running yields the same rows.
    """
    owner_pw = os.getenv("DEMO_OWNER_PASSWORD")
    consumer_pw = os.getenv("DEMO_CONSUMER_PASSWORD")
    admin_pw = os.getenv("DEMO_ADMIN_PASSWORD")  # MEH-1528
    missing = [
        name
        for name, val in (
            ("DEMO_OWNER_PASSWORD", owner_pw),
            ("DEMO_CONSUMER_PASSWORD", consumer_pw),
            ("DEMO_ADMIN_PASSWORD", admin_pw),
        )
        if not val
    ]
    if missing:
        sys.exit(
            "REFUSING to sync QA users: missing env var(s) "
            f"{', '.join(missing)}. Set them (Railway staging backend / local) "
            "before --sync-users — a random password would be unusable for QA."
        )

    # Producer owner — UPDATE only (never create here: the producer_id linkage
    # comes from the full seed, and a producer-less role='producer' would render
    # a broken /producer/undefined menu row, MEH-1226).
    owner = db.query(User).filter(User.email == DEMO_OWNER_EMAIL).first()
    if owner is None:
        sys.exit(
            f"REFUSING to sync QA users: {DEMO_OWNER_EMAIL} not found. Run the "
            "full seed first (python backend/scripts/seed_demo_business.py, "
            "skip-if-exists) to create the producer + owner, then re-run "
            "--sync-users."
        )
    owner.password_hash = hash_password(owner_pw)
    owner.email_verified = True

    # Consumer — UPSERT (create if missing; consumers have no producer_id).
    consumer = db.query(User).filter(User.email == DEMO_CONSUMER_EMAIL).first()
    created = consumer is None
    if consumer is None:
        consumer = User(
            email=DEMO_CONSUMER_EMAIL,
            name=DEMO_CONSUMER_NAME,
            role="consumer",
            email_verified=True,
        )
        db.add(consumer)
    consumer.password_hash = hash_password(consumer_pw)
    consumer.email_verified = True

    # MEH-1528: Admin — UPSERT (create if missing; admins have no producer_id,
    # so — like the consumer — a create here is safe on a DB seeded before this
    # ticket landed). role="admin".
    admin = db.query(User).filter(User.email == DEMO_ADMIN_EMAIL).first()
    admin_created = admin is None
    if admin is None:
        admin = User(
            email=DEMO_ADMIN_EMAIL,
            name=DEMO_ADMIN_NAME,
            role="admin",
            email_verified=True,
        )
        db.add(admin)
    admin.password_hash = hash_password(admin_pw)
    admin.email_verified = True

    db.commit()
    print(
        f"Synced QA users: {DEMO_OWNER_EMAIL} (password reset), "
        f"{DEMO_CONSUMER_EMAIL} ({'created' if created else 'password reset'}), "
        f"{DEMO_ADMIN_EMAIL} ({'created' if admin_created else 'password reset'}). "
        "Producer / reviews / products / display reviewers untouched."
    )


# ============================================================================
# MEH-2897 — GOLDEN-PATH PERSONAS (anchor plan §C.1, docs/release/anchor-plan.md).
#
# Seven logins the Playwright project `golden` walks on staging, one per actor
# shape, each with its OWN account so persona state never mixes with the
# `demo-*` E2E fixtures above. Seeded ONLY by `--golden`: the default run (and
# therefore the CI seed step, `seed_demo_business --refresh`) never creates
# them, so no existing spec or seed-coverage count moves.
#
# NO NEW SECRET. The passwords are the three existing QA secrets:
#   businesses and the organizer -> DEMO_OWNER_PASSWORD
#   the customer                 -> DEMO_CONSUMER_PASSWORD
#   the admin                    -> DEMO_ADMIN_PASSWORD
# All three are REQUIRED; a random password would leave the golden run unable
# to log in, which is the MEH-1241 gap `_sync_users` already refuses.
#
# The emails and the password env names are mirrored in
# frontend/e2e/golden/personas.ts. tests/test_golden_personas_seed.py fails
# when the two lists differ, so there is one table with a guard, not two.
#
# C2 (customer signing in with Google) is NOT here: automation cannot sign in
# with Google, so it stays a manual line (anchor plan §C.4).
#
# Deviation from the card, on purpose (MEH-2897): G3 is an organizer, and an
# organizer CANNOT open a group buy — `POST /group-buys` answers 403 for
# kind != 'producer' (routers/group_buys.py, MEH-2459 / ADR-036). Seeding a
# group buy under an organizer row would put the organizer on /group-buys as a
# seller, the exact state that 403 prevents. So G3 carries markets (events) and
# the golden run asserts the 403; the group-buy lifecycle is walked by G1, the
# business that sells products.
#
# STAGING ONLY. `main()` calls `_assert_not_production()` before any mode, and
# every business carries GOLDEN_ADMIN_NOTE (contains "DEMO", so
# check_no_demo_data.py flags it if it ever reaches production); every email
# is @example.com, which that script flags too.
# ============================================================================
GOLDEN_ADMIN_NOTE = (
    "DEMO GOLDEN PATH — MEH-2897 persona for the Playwright `golden` project. "
    "STAGING ONLY: never promote this row to production."
)
GOLDEN_OWNER_PASSWORD_ENV = "DEMO_OWNER_PASSWORD"
GOLDEN_CONSUMER_PASSWORD_ENV = "DEMO_CONSUMER_PASSWORD"
GOLDEN_ADMIN_PASSWORD_ENV = "DEMO_ADMIN_PASSWORD"

# One row per business persona. `extras` names the content seeded on CREATE
# only (never on a re-run, which is what keeps the seed idempotent).
GOLDEN_BUSINESSES = [
    {
        "key": "g1",
        "email": "golden-products@example.com",
        "owner_name": "בעלת עסק גולדן — מוצרים",
        "slug": "golden-products",
        "name": "דמו גולדן — מוצרים בלבד",
        "kind": "producer",
        "city": "חיפה",
        "lat": 32.7940,
        "lng": 34.9896,
        "phone": "050-0000101",
        "extras": "products",
    },
    {
        "key": "g2",
        "email": "golden-events@example.com",
        "owner_name": "בעלת עסק גולדן — אירועים",
        "slug": "golden-events",
        "name": "דמו גולדן — אירועים וחוויות",
        "kind": "producer",
        "city": "בנימינה-גבעת עדה",
        "lat": 32.5170,
        "lng": 34.9480,
        "phone": "050-0000102",
        "extras": "events",
    },
    {
        "key": "g3",
        "email": "golden-organizer@example.com",
        "owner_name": "מארגנת גולדן",
        "slug": "golden-organizer",
        "name": "דמו גולדן — מארגנת שווקים",
        "kind": "organizer",
        "city": "תל אביב-יפו",
        # An organizer has no place to walk into (MEH-2669): no coordinates,
        # so `create_primary_branch_location` adds no row, as for real ones.
        "lat": None,
        "lng": None,
        "phone": "050-0000103",
        "extras": "markets",
    },
    {
        "key": "g4",
        "email": "golden-rescue@example.com",
        "owner_name": "בעלת עסק גולדן — סלי הצלה",
        "slug": "golden-rescue",
        "name": "דמו גולדן — סלי הצלה",
        "kind": "producer",
        # The town of the flagship demo's rescue bag (MEH-2794), i.e. the town
        # staging's RESCUE_BAGS_CITIES already has to name for /rescue to show
        # that bag. The golden spec reports, rather than assumes, if it does not.
        "city": "זכרון יעקב",
        "lat": 32.5745,
        "lng": 34.9530,
        "phone": "050-0000104",
        # The bag itself is published BY THE RUN (POST /rescue/offers) and
        # cancelled by it: a seeded bag expires with its pickup window.
        "extras": None,
    },
    {
        "key": "g5",
        "email": "golden-locations@example.com",
        "owner_name": "בעלת עסק גולדן — מיקומים",
        "slug": "golden-locations",
        "name": "דמו גולדן — כמה מיקומים וכשרות",
        "kind": "producer",
        "city": "חדרה",
        "lat": 32.4340,
        "lng": 34.9196,
        "phone": "050-0000105",
        "extras": "locations_kashrut",
    },
]
GOLDEN_CUSTOMER = {
    "key": "c1",
    "email": "golden-customer@example.com",
    "name": "לקוחת גולדן (בדיקות)",
}
GOLDEN_ADMIN = {
    "key": "a1",
    "email": "golden-admin@example.com",
    "name": "מנהלת גולדן (בדיקות)",
}

GOLDEN_PRODUCTS = [
    {"name": "ריבת תות גולדן", "price_min": 32, "price_max": 38},
    {"name": "דבש פרחי בר גולדן", "price_min": 45},
]
GOLDEN_EVENT = {
    "title": "דמו גולדן — ערב טעימות",
    "days_ahead": 15,
    "event_time": "18:00",
    "category": "אחר",
}
GOLDEN_EXPERIENCE = {
    "title": "דמו גולדן — סדנת בוקר",
    "description": "סדנת דמו לבדיקות האוטומטיות של מהמקור. לא סדנה אמיתית.",
    "days_ahead": 20,
    "event_time": "10:00",
    "duration_minutes": 90,
    "category": "בישול",
    "max_participants": 8,
    "price_per_person": 100,
}
GOLDEN_MARKETS = [
    {"title": "דמו גולדן — שוק יצרנים בנמל", "days_ahead": 6, "city": "תל אביב-יפו"},
    {"title": "דמו גולדן — שוק יצרנים בחיפה", "days_ahead": 13, "city": "חיפה"},
]
# G5: two pickup points beside the primary branch, so "several locations" is
# three rows and the map has more than one pin for one business.
GOLDEN_PICKUPS = [
    {"label": "דמו גולדן — איסוף צפון", "lat": 32.4421, "lng": 34.9230},
    {"label": "דמו גולדן — איסוף דרום", "lat": 32.4262, "lng": 34.9151},
]
GOLDEN_DESCRIPTION = "בית עסק לדוגמה לבדיקות האוטומטיות של מהמקור (staging בלבד)."


def golden_persona_emails() -> list[str]:
    """Every golden login, businesses first, in the order the run walks them."""
    return [b["email"] for b in GOLDEN_BUSINESSES] + [
        GOLDEN_CUSTOMER["email"],
        GOLDEN_ADMIN["email"],
    ]


def _golden_passwords() -> dict[str, str]:
    """The three existing QA secrets, all required. Exits BEFORE any write."""
    names = (
        GOLDEN_OWNER_PASSWORD_ENV,
        GOLDEN_CONSUMER_PASSWORD_ENV,
        GOLDEN_ADMIN_PASSWORD_ENV,
    )
    values = {name: os.getenv(name) or "" for name in names}
    missing = [name for name, value in values.items() if not value]
    if missing:
        sys.exit(
            "REFUSING to seed golden personas: missing env var(s) "
            f"{', '.join(missing)}. A random password would leave the golden "
            "run unable to log in."
        )
    return values


def _golden_user(db, *, email: str, name: str, role: str, password: str):
    """Get-or-create one login and (re)set its password. Returns (user, created)."""
    user = db.query(User).filter(User.email == email).first()
    created = user is None
    if created:
        user = User(email=email, name=name, role=role)
        db.add(user)
    user.role = role
    user.password_hash = hash_password(password)
    # Login gates on this (auth.py rejects unverified users at token issue).
    user.email_verified = True
    return user, created


def _golden_products(db, producer) -> None:
    for spec in GOLDEN_PRODUCTS:
        db.add(Product(producer_id=producer.id, **spec))


def _golden_events(db, producer, owner) -> None:
    db.add(
        Event(
            producer_id=producer.id,
            title=GOLDEN_EVENT["title"],
            description=GOLDEN_DESCRIPTION,
            event_date=israel_today() + timedelta(days=GOLDEN_EVENT["days_ahead"]),
            event_time=datetime.strptime(GOLDEN_EVENT["event_time"], "%H:%M").time(),
            city=producer.city,
            lat=producer.lat,
            lng=producer.lng,
            category=GOLDEN_EVENT["category"],
            price=0,
            is_active=True,
        )
    )
    # Approved + APPROVED + future + active: every condition GET /experiences
    # filters on (MEH-1918), so the host dashboard and the public page both
    # have the row. An Experience hangs off a User, not a Producer.
    ex = GOLDEN_EXPERIENCE
    db.add(
        Experience(
            host_user_id=owner.id,
            title=ex["title"],
            description=ex["description"],
            image_url=DIETARY_DEMO_IMAGE,
            category=ex["category"],
            event_date=israel_today() + timedelta(days=ex["days_ahead"]),
            event_time=datetime.strptime(ex["event_time"], "%H:%M").time(),
            duration_minutes=ex["duration_minutes"],
            location_type="public",
            city=producer.city,
            max_participants=ex["max_participants"],
            price_per_person=ex["price_per_person"],
            status="approved",
            moderation_status="APPROVED",
            is_active=True,
        )
    )


def _golden_markets(db, producer) -> None:
    for market in GOLDEN_MARKETS:
        db.add(
            Event(
                producer_id=producer.id,
                title=market["title"],
                description=GOLDEN_DESCRIPTION,
                event_date=israel_today() + timedelta(days=market["days_ahead"]),
                city=market["city"],
                category="שוק",
                is_active=True,
            )
        )


def _golden_locations_kashrut(db, producer) -> None:
    for pickup in GOLDEN_PICKUPS:
        db.add(
            ProducerLocation(
                producer_id=producer.id,
                kind="pickup",
                label=pickup["label"],
                city=producer.city,
                lat=pickup["lat"],
                lng=pickup["lng"],
                is_primary=False,
                location_precision="exact",
            )
        )
    _seed_kashrut_request(db, producer)


def _golden_extras(db, producer, owner, extras: str | None) -> None:
    if extras == "products":
        _golden_products(db, producer)
    elif extras == "events":
        _golden_events(db, producer, owner)
    elif extras == "markets":
        _golden_markets(db, producer)
    elif extras == "locations_kashrut":
        _golden_locations_kashrut(db, producer)


def _golden_dated_rows() -> list[tuple[str, str, str, int]]:
    """(kind, owner slug, title, days_ahead) for every dated golden row."""
    rows = [
        ("event", "golden-events", GOLDEN_EVENT["title"], GOLDEN_EVENT["days_ahead"])
    ]
    rows += [
        ("event", "golden-organizer", m["title"], m["days_ahead"])
        for m in GOLDEN_MARKETS
    ]
    rows.append(
        (
            "experience",
            "golden-events",
            GOLDEN_EXPERIENCE["title"],
            GOLDEN_EXPERIENCE["days_ahead"],
        )
    )
    return rows


def _golden_refresh_dates(db) -> int:
    """Move every golden event, market and experience back to today + days_ahead.

    The extras are written on CREATE only, so without this their dates stand
    still: the first market is in the past six days after seeding, and the
    organizer page (organizers.py filters `event_date >= israel_today()`) loses
    it, so 03-g3 goes red. Every `--golden` run re-dates them, matched by title
    under the golden owner. Returns the number of rows re-dated.
    """
    moved = 0
    today = israel_today()
    for kind, slug, title, days in _golden_dated_rows():
        producer = db.query(Producer).filter(Producer.slug == slug).first()
        if producer is None:
            continue
        if kind == "event":
            query = db.query(Event).filter(
                Event.producer_id == producer.id, Event.title == title
            )
        else:
            email = next(b["email"] for b in GOLDEN_BUSINESSES if b["slug"] == slug)
            owner = db.query(User).filter(User.email == email).first()
            if owner is None:
                continue
            query = db.query(Experience).filter(
                Experience.host_user_id == owner.id, Experience.title == title
            )
        for row in query.all():
            row.event_date = today + timedelta(days=days)
            moved += 1
    return moved
