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
          category up by name and aborts if missing).
Related:  backend/seed_data.py (base seed patterns) · MEH-999 (producer
          dogfood) · MEH-997 (E2E seed) · MEH-409 (first-10 — the demo is
          swapped for the best real profile after first-10).
History:  MEH-1074 Wave 3 (creation); MEH-1241 (--sync-users QA passwords);
          MEH-1432 (multi-location + delivery-only demo); MEH-1528 (QA admin
          account + dietary-scope demo producers for auth-free QA).

Run (Sapir, Git Bash, after approving the demo identity below):
    railway run python backend/scripts/seed_demo_business.py
Local:
    python backend/scripts/seed_demo_business.py            # skip-if-exists
    python backend/scripts/seed_demo_business.py --refresh  # recreate
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
from app.models.models import ProducerReview, Event, User  # noqa: E402  # imports must follow sys.path.insert (script shim)

# ============================================================================
# DEMO IDENTITY — APPROVED (Sapir, MEH-1074 closeout). The identity values
# (business name, contact name, category, product set) live in the dict below
# and in the MEH-1074 Linear description. Photo URLs point to free-stock
# images uploaded to our Cloudinary cloud (dfzpscjks) under mehamakor/demo/,
# tagged staging-only (MEH-1198 SYNC 16/07 → MEH-1252). One image per slot:
# hero + one per product (sourdough / challah / spelt / cookies).
# GUARD — STAGING ONLY: never promote/import this row to production (DNA:
# licensed-only, trust); MEH-409 swaps it for the best real profile after
# first-10. The _assert_not_production() gate below enforces staging-only.
# ============================================================================
DEMO_SLUG = "ruach-hasadeh"
DEMO_CATEGORY_NAME = "לחמים ואפייה"

DEMO_PRODUCER = {
    "name": "מאפיית רוח השדה",
    "contact_name": "נועה לביא",
    "slug": DEMO_SLUG,
    "description": (
        "מאפיית בוטיק משפחתית בזכרון יעקב, שמתמחה בלחמי מחמצת בתהליך "
        "התפחה איטי של 24 שעות. אנחנו טוחנות חלק מהקמחים באבן ממש כאן "
        "במאפייה, עובדות עם חיטה מגידול מקומי, ואופות בתנור אבן. "
        "כל לחם יוצא מהתנור באותו בוקר שבו הוא מגיע אליכן — בלי משפרי "
        "אפייה, בלי חומרים משמרים, עם המון סבלנות."
    ),
    "short_description": "לחמי מחמצת בהתפחה איטית, קמח טחינת אבן, אפייה יומית בתנור אבן.",
    "city": "זכרון יעקב",
    "address": "רחוב המייסדים 12, זכרון יעקב",
    "lat": 32.5732,
    "lng": 34.9519,
    "phone": "050-0000001",  # fictional — swap before staging run
    "instagram": "@ruach_hasadeh",
    "primary_contact_method": "whatsapp",
    "opening_hours": "א'-ה' 07:00-14:00, ו' 06:30-13:00",
    "kosher": "כשר",
    "producer_license_number": "10-000001",  # fictional — admin-only surface
    "images": [
        # dfzpscjks cloud (MEH-1198 SYNC) — free-stock, tagged staging-only.
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-hero",
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-sourdough",
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-challah",
    ],
    "top_product_name": "לחם מחמצת כפרי",
    "price_range": "מ-₪24",
}

