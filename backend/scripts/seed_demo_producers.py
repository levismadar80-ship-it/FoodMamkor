"""
Module:   seed_demo_producers
Purpose:  Reproducible demo-seed pack for STAGING (MEH-1300): delete every
          existing TEST business, then insert 10 realistic fictional local
          businesses with Cloudinary hero images, magazine-voice descriptions,
          real geo, a spread of ratings, and kashrut badges — so the card
          design can be judged on real-looking data.
Touches:  DB tables producers / users / producer_categories / producer_reviews
          / events (delete path); Cloudinary folder demo/ (hero upload).
Does NOT: touch production — a hard environment guard refuses any non-local DB
          host unless RAILWAY_ENVIRONMENT == "staging". Does NOT create/modify
          categories (backend/seed_data.py owns those; looked up by name, aborts
          if missing). Does NOT change schema (all columns already exist).
Related:  backend/scripts/seed_demo_business.py (single-business pattern — env
          guard + ORM-cascade delete reused here) · seed_data.py (CATEGORIES) ·
          trust_tier.py:3 (VALID_BADGE_CODES) · admin_kashrut.py:72-79 (kashrut
          expiry model, MEH-1260) · ProducerCard.jsx:242 (leaf placeholder,
          MEH-643) — the 2 image-less businesses exercise that path.
History:  MEH-1300 (creation).

Run (Sapir, Railway one-off — deletes require --confirm):
    # 1) dry-run: prints exactly what WOULD be deleted + inserted, no writes
    python -m scripts.seed_demo_producers --reset
    # 2) execute the reset + insert
    python -m scripts.seed_demo_producers --reset --confirm
Local / re-run (idempotent — skips demo slugs that already exist):
    python -m scripts.seed_demo_producers --confirm
"""

import argparse
import os
import secrets
import sys
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.auth import hash_password  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.config import settings  # noqa: E402
from app.database import SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Category,
    Producer,
    ProducerCategory,
)
from app.models.models import Event, ProducerReview, User  # noqa: E402

# ============================================================================
# RESET — names of the current TEST businesses to delete (substring match on
# producers.name). Covers every seed/QA/demo row that has accumulated on
# staging (per MEH-1300 spec). Matched case-as-is; Hebrew has no case folding.
# NOTE: the demo businesses inserted below deliberately avoid every one of
# these substrings so a later `--reset` never sweeps a fresh demo row.
# ============================================================================
TEST_NAME_PATTERNS = [
    "יצרן לדוגמה",
    "מסונן",
    "מהמקור",
    "בדיקת UX",
    "משק דוגמה קלוד",
    "מטבח הבית",
    "טבע פור",
    "חוות הגליל",
    "גבינות הר הגולן",
    "מאפיית המחמצת",
    "תסס",
    "מאפיית רוח השדה",
]

ADMIN_NOTE = (
    "DEMO BUSINESS — MEH-1300 demo-seed pack. STAGING ONLY: never promote/"
    "import this row to production (swap for real profiles after first-10, "
    "MEH-409)."
)

# Shared pool of warm, believable consumer reviews (feminine voice). Assigned
# round-robin per business; each review gets its own display-only consumer.
REVIEW_BODIES = [
    "הזמנתי לשבת והכול הגיע טרי ומוקפד. חוזרת בשמחה.",
    "איכות מדהימה ויחס אישי. ממליצה בחום לכל השכנות.",
    "טעם ביתי אמיתי, רואים שיש כאן אהבה למקצוע.",
    "המשלוח הגיע בזמן והכול היה ארוז יפה. מרוצה מאוד.",
    "פשוט מעולה. כבר הזמנתי שוב וסיפרתי לחברות.",
    "מוצר איכותי במחיר הוגן. בדיוק מה שחיפשתי באזור.",
    "התרשמתי מהטריות ומהשירות. תודה על החוויה.",
    "הכי טעים שאכלנו מזמן. ההזמנה הבאה כבר בדרך.",
]

