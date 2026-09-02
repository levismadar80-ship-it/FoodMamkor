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
History:  MEH-1300 (creation); MEH-1707 (the flagship demo business is spared
          from --reset — see the TEST_NAME_PATTERNS comment below for why that
          is a role change, not a bug fix); MEH-2056 (every inserted business
          also gets its primary `branch` row on producer_locations — this
          script wrote coordinates with no row, eight times, on 01/09).

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
    Product,
)
from app.models.models import Event, ProducerReview, User  # noqa: E402
from app.services.producer_queries import create_primary_branch_location  # noqa: E402

# ============================================================================
# RESET — names of the ACCUMULATED TEST businesses to delete (substring match
# on producers.name). Matched case-as-is; Hebrew has no case folding.
# NOTE: the demo businesses inserted below deliberately avoid every one of
# these substrings so a later `--reset` never sweeps a fresh demo row.
#
# MEH-1707: "מאפיית רוח השדה" (slug ruach-hasadeh) was REMOVED from this list,
# and that removal is NOT a bug fix — the name was here on purpose. MEH-1300's
# <acceptance_criteria> named all 12 substrings verbatim, and the flagship was
# already a live staging row (seed_demo_business.py, PR #1597, 11/07) when that
# spec was written on 17/07. What changed since is the ROW'S ROLE, not the code:
# from MEH-1706 onward the flagship carries the seed coverage contract (the
# end-to-end proof surface, CI-gated against drift), which makes it
# infrastructure. `--reset` exists to clear accumulated TEST data, and
# infrastructure is not test data.
#
# So: `--reset` sweeps the accumulated TEST rows below and nothing else. The
# flagship demo business is owned by seed_demo_business.py and is spared.
# DO NOT re-add it here — its lifecycle belongs to the script that owns it.
#
# Note what that does NOT give you: `seed_demo_business.py --refresh` REBUILDS
# the flagship (delete, then recreate — see seed_demo_business.py:481-482, no
# early return) and is therefore not a way to remove it. After this change no
# script removes the flagship permanently; that is a deliberate manual DB
# action. MEH-409 owns the deletion path for when the demo is swapped for a
# real profile.
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