DEMO_PRODUCTS = [
    {
        "name": "לחם מחמצת כפרי",
        "description": "כיכר קלאסית 800 גרם — קמח לבן וקמח מלא טחינת אבן, התפחה של 24 שעות.",
        "price_min": 28,
        "price_max": 34,
        "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-sourdough",
    },
    {
        "name": "חלה קלועה לשבת",
        "description": "חלה רכה ומבריקה על בסיס מחמצת, נאפית בימי חמישי ושישי בלבד.",
        "price_min": 24,
        "price_max": 28,
        "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-challah",
    },
    {
        "name": "לחם כוסמין מלא",
        "description": "כיכר 100% כוסמין מלא, מתאימה גם למי שמעדיפות דגנים עתיקים.",
        "price_min": 30,
        "price_max": 36,
        "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-spelt",
    },
    {
        "name": "עוגיות שקדים ללא גלוטן",
        "description": "עוגיות על בסיס קמח שקדים ודבש מקומי — נאפות בנפרד מקו הלחמים.",
        "price_min": 25,
        "price_max": 30,
        "is_gluten_free": True,
        "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-cookies",
    },
]

DEMO_DELIVERY_AREAS = [
    {"city": "זכרון יעקב", "min_order": 60, "delivery_day": "שלישי"},
    {"city": "בנימינה", "min_order": 80, "delivery_day": "שלישי"},
    {"city": "חדרה", "min_order": 100, "delivery_day": "חמישי"},
]

DEMO_RECIPE = {
    "title": "ברוסקטה חגיגית מלחם מחמצת",
    "description": "דרך מהירה להפוך כיכר של אתמול לפתיח חגיגי — עשר דקות עבודה.",
    "ingredients": (
        "- 6 פרוסות לחם מחמצת כפרי\n"
        "- 3 עגבניות בשלות, קצוצות\n"
        "- שן שום\n"
        "- 3 כפות שמן זית\n"
        "- חופן עלי בזיליקום\n"
        "- מלח גס ופלפל שחור"
    ),
    "instructions": (
        "1. קולים את פרוסות הלחם בטוסטר-אובן עד הזהבה קלה.\n"
        "2. משפשפים כל פרוסה חמה בשן השום.\n"
        "3. מערבבים עגבניות, שמן זית, בזיליקום, מלח ופלפל.\n"
        "4. מעמיסים על הפרוסות ומגישים מיד."
    ),
    "prep_time_min": 10,
    "cook_time_min": 5,
    "servings": 6,
    # Bruschetta made from the כפרי sourdough loaf → reuse its photo.
    "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-sourdough",
}

DEMO_EVENT = {
    "title": "סדנת אפיית לחם מחמצת למתחילות",
    "description": (
        "בואו ללוש, לקפל ולהבין סוף-סוף מה המחמצת רוצה מכן. "
        "כוללת ארוחת בוקר מתוצרת המאפייה, וכל משתתפת חוזרת הביתה "
        "עם מחמצת חיה וכיכר שאפתה בעצמה."
    ),
    "days_ahead": 21,  # event_date = seed-run date + N days (stays future)
    "event_time": "09:30",
    "location": "המאפייה, רחוב המייסדים 12",
    "category": "סדנה",
    "price": 120,
    "max_participants": 12,
    # Bread-baking workshop → reuse the hero (basket of assorted breads).
    "image_url": "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-hero",
}

# Seed reviewers — @example.com per tests convention; passwords are random
# and unrecorded (these accounts are display-only social proof).
DEMO_REVIEWS = [
    {
        "email": "demo-reviewer-1@example.com",
        "user_name": "רות כהן",
        "stars": 5,
        "body": "הלחם הכי טוב שאכלנו. הזמנו לשבת וכל המשפחה התמכרה — החלה נגמרה עוד לפני הקידוש.",
        "reply": (
            "תודה רבה רות! החלות של יום שישי נאפות עם קמח כוסמין חדש "
            "מהטחנה — מוזמנות לטעום בשבוע הבא."
        ),
    },
    {
        "email": "demo-reviewer-2@example.com",
        "user_name": "מיכל ברק",
        "stars": 5,
        "body": "משלוח הגיע בזמן, הלחם עוד היה חם. רואים שיש כאן אהבה אמיתית למקצוע.",
    },
    {
        "email": "demo-reviewer-3@example.com",
        "user_name": "שרה פרידמן",
        "stars": 4,
        "body": "עוגיות השקדים ללא הגלוטן מצוינות. הייתי שמחה לעוד מגוון ללא גלוטן.",
    },
]