# ============================================================================
# THE 10 DEMO BUSINESSES.
# Fields per business:
#   slug, name, contact_name, category (looked up by name), city, address,
#   lat, lng, phone, short_description (magazine voice, feminine, 6-10 words),
#   description, kosher, kashrut (VALID_BADGE_CODES code or None),
#   verified (tier-1 verified markers or not), review_stars (list — [] = none),
#   image (Unsplash direct URL uploaded to Cloudinary demo/, or None = tests
#   the leaf-placeholder path).
# Category note (MEH-1300): there is no "שמן זית" category row — the olive-oil
# business maps to the existing "שמנים" category (data choice, not a category
# change; scope constraint honored).
# ============================================================================
DEMO_BUSINESSES = [
    {
        "slug": "lehem-vezman",
        "name": "מאפיית לחם וזמן",
        "contact_name": "יעל אבידן",
        "category": "לחמים ואפייה",
        "city": "מודיעין",
        "address": "רחוב האלה 4, מודיעין",
        "lat": 31.8928,
        "lng": 35.0116,
        "phone": "050-0000010",
        "short_description": "מחמצת שמתפיחה 48 שעות, נאפית בתנור אבן מדי בוקר.",
        "description": (
            "מאפיית בוטיק קטנה שמאמינה בזמן. אנחנו לשות ביד, מתפיחות לאט "
            "ואופות בתנור אבן — בלי משפרי אפייה ובלי קיצורי דרך. כל כיכר "
            "יוצאת מהתנור באותו בוקר שבו היא מגיעה אליכן."
        ),
        "kosher": "כשר",
        "kashrut": "badatz",
        "verified": True,
        "review_stars": [5, 5, 5, 5, 4, 5, 5, 4, 5, 5, 5, 4],  # 12 → 4.8
        "image": "https://images.unsplash.com/photo-1509440159596-0249088772ff",
    },
    {
        "slug": "beit-habatzek-dana",
        "name": "בית הבצק של דנה",
        "contact_name": "דנה שגב",
        "category": "לחמים ואפייה",
        "city": "רעננה",
        "address": "אחוזה 112, רעננה",
        "lat": 32.1848,
        "lng": 34.8713,
        "phone": "050-0000011",
        "short_description": "בצק חמאה מעלים, קרואסונים שנאפים טרי בכל בוקר.",
        "description": (
            "מאפייה צרפתית קטנה בלב רעננה. עובדות עם חמאה אמיתית ובצק "
            "שמתקפל שכבה-על-שכבה במשך יומיים. הקרואסונים נגמרים מוקדם — "
            "מי שמקדימה, זוכה."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [],  # none
        "image": None,  # tests leaf placeholder (1/2)
    },
    {
        "slug": "machlevet-emek-haela",
        "name": "מחלבת עמק האלה",
        "contact_name": "נועה קרן",
        "category": "חלב וגבינות",
        "city": "קצרין",
        "address": "דרך היקב 7, קצרין",
        "lat": 32.9911,
        "lng": 35.6900,
        "phone": "050-0000012",
        "short_description": "גבינות עז מחלב המשק, מיושנות במרתף קריר.",
        "description": (
            "מחלבה משפחתית ברמת הגולן. העדר קטן, החלב טרי מהבוקר, "
            "והגבינות מבשילות לאט במרתף. אנחנו מכינות בכל שבוע כמות "
            "מוגבלת — כדי שכל ראש גבינה יקבל את הזמן שמגיע לו."
        ),
        "kosher": "כשר",
        "kashrut": "mehadrin",
        "verified": True,
        "review_stars": [5, 4, 5, 4, 5, 4, 4, 5],  # 8 → 4.5
        "image": "https://images.unsplash.com/photo-1486297678162-eb2a19b0a32d",
    },
    {
        "slug": "gvinot-tamar",
        "name": "גבינות של תמר",
        "contact_name": "תמר בן-דוד",
        "category": "חלב וגבינות",
        "city": "כפר סבא",
        "address": "ויצמן 55, כפר סבא",
        "lat": 32.1750,
        "lng": 34.9070,
        "phone": "050-0000013",
        "short_description": "יוגורט כבשים סמיך ולבנה ביתית, בלי מייצבים.",
        "description": (
            "מטבח ביתי שהפך למחלבה קטנה. אני מכינה יוגורט וגבינות רכות "
            "מחלב כבשים מקומי, בלי אבקות ובלי מייצבים — רק חלב, מחמצת "
            "וזמן. הכול נעשה בכמויות קטנות ובאהבה."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [],  # none
        "image": "https://images.unsplash.com/photo-1488477181946-6428a0291777",
    },
    {
        "slug": "kaveret-ayal",
        "name": "כוורת הדבש של איל",
        "contact_name": "איל רם",
        "category": "דבש",
        "city": "כרמיאל",
        "address": "משעול הגליל 3, כרמיאל",
        "lat": 32.9195,
        "lng": 35.2952,
        "phone": "050-0000014",
        "short_description": "דבש כוורת פרחי בר, נקטף ביד בסוף הקיץ.",
        "description": (
            "כוורות קטנות בין פרדסי ושדות הגליל. אנחנו רודות את הדבש רק "
            "בסוף העונה, בלי חימום ובלי סינון תעשייתי — כדי לשמור על "
            "הטעם ועל האבקנים. כל מכל נושא את הפרחים של האזור שלו."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [5, 5, 5, 4, 5, 5],  # 6 → 4.8
        "image": "https://images.unsplash.com/photo-1587049352846-4a222e784d38",
    },
    {
        "slug": "hagina-rotem",
        "name": "הגינה של רותם",
        "contact_name": "רותם לביא",
        "category": "ירקות",
        "city": "פרדס חנה-כרכור",
        "address": "רחוב הדקל 9, פרדס חנה",
        "lat": 32.4744,
        "lng": 34.9722,
        "phone": "050-0000015",
        "short_description": "ירקות העונה מהגינה, נקטפים בבוקר ההזמנה.",
        "description": (
            "חלקה קטנה שמגדלת ירקות עונה בשיטות טבעיות. קוטפות בבוקר, "
            "אורזות בצהריים, ומחלקות עוד באותו יום. מה שיש בשדה — זה מה "
            "שיש בארגז, ובדיוק בעונה הנכונה."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [4, 5, 4],  # 3 → 4.3
        "image": "https://images.unsplash.com/photo-1542838132-92c53300491e",
    },
    {
        "slug": "kvushim-savta-miriam",
        "name": "הכבושים של סבתא מרים",
        "contact_name": "מרים אלקיים",
        "category": "מותססים וכבושים",
        "city": "זכרון יעקב",
        "address": "המייסדים 20, זכרון יעקב",
        "lat": 32.5722,
        "lng": 34.9522,
        "phone": "050-0000016",
        "short_description": "כרוב כבוש וקימצ'י במלח ים, בהתססה איטית וסבלנית.",
        "description": (
            "מתכונים שעברו שלושה דורות. אנחנו כובשות ירקות עונה במלח ים "
            "בלבד ונותנות להם להתסיס לאט בצנצנות זכוכית — בלי חומץ ובלי "
            "חומרים משמרים. כל מנה חיה, פריכה ומלאת חיידקים טובים."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [5, 4],  # 2 → 4.5
        "image": "https://images.unsplash.com/photo-1589621316382-008455b857cd",
    },
    {
        "slug": "meshek-harel-bakar",
        "name": "משק הבקר של הראל",
        "contact_name": "הראל כהן",
        "category": "בשר",
        "city": "מטולה",
        "address": "דרך המושבה 2, מטולה",
        "lat": 33.2794,
        "lng": 35.5779,
        "phone": "050-0000017",
        "short_description": "בקר מרעה גלילי, בגידול איטי וללא הורמונים.",
        "description": (
            "משק בקר על מרעה טבעי בקצה הצפון. הבהמות גדלות לאט, באוויר "
            "פתוח, בלי הורמונים ובלי זירוז. אנחנו מוכרות ישירות מהמשק — "
            "אתן יודעות בדיוק מאיפה הבשר הגיע."
        ),
        "kosher": "כשר",
        "kashrut": "chalak",
        "verified": True,
        "review_stars": [],  # none
        "image": "https://images.unsplash.com/photo-1607623814075-e51df1bdc82f",
    },
    {
        "slug": "beit-habad-zeitun",
        "name": "בית הבד של זייתון",
        "contact_name": "סאמי זייתון",
        "category": "שמנים",
        "city": "נהריה",
        "address": "שדרות הגעתון 30, נהריה",
        "lat": 33.0058,
        "lng": 35.0948,
        "phone": "050-0000018",
        "short_description": "שמן זית כתית מעצים עתיקים, כבישה קרה ראשונה.",
        "description": (
            "בית בד משפחתי בגליל המערבי. הזיתים נמסקים ביד ונכבשים קר "
            "באותו יום, כדי לשמור על החומציות הנמוכה ועל הארומה. שמן "
            "אחד, מעצים שאנחנו מכירות בשם."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [],  # none
        "image": None,  # tests leaf placeholder (2/2)
    },
    {
        "slug": "sabon-ez-naama",
        "name": "סבוני חלב עז של נעמה",
        "contact_name": "נעמה שרון",
        "category": "קוסמטיקה טבעית",
        "city": "ירושלים",
        "address": "עין כרם, ירושלים",
        "lat": 31.7683,
        "lng": 35.2137,
        "phone": "050-0000019",
        "short_description": "סבוני חלב עז ודבש, מבושלים בקדרה בעבודת יד.",
        "description": (
            "מעבדת סבון קטנה בעין כרם. אני מבשלת סבונים מחלב עז, שמן "
            "זית ודבש מקומי — בשיטה קרה, בסבלנות, ובלי כימיקלים. כל חפיסה "
            "מיובשת שישה שבועות לפני שהיא יוצאת אליכן."
        ),
        "kosher": None,
        "kashrut": None,  # cosmetics — NO kashrut (MEH-1300)
        "verified": False,  # cosmetics — NO verified markers (MEH-1300)
        "review_stars": [],  # none
        "image": "https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec",
    },
]


def _assert_not_production() -> None:
    """Refuse to run against anything that is not localhost or Railway staging.

    Mirrors seed_demo_business._assert_not_production (MEH-1074): local DB host
    is always allowed (dev/CI/tests); a remote host is allowed only when
    RAILWAY_ENVIRONMENT == "staging". Production ("production") aborts.
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
        f"REFUSING to seed demo producers: DB host '{host}' is not local and "
        "RAILWAY_ENVIRONMENT != 'staging'. This script must never touch production."
    )


def _find_test_producers(db) -> list[Producer]:
    """Return the de-duplicated set of producers whose name contains any of the
    TEST_NAME_PATTERNS (substring / LIKE '%pattern%')."""
    matched: dict = {}
    for pattern in TEST_NAME_PATTERNS:
        for prod in db.query(Producer).filter(Producer.name.contains(pattern)).all():
            matched[prod.id] = prod
    return list(matched.values())


def _reset(db, confirm: bool) -> None:
    """Delete every TEST business + its dependents.

    Dependents removed by the ORM cascade on ``db.delete(producer)`` (see the
    Producer relationships: products / delivery_areas / favorited_by / reports /
    reviews / producer_recipes all ``cascade="all, delete-orphan"``, and
    kashrut_badge_requests via DB ON DELETE CASCADE / passive_deletes). Two
    dependents need explicit handling because their FK is ``SET NULL``, which
    would otherwise orphan them:
      - Events (events.producer_id → SET NULL): deleted up-front.
      - Owner users (users.producer_id → SET NULL): a producer-less role=
        'producer' renders a broken /producer/undefined menu (MEH-1226), so the
        test owners are deleted (mirrors seed_demo_business._delete_existing).

    Without ``confirm`` this only prints the dry-run summary — no writes.
    """
    producers = _find_test_producers(db)
    ids = [p.id for p in producers]
    review_count = (
        db.query(ProducerReview).filter(ProducerReview.producer_id.in_(ids)).count()
        if ids
        else 0
    )
    owner_count = (
        db.query(User).filter(User.producer_id.in_(ids)).count() if ids else 0
    )

    print("── RESET ─────────────────────────────────────────────")
    if not producers:
        print("  No matching TEST producers found — nothing to delete.")
    else:
        print(f"  {'WOULD delete' if not confirm else 'Deleting'} "
              f"{len(producers)} producer(s):")
        for p in producers:
            print(f"    · {p.name}  (slug={p.slug}, id={p.id})")
        print(f"  + {review_count} review(s), {owner_count} owner user(s), "
              "and all products / favorites / delivery areas / recipes / "
              "kashrut requests / events (cascade).")

    if not confirm:
        print("  [dry-run] pass --confirm to execute the deletes above.")
        return

    if ids:
        db.query(Event).filter(Event.producer_id.in_(ids)).delete(
            synchronize_session=False
        )
        for user in db.query(User).filter(User.producer_id.in_(ids)).all():
            db.delete(user)  # ORM delete keeps the identity map consistent
        for prod in producers:
            db.delete(prod)  # cascade: products/reviews/favorites/areas/recipes
        db.commit()
        print(f"  Deleted {len(producers)} producer(s), {review_count} review(s), "
              f"{owner_count} owner user(s).")


def _upload_hero(slug: str, url: str) -> str | None:
    """Upload a hero image from a remote (Unsplash) URL into the Cloudinary
    ``demo/`` folder with a deterministic public_id (overwrite=True → same
    secure_url every run). Returns the secure_url, or None when Cloudinary is
    unconfigured (dev/local) or the upload fails — a failed image must never
    abort the seed (the business simply falls back to the leaf placeholder).
    """
    if not url:
        return None
    if not settings.cloudinary_cloud_name:
        print(f"    [image] Cloudinary unconfigured — {slug} seeded without a hero.")
        return None
    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            url,
            folder="demo",
            public_id=slug,
            overwrite=True,
            resource_type="image",
        )
        return result["secure_url"]
    except Exception as exc:  # noqa: BLE001 — image is best-effort, never fatal
        print(f"    [image] upload failed for {slug} ({exc}) — using placeholder.")
        return None


def _seed_one(db, biz: dict, confirm: bool) -> tuple[str, bool]:
    """Insert one demo business (+ its reviews). Idempotent: skips a slug that
    already exists. Returns (status_line, was_inserted)."""
    existing = db.query(Producer).filter(Producer.slug == biz["slug"]).first()
    if existing:
        return f"  · {biz['name']} — already exists (skipped)", False

    category = db.query(Category).filter(Category.name == biz["category"]).first()
    if not category:
        sys.exit(
            f"Category '{biz['category']}' not found — run backend/seed_data.py "
            "first (no category is created by this script)."
        )

    stars = biz["review_stars"]
    reviews_count = len(stars)
    avg = round(sum(stars) / reviews_count, 1) if reviews_count else 0.0

    if not confirm:
        img = "hero→Cloudinary demo/" if biz["image"] else "NO image (leaf placeholder)"
        kosher = f"kashrut={biz['kashrut']}" if biz["kashrut"] else "no kashrut"
        return (f"  · {biz['name']} [{biz['category']}] — {img}, "
                f"{reviews_count} reviews (avg {avg or '—'}), {kosher}"), False

    now = datetime.now(timezone.utc)
    image_url = _upload_hero(biz["slug"], biz["image"])

    producer = Producer(
        name=biz["name"],
        contact_name=biz["contact_name"],
        slug=biz["slug"],
        description=biz["description"],
        short_description=biz["short_description"],
        city=biz["city"],
        address=biz["address"],
        lat=biz["lat"],
        lng=biz["lng"],
        phone=biz["phone"],
        primary_contact_method="whatsapp",
        status="approved",
        admin_notes=ADMIN_NOTE,
        images=[image_url] if image_url else [],
        kosher=biz["kosher"],
        availability_state="accepting_orders",
        has_physical_location=True,
        avg_rating=avg,
        reviews_count=reviews_count,
    )
    # Kashrut (MEH-1260 model): badge code + verified/expiry stamps. A future
    # expiry keeps the "כשר" filter honest (MEH-1260 enforces expiry).
    if biz["kashrut"]:
        producer.kashrut_badges = [biz["kashrut"]]
        producer.kashrut_verified_at = now
        producer.kashrut_expires_at = now + timedelta(days=300)
    # Tier-1 verified markers (ADR-022) — NEVER for the cosmetics business.
    if biz["verified"]:
        producer.verified_at = now
        producer.verification_doc_type = "license"
        producer.phone_verified = True

    db.add(producer)
    db.flush()
    db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))

    for i, star in enumerate(stars):
        reviewer = User(
            email=f"demo-{biz['slug']}-rev{i}@example.com",
            name=f"לקוחה {i + 1}",
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
                stars=star,
                body=REVIEW_BODIES[i % len(REVIEW_BODIES)],
            )
        )

    db.commit()
    return (
        f"  · {biz['name']} — inserted ({reviews_count} reviews, avg {avg or '—'})",
        True,
    )


def _seed(db, confirm: bool) -> None:
    print("── SEED ──────────────────────────────────────────────")
    inserted = 0
    for biz in DEMO_BUSINESSES:
        line, was_inserted = _seed_one(db, biz, confirm)
        print(line)
        if was_inserted:
            inserted += 1
    verb = "Inserted" if confirm else "WOULD insert"
    print(f"  {verb} {inserted if confirm else len(DEMO_BUSINESSES)} demo business(es).")
    if not confirm:
        print("  [dry-run] pass --confirm to execute the inserts above.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete ALL existing TEST businesses (+ dependents) before seeding",
    )
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="actually execute writes; without it the script prints a dry-run only",
    )
    args = parser.parse_args()

    _assert_not_production()
    if not args.confirm:
        print("=== DRY-RUN (no DB writes, no Cloudinary uploads) ===")
        print("    Re-run with --confirm to execute.\n")

    db = SessionLocal()
    try:
        if args.reset:
            _reset(db, args.confirm)
            print()
        _seed(db, args.confirm)
    finally:
        db.close()


if __name__ == "__main__":
    main()