# ============================================================================
# THE 8 ARCHETYPE x CHANNEL BUSINESSES (MEH-2189).
#
# WHY A SECOND LIST and not eight more rows above: DEMO_BUSINESSES exists to
# make the CARD design judgeable on realistic data (MEH-1300) and every row in
# it is whatsapp-primary. This list exists to make the PRIMARY-CTA RENDER PATH
# judgeable — one business per `primary_contact_method`, so all 7 values of
# schemas._ALLOWED_CONTACT_METHODS (schemas.py:159-167) plus the missing-field
# edge case render on a live staging page. Different purpose, different
# teardown blast radius, so a separate constant rather than a widened one.
#
# What made this necessary (measured, not assumed): MEH-1706 chunk B (PR #2931,
# bc660e9f) filled the flagship's channel FIELDS — facebook, external_order_form,
# contact_email — but left `primary_contact_method="whatsapp"` on it
# (seed_demo_business.py, same commit). Filling the field is not selecting the
# channel: getPrimaryMethod (frontend/lib/contact-method.js:25-28) reads only
# `primary_contact_method`, so 6 of the 7 CTA states had still never rendered
# anywhere. This list is the perpendicular axis to MEH-1706, not a duplicate.
#
# Extra keys these rows may carry (all optional; the DEMO_BUSINESSES rows above
# omit every one of them and therefore keep their historical behaviour byte for
# byte — `whatsapp`, no products):
#   primary_contact_method  — defaults to "whatsapp" when absent
#   website / instagram / contact_email / facebook / external_order_form
#                           — the backing field the chosen method reads
#   products                — list of (name, description, price_min, price_max)
#
# Category note: mapped to EXISTING seed_data.CATEGORIES rows only — no
# CategoryRequest, no new category (scope constraint). Where no exact archetype
# row exists the nearest existing one is used and named in the comment.
#
# Naming note: every name below is checked against TEST_NAME_PATTERNS so a later
# `--reset` cannot sweep these rows. In particular no name contains "תסס",
# "חוות הגליל", "מאפיית המחמצת" or "גבינות הר הגולן".
# ============================================================================
ARCHETYPE_BUSINESSES = [
    # 1/8 — baseline + regression: the ONLY whatsapp-primary row here, so a
    # change that breaks the historical path fails beside the seven new ones.
    {
        "slug": "sdot-zahav",
        "name": "מאפיית שדות זהב",
        "contact_name": "אורית ברנע",
        "category": "לחמים ואפייה",
        "city": "קריית גת",
        "address": "שדרות לכיש 18, קריית גת",
        "lat": 31.6100,
        "lng": 34.7642,
        "phone": "050-0000020",
        "primary_contact_method": "whatsapp",
        "short_description": "כיכרות מחמצת וחלות קלועות, נאפות מדי בוקר בתנור אבן.",
        "description": (
            "בית עסק משפחתי בקריית גת שאופה בקצב של פעם. אנחנו טוחנות את "
            "הקמח אצל טוחן מקומי, מתפיחות את המחמצת לילה שלם ואופות בתנור "
            "אבן שנבנה כאן בחצר. אין אצלנו משפרי אפייה ואין קיצורי דרך — "
            "רק קמח, מים, מלח וזמן. הכיכרות יוצאות מהתנור בבוקר ומגיעות "
            "אליכן באותו יום, עדיין חמימות."
        ),
        "kosher": "כשר",
        "kashrut": "rabanut_mekomit",
        "verified": True,
        "review_stars": [5, 5, 4, 5, 5, 4],
        "image": None,
        "products": [
            ("כיכר מחמצת כפרית", "מחמצת בת 48 שעות, קרום פריך ולב רך.", 28, 32),
            ("חלה קלועה לשבת", "בצק חמאה עשיר, נקלעת ביד בכל יום חמישי.", 24, 24),
            ("לחם שיפון מלא", "שיפון מלא עם גרעיני חמניות, נשמר ימים.", 30, 34),
        ],
    },
    # 2/8 — phone-primary. tel: href; the dashboard-only channels below cannot
    # be produced from the register form at all (routers/auth.py), which is why
    # seeding is the only way these states get a live page.
    {
        "slug": "machlevet-ramat-yotam",
        "name": "מחלבת רמת יותם",
        "contact_name": "שירה מלכה",
        "category": "חלב וגבינות",
        "city": "יקנעם עילית",
        "address": "האורנים 7, יקנעם עילית",
        "lat": 32.6578,
        "lng": 35.1103,
        "phone": "050-0000021",
        "primary_contact_method": "phone",
        "short_description": "גבינות כבשים מיושנות במרתף, בסבב עונתי קטן.",
        "description": (
            "מחלבה קטנה על הרכס מעל יקנעם. אנחנו חולבות עדר כבשים אחד, "
            "מייצרות במנות קטנות ומיישנות במרתף אבן טבעי. הגבינות משתנות "
            "עם העונה ועם המרעה, ולכן אף סבב אינו זהה לקודמו. אפשר להתקשר "
            "ולשמוע מה יש השבוע לפני שמזמינות."
        ),
        "kosher": "כשר",
        "kashrut": "badatz",
        "verified": True,
        "review_stars": [5, 4, 5, 5, 5],
        "image": None,
        "products": [
            ("קשקבל כבשים מיושן", "מיושן ארבעה חודשים, טעם אגוזי עמוק.", 65, 78),
            ("לבנה בשמן זית", "לבנה עזה בצנצנת, עם זעתר ושמן מקומי.", 38, 38),
        ],
    },
    # 3/8 — website-primary. The only method that gets utm_source=mehamakor
    # appended (PrimaryContactButton.jsx:80 via withReferralParams, MEH-1525).
    {
        "slug": "yekev-karmei-alona",
        "name": "יקב כרמי אלונה",
        "contact_name": "אלונה גפני",
        "category": "יין, בירה ומשקאות",
        "city": "זכרון יעקב",
        "address": "הנדיב 44, זכרון יעקב",
        "lat": 32.5714,
        "lng": 34.9531,
        "phone": "050-0000022",
        "primary_contact_method": "website",
        "website": "https://karmei-alona.example.co.il",
        "short_description": "יין בוטיק מכרם יחיד, בציר קטן ומלא סבלנות.",
        "description": (
            "יקב בוטיק על מדרון זכרון יעקב. אנחנו בוצרות ביד מכרם יחיד, "
            "מתססות בחביות עץ קטנות ומשחררות רק אחרי שנה וחצי במרתף. "
            "הכמות מוגבלת לכמה מאות בקבוקים בשנה, וכל בציר מקבל תווית "
            "משלו. ההזמנות נסגרות באתר, וגם ביקור בטעימות נקבע דרכו."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": True,
        "review_stars": [5, 5, 5, 4],
        "image": None,
        "products": [
            ("קברנה סוביניון בציר קטן", "18 חודשים בחבית אלון צרפתי.", 120, 145),
            ("רוזה קיץ", "בציר מוקדם, חמצמץ ונקי, מוגש צונן.", 72, 72),
        ],
    },
    # 4/8 — instagram-primary. Href built by lib/social-links.instagramUrl,
    # which strips the leading "@" (MEH-2174) — the handle is stored WITH it
    # here on purpose so that stripping is exercised on a live page.
    {
        "slug": "kaveret-or-habosmat",
        "name": "כוורת אור הבשמת",
        "contact_name": "תמר אלדד",
        "category": "דבש",
        "city": "מבשרת ציון",
        "address": "הראל 9, מבשרת ציון",
        "lat": 31.7986,
        "lng": 35.1489,
        "phone": "050-0000023",
        "primary_contact_method": "instagram",
        "instagram": "@or_habosmat",
        "short_description": "דבש כוורת לפי פריחה, נרעף קר ולא מסונן דק.",
        "description": (
            "בית עסק קטן של כוורנית אחת בהרי ירושלים. אנחנו מעבירות את "
            "הכוורות אחרי הפריחה — שיטה, אקליפטוס, פרי הדר — וכל רעיפה "
            "נשארת נפרדת, כך שהצנצנת מספרת מאיזה שדה היא באה. הדבש נרעף "
            "קר ואינו עובר סינון דק, ולכן הוא מתגבש בחורף. זה סימן טוב."
        ),
        "kosher": "כשר",
        "kashrut": "rabanut_mekomit",
        "verified": True,
        "review_stars": [5, 5, 5, 5, 4, 5],
        "image": None,
        "products": [
            ("דבש פריחת הדר", "רעיפה של אביב, בהיר ופרחוני.", 42, 46),
            ("דבש אקליפטוס", "כהה ועמוק, מרקם סמיך.", 44, 48),
            ("חלת דבש בצנצנת", "חלה שלמה בתוך הדבש שלה.", 58, 58),
        ],
    },
    # 5/8 — email-primary. mailto: href, and the page that proves the MEH-2154
    # contract: zero wa.me links in the question chips when WA is not primary.
    {
        "slug": "beit-habad-sivan",
        "name": "בית הבד של סיוון",
        "contact_name": "סיוון נחום",
        "category": "שמנים",
        "city": "כפר תבור",
        "address": "דרך העמק 21, כפר תבור",
        "lat": 32.6875,
        "lng": 35.4053,
        "phone": "050-0000024",
        "primary_contact_method": "email",
        "contact_email": "sivan@beit-habad-sivan.example.co.il",
        "short_description": "שמן זית כתית מעולה, נסחט קר בתוך שש שעות.",
        "description": (
            "בית בד משפחתי לרגלי התבור. אנחנו מוסקות ביד ומביאות את "
            "הזיתים לסחיטה קרה באותו יום — לרוב תוך שש שעות — כי כל שעה "
            "שעוברת נשמעת אחר כך בטעם. השמן נשמר במיכלי נירוסטה אטומים "
            "ומחולק לבקבוקים רק לפי הזמנה, כדי שיגיע אליכן טרי."
        ),
        "kosher": "כשר",
        "kashrut": "badatz",
        "verified": True,
        "review_stars": [5, 4, 5, 5],
        "image": None,
        "products": [
            ("שמן זית כתית מעולה", "סחיטה קרה, חריפות עדינה ומאוזנת.", 68, 92),
            ("שמן זית מוקדם", "מסיק מוקדם, ירוק ועשבי במיוחד.", 88, 110),
        ],
    },
    # 6/8 — external_order-primary. No register-form field exists for this
    # (dashboard only), so this row is the only way the state reaches a page.
    # Category: nearest existing row — there is no "קייטרינג" in CATEGORIES.
    {
        "slug": "shulchan-aroch-catering",
        "name": "שולחן ארוך קייטרינג",
        "contact_name": "מיכל אדרי",
        "category": "מוצרים מוכנים",
        "city": "הוד השרון",
        "address": "הבנים 30, הוד השרון",
        "lat": 32.1500,
        "lng": 34.8853,
        "phone": "050-0000025",
        "primary_contact_method": "external_order",
        "external_order_form": "https://forms.example.com/shulchan-aroch",
        "short_description": "מגשי אירוח ביתיים לשבת ולאירועים קטנים.",
        "description": (
            "בית עסק שמבשל לאירועים קטנים ולשולחן שבת. אנחנו עובדות עם "
            "תפריט קצר שמתחלף כל שבוע לפי מה שיש בשוק, ומכינות הכול ביום "
            "האירוע עצמו. ההזמנה נסגרת בטופס, עם מספר הסועדות והתאריך, "
            "ואנחנו חוזרות עם הצעה מותאמת. יש מנות לצמחוניות בכל תפריט."
        ),
        "kosher": "כשר",
        "kashrut": "rabanut_mekomit",
        "verified": True,
        "review_stars": [5, 5, 4, 5, 5, 5, 4],
        "image": None,
        "products": [
            ("מגש אירוח לשבת", "שישה סלטים, שתי מנות עיקריות ולחם.", 320, 420),
            ("מגש מאפים מלוחים", "בורקס גבינה, סמבוסק ופשטידות קטנות.", 180, 220),
        ],
    },
    # 7/8 — facebook-primary. Second dashboard-only channel, same reason as 6.
    {
        "slug": "arugot-noam",
        "name": "חוות ערוגות נועם",
        "contact_name": "נועם ברקת",
        "category": "ירקות",
        "city": "נהלל",
        "address": "משק 42, נהלל",
        "lat": 32.6906,
        "lng": 35.1969,
        "phone": "050-0000026",
        "primary_contact_method": "facebook",
        "facebook": "https://www.facebook.com/arugot.noam.demo",
        "short_description": "ארגזי ירקות עונתיים, נקטפים יום לפני החלוקה.",
        "description": (
            "חווה קטנה בעמק שמגדלת ירקות עונתיים בלבד. אנחנו קוטפות יום "
            "לפני החלוקה ומרכיבות ארגז לפי מה שהבשיל באמת באותו שבוע — "
            "ולכן התכולה משתנה ואי אפשר להזמין פריט קבוע מראש. מי שרוצה "
            "לראות מה נכנס לארגז השבוע, אנחנו מעלות תמונות בכל יום שני."
        ),
        "kosher": None,
        "kashrut": None,
        "verified": False,
        "review_stars": [4, 5, 4],
        "image": None,
        "products": [
            ("ארגז ירקות שבועי", "תכולה עונתית משתנה, לשתיים עד ארבע נפשות.", 95, 95),
            ("צרור עשבי תיבול", "פטרוזיליה, כוסברה ושמיר, נקטפים בבוקר.", 18, 18),
        ],
    },
    # 8/8 — EDGE: phone-primary with NO phone. getPrimaryContactHref returns
    # null for method "phone" when producer.phone is falsy
    # (contact-method.js:50-53), and PrimaryContactButton.jsx:72 does
    # `if (!rawHref) return null` — so the CTA must be ABSENT, not a dead
    # `tel:` link. This row is the live fixture for that rule; the smoke spec
    # asserts no dead tel: href renders anywhere on the page.
    {
        "slug": "maadaniyat-ben-shemen",
        "name": "מעדניית בן שמן",
        "contact_name": "רונית כספי",
        "category": "בשר",
        "city": "רמלה",
        "address": "הרצל 55, רמלה",
        "lat": 31.9288,
        "lng": 34.8667,
        "phone": None,  # EDGE — deliberately absent; see the comment above.
        "primary_contact_method": "phone",
        "short_description": "נקניקים מיובשים באוויר, בסבבים קטנים.",
        "description": (
            "מעדנייה קטנה שמייבשת נקניקים באוויר, בלי מאיצים ובלי צבעי "
            "מאכל. אנחנו עובדות עם בשר מרעה מחווה אחת ומייבשות בחדר "
            "בקרה במשך שבועות, לפי סוג הנקניק. כל סבב יוצא במספר מוגבל "
            "של יחידות, ומה שנגמר חוזר רק בסבב הבא."
        ),
        "kosher": "כשר",
        "kashrut": "badatz",
        "verified": True,
        "review_stars": [5, 4, 5],
        "image": None,
        "products": [
            ("נקניק מיובש קלאסי", "ייבוש אוויר של חמישה שבועות.", 78, 92),
            ("נקניק חריף", "פלפל חריף גרוס ופפריקה מעושנת.", 82, 96),
        ],
    },
]


def _assert_not_production() -> None:
    """Refuse to run against anything that is not localhost or Railway staging.

    Mirrors seed_demo_business._assert_not_production (MEH-1074): local DB host
    is always allowed (dev/CI/tests); a remote host is allowed only when
    RAILWAY_ENVIRONMENT == "staging". Production ("production") aborts.
    """
    host = (engine.url.host or "").lower()
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
    # role=="producer" only — an admin who happened to register a test business
    # to their own account must not be swept (their producer_id just goes NULL).
    owner_filter = (User.producer_id.in_(ids), User.role == "producer")
    owner_count = db.query(User).filter(*owner_filter).count() if ids else 0

    print("── RESET ─────────────────────────────────────────────")
    if not producers:
        print("  No matching TEST producers found — nothing to delete.")
    else:
        print(
            f"  {'WOULD delete' if not confirm else 'Deleting'} "
            f"{len(producers)} producer(s):"
        )
        for p in producers:
            print(f"    · {p.name}  (slug={p.slug}, id={p.id})")
        print(
            f"  + {review_count} review(s), {owner_count} owner user(s), "
            "and all products / favorites / delivery areas / recipes / "
            "kashrut requests / events (cascade)."
        )

    if not confirm:
        print("  [dry-run] pass --confirm to execute the deletes above.")
        return

    if ids:
        db.query(Event).filter(Event.producer_id.in_(ids)).delete(
            synchronize_session=False
        )
        for user in db.query(User).filter(*owner_filter).all():
            db.delete(user)  # ORM delete keeps the identity map consistent
        for prod in producers:
            db.delete(prod)  # cascade: products/reviews/favorites/areas/recipes
        db.commit()
        print(
            f"  Deleted {len(producers)} producer(s), {review_count} review(s), "
            f"{owner_count} owner user(s)."
        )


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
            # MEH-2172: cap the stored original, exactly as every real upload
            # endpoint already does (`routers/upload.py:134`). Unsplash serves
            # full-resolution originals — one demo hero landed at 5886x3924 /
            # 2.43MB (Cloudinary ticket #383070) for a slot that never renders
            # above 1200px. `crop: "limit"` only ever shrinks: a source already
            # narrower than 1200 is stored untouched, so this cannot upscale.
            transformation=[{"width": 1200, "crop": "limit"}],
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
        # MEH-2189: name the channel + its backing field in the dry-run line, so
        # `--reset` (no --confirm) is readable evidence of the channel matrix
        # rather than a list that looks identical for all eight rows.
        method = biz.get("primary_contact_method", "whatsapp")
        backing = {
            "website": "website",
            "instagram": "instagram",
            "email": "contact_email",
            "facebook": "facebook",
            "external_order": "external_order_form",
            "phone": "phone",
            "whatsapp": "phone",
        }[method]
        filled = "SET" if biz.get(backing) else "NULL"
        nprod = len(biz.get("products", []))
        return (
            f"  · {biz['name']} [{biz['category']}] — {img}, "
            f"{reviews_count} reviews (avg {avg or '—'}), {kosher}, "
            f"cta={method} ({backing}={filled}), {nprod} products"
        ), True  # would-insert (this slug does not yet exist)

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
        # MEH-2189: the channel is now per-fixture. `.get` with the historical
        # literal as the default is deliberate — every DEMO_BUSINESSES row above
        # omits this key, so all ten keep the exact value this line used to
        # hardcode. Only the ARCHETYPE_BUSINESSES rows set it.
        primary_contact_method=biz.get("primary_contact_method", "whatsapp"),
        # The backing field each non-whatsapp method reads
        # (frontend/lib/contact-method.js:35-81). Absent key -> None, which is
        # what these columns already were for every pre-MEH-2189 demo row.
        website=biz.get("website"),
        instagram=biz.get("instagram"),
        contact_email=biz.get("contact_email"),
        facebook=biz.get("facebook"),
        external_order_form=biz.get("external_order_form"),
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
    # MEH-2056 (MEH-1938 chunk 2): the eight ARCHETYPE_BUSINESSES rows this
    # inserted on 01/09 had coordinates and no producer_locations row — 8 of
    # the 13 gap rows Sapir measured on staging on 02/09. Same helper the
    # registration / admin / import writers use (it reads the flushed
    # instance, so the row mirrors these columns by construction). A
    # coordinate-less fixture gets no row, which is the helper's contract.
    # REUSES: backend/app/services/producer_import.py:397
    create_primary_branch_location(db, producer)
    db.add(ProducerCategory(producer_id=producer.id, category_id=category.id))

    # MEH-2189: 2-3 products per archetype row so the catalog section on the
    # public page is not empty. DEMO_BUSINESSES rows carry no "products" key and
    # therefore still seed none — unchanged behaviour, not an oversight: those
    # rows exist to exercise the CARD, which reads no product.
    for pname, pdesc, pmin, pmax in biz.get("products", []):
        db.add(
            Product(
                producer_id=producer.id,
                name=pname,
                description=pdesc,
                price_min=pmin,
                price_max=pmax,
            )
        )

    # Idempotency guard: the reviewer emails are deterministic per slug. If this
    # producer was deleted externally but its display-only reviewer consumers
    # survived, re-creating them would hit the users.email UNIQUE constraint.
    # Clear exactly this business's reviewer rows first (bulk delete — their
    # ProducerReviews are already gone with the deleted producer). Scoped to the
    # `demo-{slug}-rev*` emails, so seed_demo_business's demo-* users are safe.
    reviewer_emails = [
        f"demo-{biz['slug']}-rev{i}@example.com" for i in range(len(stars))
    ]
    if reviewer_emails:
        db.query(User).filter(User.email.in_(reviewer_emails)).delete(
            synchronize_session=False
        )

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
    """Seed both packs. Counts are DERIVED from the lists, never stated — a
    literal goes stale the moment a fixture is added (testing.md § "the artifact
    that asserts coverage is the one least likely to be checked")."""
    verb = "Inserted" if confirm else "WOULD insert"
    total_new = 0
    for label, pack in (
        ("SEED", DEMO_BUSINESSES),
        ("SEED · ארכיטיפ×ערוץ (MEH-2189)", ARCHETYPE_BUSINESSES),
    ):
        print(f"── {label} ──────────────────────────────────────")
        new_count = 0
        for biz in pack:
            line, is_new = _seed_one(db, biz, confirm)
            print(line)
            if is_new:
                new_count += 1
        skipped = len(pack) - new_count
        tail = f" ({skipped} already exist, skipped)" if skipped else ""
        print(f"  {verb} {new_count} of {len(pack)} business(es){tail}.")
        total_new += new_count
    print(f"  TOTAL {verb.lower()}: {total_new} business(es).")
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