DEMO_OWNER_EMAIL = "demo-owner@example.com"
# MEH-1241: dedicated QA consumer (code constant, NOT an env var). Distinct
# from the 3 display-only review consumers (DEMO_REVIEWS), which keep their
# random unrecorded passwords and are never touched by --sync-users.
DEMO_CONSUMER_EMAIL = "demo-consumer@example.com"
DEMO_CONSUMER_NAME = "לקוחת בדיקות (QA)"
# MEH-1528: dedicated QA admin (code constant; password from DEMO_ADMIN_PASSWORD
# env — the ONLY new env var this ticket adds). role="admin", NO producer_id.
# Provisioned exactly like the consumer (upsert in --sync-users), giving the
# Playwright admin.json storageState a distinct, admin-role login so the
# admin-panel proof test can prove the roles are separate (not three copies of
# the same login). STAGING ONLY — must never exist in production (the
# _assert_not_production() guard below + ADR-029 check_no_demo_data.py enforce it).
DEMO_ADMIN_EMAIL = "demo-admin@example.com"
DEMO_ADMIN_NAME = "מנהלת בדיקות (QA)"
ADMIN_NOTE = (
    "DEMO BUSINESS — MEH-1074 Wave 3 'sample perfect listing'. "
    "STAGING ONLY: never promote/import this row to production "
    "(swap for the best real profile after first-10, MEH-409)."
)

# MEH-1432 (MEH-1388 chunk 6): producer_locations for the demo business — a
# 10-location set ALL in one city (זכרון יעקב) so the E2E multi-location
# assertions have real data: (a) markers fan out per location, (b) a business
# with 10 pins clusters as ONE unique business, (c) every location shares the
# city so the same-city LABEL rule is exercised. 1 branch (primary, the
# business's own coords) + 9 pickup points, scattered ~0.5-3 km around the
# business so they collapse into a single cluster at the default /map zoom (8)
# yet remain distinct rows. Coordinates are inside the זכרון יעקב / בנימינה band.
DEMO_LOCATIONS = [
    {
        "kind": "branch",
        "label": "המאפייה (הסניף המרכזי)",
        "city": "זכרון יעקב",
        "address": "רחוב המייסדים 12, זכרון יעקב",
        "lat": 32.5732,
        "lng": 34.9519,
        "is_primary": True,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — מרכז זכרון",
        "city": "זכרון יעקב",
        "lat": 32.5748,
        "lng": 34.9536,
        "is_primary": False,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — שוק האיכרים",
        "city": "זכרון יעקב",
        "lat": 32.5711,
        "lng": 34.9502,
        "is_primary": False,
        "location_precision": "approximate",
    },
    {
        "kind": "pickup",
        "label": "איסוף — רמת צבי",
        "city": "זכרון יעקב",
        "lat": 32.5769,
        "lng": 34.9548,
        "is_primary": False,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — נחלת ז'בוטינסקי",
        "city": "זכרון יעקב",
        "lat": 32.5695,
        "lng": 34.9560,
        "is_primary": False,
        "location_precision": "approximate",
    },
    {
        "kind": "pickup",
        "label": "איסוף — גן שמואל",
        "city": "זכרון יעקב",
        "lat": 32.5801,
        "lng": 34.9491,
        "is_primary": False,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — כיכר המושבה",
        "city": "זכרון יעקב",
        "lat": 32.5726,
        "lng": 34.9575,
        "is_primary": False,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — בית הבד",
        "city": "זכרון יעקב",
        "lat": 32.5680,
        "lng": 34.9524,
        "is_primary": False,
        "location_precision": "approximate",
    },
    {
        "kind": "pickup",
        "label": "איסוף — הגן הבהאי",
        "city": "זכרון יעקב",
        "lat": 32.5758,
        "lng": 34.9507,
        "is_primary": False,
        "location_precision": "exact",
    },
    {
        "kind": "pickup",
        "label": "איסוף — תחנת הרכבת",
        "city": "זכרון יעקב",
        "lat": 32.5703,
        "lng": 34.9543,
        "is_primary": False,
        "location_precision": "exact",
    },
]

