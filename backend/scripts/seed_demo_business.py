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
History:  MEH-1074 Wave 3 (creation).

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
    Product,
    ProducerRecipe,
)
from app.models.models import ProducerReview, Event, User  # noqa: E402  # imports must follow sys.path.insert (script shim)

# ============================================================================
# DEMO IDENTITY — ⚠️ needs-sapir checkpoint (MEH-1074 authority matrix §3).
# Everything in this block is a FICTIONAL draft: business name, person name,
# story, phone, license number, and photo URLs (Cloudinary public demo-cloud
# assets as placeholders — swap for real uploads on the mehamakor cloud).
# Sapir approves/edits this block, then runs the script against staging —
# the run itself is the approval act. Never promote this row to production
# (DNA: licensed-only, trust) — MEH-409 swaps it for a real profile.
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
        # Cloudinary public demo cloud — placeholders, swap for real uploads.
        "https://res.cloudinary.com/demo/image/upload/bread.jpg",
        "https://res.cloudinary.com/demo/image/upload/cld-sample-4.jpg",
        "https://res.cloudinary.com/demo/image/upload/cld-sample-2.jpg",
    ],
    "top_product_name": "לחם מחמצת כפרי",
    "price_range": "מ-₪24",
}

DEMO_PRODUCTS = [
    {
        "name": "לחם מחמצת כפרי",
        "description": "כיכר קלאסית 800 גרם — קמח לבן וקמח מלא טחינת אבן, התפחה של 24 שעות.",
        "price_min": 28, "price_max": 34,
        "image_url": "https://res.cloudinary.com/demo/image/upload/bread.jpg",
    },
    {
        "name": "חלה קלועה לשבת",
        "description": "חלה רכה ומבריקה על בסיס מחמצת, נאפית בימי חמישי ושישי בלבד.",
        "price_min": 24, "price_max": 28,
    },
    {
        "name": "לחם כוסמין מלא",
        "description": "כיכר 100% כוסמין מלא, מתאימה גם למי שמעדיפות דגנים עתיקים.",
        "price_min": 30, "price_max": 36,
    },
    {
        "name": "עוגיות שקדים ללא גלוטן",
        "description": "עוגיות על בסיס קמח שקדים ודבש מקומי — נאפות בנפרד מקו הלחמים.",
        "price_min": 25, "price_max": 30,
        "is_gluten_free": True,
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
    "image_url": "https://res.cloudinary.com/demo/image/upload/cld-sample-4.jpg",
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
    "image_url": "https://res.cloudinary.com/demo/image/upload/cld-sample-2.jpg",
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
ADMIN_NOTE = (
    "DEMO BUSINESS — MEH-1074 Wave 3 'sample perfect listing'. "
    "STAGING ONLY: never promote/import this row to production "
    "(swap for the best real profile after first-10, MEH-409)."
)


def _assert_not_production() -> None:
    """Refuse to run against anything that is not localhost or Railway staging.

    Two independent signals must both fail before we abort:
    - DB host is local (localhost/127.0.0.1) → always allowed (dev/CI/tests).
    - RAILWAY_ENVIRONMENT == "staging" → the Railway staging service/CLI
      context (deploy.yml sets the same var; production sets "production").
    """
    host = (urlparse(str(engine.url).replace("postgresql+psycopg2", "postgresql")).hostname or "").lower()
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
        db.delete(producer)  # ORM cascade covers products/areas/reviews/recipes
    emails = [r["email"] for r in DEMO_REVIEWS] + [DEMO_OWNER_EMAIL]
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
        )
    )

    for r in DEMO_REVIEWS:
        reviewer = User(
            email=r["email"],
            name=r["user_name"],
            password_hash=hash_password(secrets.token_urlsafe(16)),
            role="consumer",
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

    db.commit()
    print(f"Demo business seeded: /{DEMO_SLUG} (producer {producer.id})")
    return producer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="delete the existing demo business (+ seed users) and recreate",
    )
    args = parser.parse_args()
    _assert_not_production()
    db = SessionLocal()
    try:
        seed_demo_business(db, refresh=args.refresh)
    finally:
        db.close()


if __name__ == "__main__":
    main()