# MEH-1432: a SECOND demo producer — delivery-only (has_physical_location=False)
# WITH one pickup location. Proves the chunk-2 MEH-213 reversal: a delivery-only
# business reappears on /map BECAUSE it owns a pickup point (a zero-location
# delivery-only producer stays hidden — the existing behaviour, no seed needed).
# STAGING ONLY, same as the primary demo. Minimal-but-approvable (>=1 image).
DELIVERY_ONLY_SLUG = "demo-delivery-pickup"
DELIVERY_ONLY_PRODUCER = {
    "name": "משק החלב של דנה (משלוחים + איסוף)",
    "contact_name": "דנה כהן",
    "slug": DELIVERY_ONLY_SLUG,
    "description": "משק חלב משפחתי — מוכר במשלוחים ובנקודת איסוף אחת בבנימינה. דמו לבדיקת ריבוי-מיקום (delivery-only + pickup).",
    "short_description": "גבינות עזים טריות במשלוח ובאיסוף.",
    "city": "בנימינה",
    # Project-owned cloud (dfzpscjks), same staging-only demo bucket as the
    # primary demo producer — resilient vs the public cloudinary/demo sample.
    "images": [
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-hero"
    ],
}
DELIVERY_ONLY_LOCATION = {
    "kind": "pickup",
    "label": "איסוף — מרכז בנימינה",
    "city": "בנימינה",
    "lat": 32.5190,
    "lng": 34.9530,
    "is_primary": True,
    "location_precision": "exact",
}

# ============================================================================
# MEH-1528 — DIETARY-SCOPE DEMO PRODUCERS (Component B). Three approved, public
# producers that populate the MEH-1508 scope columns so the dietary QA checks
# have data WITHOUT any login:
#   - gluten_free_facility: one producer for EACH state — unknown | shared |
#     dedicated (makes the public gluten row fully testable, auth-free).
#   - vegan_scope / vegetarian_scope: at least one 'all' AND one 'some' each, so
#     the chunk-3 "100%" chips have real rows to gate on.
# The scope columns already exist on staging (schema chunk 1, revision
# d51508a7c9e2 — models.py:122-133); NO filter reads them yet, so this is pure
# fixture DATA, not behaviour. STAGING ONLY (ADMIN_NOTE carries the DEMO marker
# that ADR-029's check_no_demo_data.py flags). Idempotent per-slug (see
# seed_dietary_scope_demos) and swept out on --refresh. Names are obviously
# demo ("דמו QA — …") and deliberately avoid seed_demo_producers.py's
# TEST_NAME_PATTERNS so its --reset never collides with them.
#
# Coverage matrix (verified against B1/B2):
#   slug                 | gluten     | vegan | vegetarian
#   demo-diet-dedicated  | dedicated  | all   | all
#   demo-diet-shared     | shared     | some  | some
#   demo-diet-unknown    | unknown    | all   | some
# → gluten: {unknown, shared, dedicated} one each ✓
#   vegan_scope: {all, some} both present ✓ · vegetarian_scope: {all, some} ✓
# ============================================================================
DIETARY_SCOPE_DEMOS = [
    {
        "slug": "demo-diet-dedicated",
        "name": "דמו QA — מטבח נקי מגלוטן (ייעודי)",
        "contact_name": "בדיקות QA",
        "short_description": "דמו לבדיקה: מתקן ייעודי נטול גלוטן, קטלוג טבעוני וצמחוני מלא.",
        "gluten_free_facility": "dedicated",
        "vegan_scope": "all",
        "vegetarian_scope": "all",
    },
    {
        "slug": "demo-diet-shared",
        "name": "דמו QA — מטבח עם קו משותף",
        "contact_name": "בדיקות QA",
        "short_description": "דמו לבדיקה: מתקן משותף, חלק מהמוצרים טבעוניים/צמחוניים.",
        "gluten_free_facility": "shared",
        "vegan_scope": "some",
        "vegetarian_scope": "some",
    },
    {
        "slug": "demo-diet-unknown",
        "name": "דמו QA — מטבח דיאטה (מצב לא ידוע)",
        "contact_name": "בדיקות QA",
        "short_description": "דמו לבדיקה: מצב מתקן הגלוטן לא הוגדר; קטלוג טבעוני מלא.",
        "gluten_free_facility": "unknown",
        "vegan_scope": "all",
        "vegetarian_scope": "some",
    },
]
# Shared demo hero image (project-owned dfzpscjks cloud, staging-only bucket).
DIETARY_DEMO_IMAGE = "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-hero"
DIETARY_DEMO_CITY = "זכרון יעקב"


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


def _delete_existing(db) -> None:
    """--refresh path: remove the demo producer (cascade covers products,
    areas, recipes, reviews) + its events + seed users, then recreate."""
    producer = db.query(Producer).filter(Producer.slug == DEMO_SLUG).first()
    if producer:
        db.query(Event).filter(Event.producer_id == producer.id).delete()
        # MEH-1432: producer_locations rows carry ON DELETE CASCADE, so
        # db.delete(producer) removes them too; the explicit ORM delete keeps the
        # session identity map clean on re-seed (same reasoning as the Event
        # delete above and the review deletes below).
        db.query(ProducerLocation).filter(
            ProducerLocation.producer_id == producer.id
        ).delete()
        db.delete(producer)  # ORM cascade covers products/areas/reviews/recipes
    # MEH-1432: the delivery-only demo producer (its 1 pickup cascades / cleared).
    delivery_only = (
        db.query(Producer).filter(Producer.slug == DELIVERY_ONLY_SLUG).first()
    )
    if delivery_only:
        db.query(ProducerLocation).filter(
            ProducerLocation.producer_id == delivery_only.id
        ).delete()
        db.delete(delivery_only)
    # MEH-1528: the dietary-scope demo producers (ORM cascade covers their
    # ProducerCategory rows — they have no locations/products/reviews).
    for diet in (
        db.query(Producer)
        .filter(Producer.slug.in_([d["slug"] for d in DIETARY_SCOPE_DEMOS]))
        .all()
    ):
        db.delete(diet)
    # MEH-1528: DEMO_ADMIN_EMAIL joins the owner in the delete set (both are
    # recreated by seed_demo_business); the display reviewers stay by convention.
    emails = [r["email"] for r in DEMO_REVIEWS] + [DEMO_OWNER_EMAIL, DEMO_ADMIN_EMAIL]
    # ORM-level deletes (not bulk .delete()) keep the session's identity map
    # consistent — a bulk delete here leaves stale review objects that emit a
    # spurious 0-rows-matched DELETE at the re-seed commit.
    for user in db.query(User).filter(User.email.in_(emails)).all():
        db.delete(user)
    db.commit()


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
    db.add(
        User(
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
                reply_at=datetime.utcnow() if r.get("reply") else None,
            )
        )

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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="delete the existing demo business (+ seed users) and recreate",
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
    args = parser.parse_args()
    if args.sync_users and args.refresh:
        sys.exit("--sync-users and --refresh are mutually exclusive.")
    _assert_not_production()
    db = SessionLocal()
    try:
        if args.sync_users:
            _sync_users(db)
        else:
            seed_demo_business(db, refresh=args.refresh)
            # MEH-1528: always run — idempotent per-slug, so it seeds the
            # dietary demos even when the main business already existed (the
            # skip-if-exists path above returns before creating anything).
            seed_dietary_scope_demos(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
