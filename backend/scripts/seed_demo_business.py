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
from datetime import date, datetime, time, timedelta, timezone
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
    KashrutBadgeRequest,
    ProducerAnalyticsDaily,
    ProducerOffer,
    ProducerPageView,
    ProducerReview,
    ProducerWhatsAppClick,
    RescueOffer,
    User,
)
from app.routers.rescue import RESERVE_CLOSES_BEFORE_END  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.services.analytics_rollup import rollup_watermark  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.services.rescue_emails import israel_hhmm  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.utils.clock import ISRAEL_TZ, israel_today, utc_now  # noqa: E402  # imports must follow sys.path.insert (script shim)

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
    # MEH-1706 §2 item 5 — all seven contact channels (MEH-296). Before this,
    # only `instagram` was seeded, so the multi-channel routing UI had exactly
    # one row to render on the flagship business and every other branch of it
    # was unreachable on staging.
    "website": "https://ruach-hasadeh.example.co.il",
    "facebook": "https://www.facebook.com/ruach.hasadeh.demo",
    "external_order_form": "https://forms.example.com/ruach-hasadeh-order",
    "whatsapp_group": "https://chat.whatsapp.com/DemoRuachHasadeh0000",
    "contact_email": "hello@ruach-hasadeh.example.co.il",
    "primary_contact_method": "whatsapp",
    # MEH-1706 §2 item 6 — MEH-1490's Google rating row is live-fetch and
    # data-gated on this column, so with it NULL the row is silent on the
    # flagship. Syntactically valid placeholder: real Place IDs are opaque
    # `ChIJ`-prefixed strings, and nothing here calls the Google API.
    "google_place_id": "ChIJDemoRuachHasadeh0000000000",
    # MEH-1706 §2 item 7 — OwnerCard (MEH-1335). `owner_bio` caps at 300 chars
    # at the app layer; this is well under.
    "owner_bio": (
        "נועה לביא, דור שני למאפייה. למדה אפייה בצרפת, חזרה לזכרון יעקב "
        "ופתחה מאפייה קטנה שבה כל לחם עולה לתנור באותו בוקר שבו הוא נמכר."
    ),
    "owner_photo_url": (
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-owner"
    ),
    # MEH-1706 §2 item 3 — order_window (MEH-1543 column, MEH-1869 value shape).
    # CANONICAL shape is a LIST of ranges per day (schemas.py:87-118); the legacy
    # single-dict form is still accepted on write but every new row writes the
    # list. Friday carries two ranges so the multi-range branch is exercised,
    # not just the single-range one. Days ascending, non-overlapping, <= 3.
    "order_window": {
        "sunday": [{"open": "07:00", "close": "14:00"}],
        "monday": [{"open": "07:00", "close": "14:00"}],
        "tuesday": [{"open": "07:00", "close": "14:00"}],
        "wednesday": [{"open": "07:00", "close": "14:00"}],
        "thursday": [{"open": "07:00", "close": "14:00"}],
        "friday": [
            {"open": "06:30", "close": "10:00"},
            {"open": "11:00", "close": "13:00"},
        ],
    },
    # MEH-1706 §2 item 4 — the badge array. The verified/expiry timestamps are
    # relative and therefore set on the Producer(...) call, not here.
    "kashrut_badges": ["badatz"],
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

# MEH-2797: CANONICAL city names only. Two reasons, and the second is the one
# that actually changed behaviour:
#
#  1. `DeliveryArea.@validates("city")` (models.py:1179) already rewrote
#     «בנימינה» to «בנימינה-גבעת עדה» on insert, so the short form here was
#     never what got stored — a reader of this constant was being told
#     something untrue about the fixture.
#  2. `delivery_cities` on Producer below is derived from this same list and
#     has NO such validator (it is the MEH-903 dual-write column), so the
#     short name DID land there verbatim.
DEMO_DELIVERY_AREAS = [
    {"city": "זכרון יעקב", "min_order": 60, "delivery_day": "שלישי"},
    {"city": "בנימינה-גבעת עדה", "min_order": 80, "delivery_day": "שלישי"},
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

# MEH-1657: this used to seed a bread-baking WORKSHOP as an Event — a sign-up
# activity published on the one-time surface, i.e. the exact confusion the
# locked axis resolves, hard-coded into the demo. It is now a genuine one-time
# event: free and uncapped, which is what makes it read as "drop in on the day"
# rather than "book a seat".
# MEH-1918: three approved, upcoming experiences. THREE is not decorative —
# the nav link is gated at EXPERIENCES_NAV_THRESHOLD (3), so a seed with two
# would leave the gate untestable on staging in its most interesting state.
# Hosted by the demo owner, whose business is approved, because the public
# feed walks host → user → producer.status (MEH-1749).
# GUARD — STAGING ONLY, same as every other row in this file.
DEMO_EXPERIENCES = [
    {
        "title": "סדנת מחמצת לתחילת הדרך",
        "description": (
            "שלוש שעות עם הידיים בבצק: איך מתחילים סטארטר, איך יודעים "
            "שהוא מוכן, ואיך אופים כיכר אחת טובה בתנור ביתי רגיל. כל "
            "משתתפת חוזרת הביתה עם סטארטר משלה ועם כיכר."
        ),
        "days_ahead": 12,
        "event_time": "17:00",
        "duration_minutes": 180,
        "category": "בישול",
        "max_participants": 8,
        "price_per_person": 220,
    },
    {
        "title": "ערב חלות — קליעה ובצק מתוק",
        "description": (
            "ערב אחד לפני שבת, שתי שיטות קליעה, ובצק מתוק שאפשר לשחזר "
            "במטבח הביתי. מתאים גם למי שלא לשה מימיה."
        ),
        "days_ahead": 19,
        "event_time": "18:30",
        "duration_minutes": 150,
        "category": "אפייה",
        "max_participants": 12,
        "price_per_person": 180,
    },
    {
        "title": "בוקר כוסמין — לחם מלא בלי פשרות",
        "description": (
            "מה ההבדל בין כוסמין לחיטה, למה בצק כוסמין מתנהג אחרת, ואיך "
            "לא להרוס אותו בלישה. בוקר אחד, שתי כיכרות, וקפה."
        ),
        "days_ahead": 26,
        "event_time": "09:00",
        "duration_minutes": 120,
        "category": "אפייה",
        "max_participants": 10,
        "price_per_person": 160,
    },
]

# MEH-1706 §2 item 2 — the moderation queue. The three DEMO_EXPERIENCES above
# are all status="approved" ON PURPOSE (MEH-1918: GET /experiences filters on
# approved+APPROVED+future+active, and the nav threshold needs them), so the
# non-approved states get their own rows rather than reusing those.
#
# Hosted by the DEMO CONSUMER, per the ticket. That user is NOT in
# _delete_existing's email set, so unlike the owner-hosted rows these do not
# cascade away on --refresh — they are torn down explicitly there. Without that
# they would survive and duplicate on every re-run.
DEMO_MODERATION_EXPERIENCES = [
    {
        "title": "סדנת לחם לילדות — ממתינה לאישור",
        "description": (
            "שעה וחצי של לישה, גלגול ואפייה לילדות מגיל שש. כל אחת חוזרת "
            "עם לחמנייה משלה. הסדנה ממתינה לאישור צוות מהמקור."
        ),
        "days_ahead": 33,
        "status": "pending",
        "moderation_status": "PENDING",
    },
    {
        "title": "ערב פיצות בטאבון — נדרשים תיקונים",
        "description": (
            "ערב פיצות בטאבון החצר. הוגש עם פרטי מיקום חסרים, והמנחה "
            "התבקשה להשלים אותם לפני פרסום."
        ),
        "days_ahead": 40,
        "status": "changes_requested",
        "moderation_status": "REJECTED",
    },
]

# MEH-1706 §2 item 1 — group buy. `deadline` is relative (§2.3 idiom), and
# min_participants sits BELOW the seeded commit count so the funded path is
# reachable on the demo rather than permanently short of its threshold.
DEMO_GROUP_BUY = {
    "title": "רכישה קבוצתית: שק קמח כוסמין מלא",
    "description": (
        "שק קמח כוסמין מלא מטחינת אבן, ישירות מהטחנה. מתחלקות בשק ומוזילות "
        "את המחיר לקילו. איסוף מהמאפייה בזכרון יעקב."
    ),
    "product_name": "קמח כוסמין מלא, טחינת אבן",
    "unit": 'ק"ג',
    "price_per_unit_regular": 18,
    "price_per_unit_group": 13,
    "min_participants": 2,
    "max_participants": 20,
    "days_ahead": 14,
    "fulfillment_note": "איסוף מהמאפייה, יום ה' שאחרי סגירת הקבוצה, 08:00-13:00.",
}

# Two commits, so the count (2) meets min_participants (2) and the funded path
# is live. Both reuse EXISTING seeded users — the ticket forbids new emails, and
# the UNIQUE (group_buy_id, user_id) constraint makes a duplicate a hard error
# rather than a silent no-op.
DEMO_GROUP_BUY_COMMIT_QUANTITIES = [2, 3]

# MEH-1706 §2 item 4 — the approved badge request that carries the certificate
# image. MEH-1672 shipped "tap the badge to see the certificate" with ZERO
# cert_url anywhere in the seed, so the feature merged invisible (§2.1).
DEMO_KASHRUT_REQUEST = {
    "badge_code": "badatz",
    "cert_url": (
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-kashrut-cert"
    ),
    "status": "approved",
    "notes": "אושר אוטומטית בזריעת הדמו (MEH-1706). תעודה לדוגמה, לא מסמך אמיתי.",
}

DEMO_EVENT = {
    "title": "יום פתוח במאפייה — בוקר מחמצת",
    "description": (
        "פותחות את דלתות המאפייה לבוקר אחד: הצצה לתנור, טעימות מכל "
        "הכיכרות שיוצאות באותו יום, וקפה על חשבון הבית. בלי הרשמה — "
        "פשוט לבוא."
    ),
    "days_ahead": 21,  # event_date = seed-run date + N days (stays future)
    "event_time": "09:30",
    "location": "המאפייה, רחוב המייסדים 12",
    "category": "אחר",
    "price": 0,
    "max_participants": None,
    # Open house at the bakery → reuse the hero (basket of assorted breads).
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

# ---------------------------------------------------------------------------
# MEH-2794 — the marketing-screenshot fixtures. Everything below exists so the
# /join page can be photographed from ONE complete business rather than from a
# designed promo video, and so a dashboard shot does not read "0 WhatsApp
# clicks" on a page whose whole job is to persuade.
#
# WHY THESE TABLES ARE SEEDED AT ALL, given that
# `backend/scripts/check_seed_coverage.py` lists every one of them under
# EXEMPT_TABLES: that file's exemptions mean "it is OK for this table to be
# EMPTY" — `_empty_surfaces()` only ever reads SEEDED_SURFACES, so a row here
# cannot red the gate. Four of its exemption REASONS do go stale with this
# change, `producer_analytics_daily`'s most sharply ("seeding it would
# fabricate traffic" — which is now exactly what happens, for one demo
# producer, on Sapir's instruction in MEH-2794). That file is outside this
# card's declared scope, so it is NOT edited here: tracked as MEH-2800, which
# names both files and the choice to be made (enforce them in
# SEEDED_SURFACES, or just reword). workflow.md's Smell #2 asks for exactly
# that — a ticket naming both surfaces, not a note promising a future edit.
# ---------------------------------------------------------------------------

# An active first-order discount. `starts_at=None` means "active now"
# (models.py:1281); `expires_at` is required and must stay in the future, so it
# is relative to the run date like every other demo date.
# `offer_type` MUST be one of the five the CHECK allows — 'free_delivery_above',
# 'gift_above', 'first_order', 'pickup_discount', 'custom' (models.py:1378).
# The ticket asks for "a first-order discount", which is 'first_order'.
#
# `headline` stays None deliberately. Only 'custom' renders its headline as the
# offer text; every other type renders a TYPED SENTENCE and ignores it
# (schemas.py:1512-1516, OfferBadge.jsx). A headline here would be dead data
# that reads, to the next person, as the string on screen.
#
# Both threshold fields are None together, which is what
# `producer_offer_threshold_pair` requires — an unconditional offer.
DEMO_OFFER = {
    "offer_type": "first_order",
    "threshold_value": None,
    "threshold_unit": None,
    "headline": None,
    "days_ahead": 30,
}

# One rescue bag for TODAY, so /rescue has a card to photograph. NOTE it hangs
# off producer_location_id, NOT producer_id (models.py:2871) — a bag belongs to
# the place it is collected from.
# Every value here sits inside a DB CHECK, and none of it can be exercised from
# the CC sandbox, so the envelope is written down rather than assumed:
#   qty_total   1..20   (RESCUE_MAX_QTY_PER_OFFER, models.py:2859)
#   qty_left    0..qty_total
#   price_agorot >= 0
#   pickup_end  > pickup_start
#   qty_donated 0..qty_total  (defaults to 0, not set here)
#   status      'active' | 'cancelled'  (defaults to 'active', not set here)
DEMO_RESCUE_BAG = {
    "qty_total": 6,
    "qty_left": 4,
    "price_agorot": 2500,
    "value_min_agorot": 5000,
    "value_max_agorot": 7000,
    # MEH-2808 — the pickup window is DERIVED from the seed's own clock, never
    # fixed. A fixed 18:00-19:00 produced a bag the public listing hides
    # whenever the seed ran after ~18:45, because `/rescue` filters
    # `pickup_end > utc_now() + RESERVE_CLOSES_BEFORE_END` (rescue.py:463, 15
    # minutes at :106) — and the (location, date) idempotency key then stopped a
    # re-run from replacing it, so there was no way back until the next day.
    #
    # Sapir's rule, 07/11: if now + LEAD_HOURS_END is still before
    # EVENING_CUTOFF_HOUR, open the window now + LEAD_HOURS_START and close it
    # now + LEAD_HOURS_END; otherwise put it on tomorrow evening.
    "lead_hours_start": 1,
    "lead_hours_end": 3,
    "evening_cutoff_hour": 20,
    "tomorrow_from_hour": 17,
    "tomorrow_to_hour": 19,
}

# Modest, mutually consistent numbers — Sapir 07/11: «מספרים צנועים וסבירים»,
# and «כל המסכים מראים את אותו בית עסק ואת אותם מספרים». Spread over a 30-day
# window so the insights line chart has a shape instead of one spike.
#
# The three raw tables and the roll-up MUST agree, because the dashboard reads
# the windowed arms from the raw rows and the `total` arm through the roll-up
# (producer_me.py's `windowed(..., rollup_col=...)`). Seeding only one side
# would make the owner's "total" disagree with her own 30-day chart — the exact
# inflation MEH-160 removed. `_seed_insights` derives the roll-up FROM the rows
# it just inserted rather than from these constants, so they cannot drift.
DEMO_INSIGHTS = {
    "days": 30,
    "views_total": 180,
    "views_from_search": 64,  # a subset of views_total, not an addition
    "whatsapp_clicks": 20,
    "contact_clicks": 6,
    "favorites": 9,
    # Where the views come from. First entry is the business's own city, so the
    # "top cities" panel is not dominated by somewhere it does not serve.
    "top_cities": ["זכרון יעקב", "בנימינה-גבעת עדה", "חיפה"],
}

# MEH-2794 — display-only follower accounts, so `favorites` (= the follower
# count since MEH-1364) can show more than one. 1-indexed in the address.
DEMO_FOLLOWER_EMAIL_TEMPLATE = "demo-follower-{}@example.com"

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
# MEH-1938 follow-up (Sapir, 02/09): `is_primary` is False, and that is the
# CORRECT state for this producer rather than a gap. She is delivery-only
# (has_physical_location=False, the owner's explicit MEH-213 declaration) and
# her single row is a pickup point. A primary answers "where is the business";
# flagging this pickup would tell a visitor the business is in Binyamina,
# which is false. Promotion is branch-only now, and she has no branch by
# design — so no primary, no pin, no navigation target, and the pickup shows
# in the secondary layer where it belongs.
#
# This row was `is_primary: True` and was the ONE row the pre-follow-up count
# found on staging (prod: 0). It was a seed defect, not owner data.
DELIVERY_ONLY_LOCATION = {
    "kind": "pickup",
    "label": "איסוף — מרכז בנימינה",
    "city": "בנימינה",
    "lat": 32.5190,
    "lng": 34.9530,
    "is_primary": False,
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

# MEH-1706 §2 item 9 — the two availability states the demo never exercised.
# Every seeded producer was `accepting_orders`, so the "full this week" and
# "on vacation" branches of the card, the header and the detail page had no row
# to render anywhere on staging. `vacation_until` is relative (§2.3 idiom) —
# hardcoding it means the vacation silently ends and the surface goes dark again.
AVAILABILITY_DEMOS = [
    {
        "slug": "demo-availability-full",
        "name": "מאפיית שבוע עמוס (דמו)",
        "contact_name": "דנה עמוס",
        "short_description": "בית עסק לדוגמה שסימן שהשבוע מלא — לבדיקת מצב הזמינות.",
        "availability_state": "full_this_week",
        "vacation_days_ahead": None,
    },
    {
        "slug": "demo-availability-vacation",
        "name": "מאפיית חופשה (דמו)",
        "contact_name": "יעל חופש",
        "short_description": "בית עסק לדוגמה שנמצא בחופשה — לבדיקת מצב הזמינות.",
        "availability_state": "on_vacation",
        "vacation_days_ahead": 18,
    },
]


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
        # MEH-1706: group buys need an EXPLICIT delete. `GroupBuy` reaches
        # Producer through a plain `backref`, whose default cascade is
        # save-update/merge — NOT delete — so db.delete(producer) leaves the ORM
        # unaware of them and only the DB's ON DELETE CASCADE reaps the rows.
        # Deleting them here keeps the session identity map clean, exactly as
        # the Event and ProducerLocation deletes above do. The commits go with
        # them via cascade="all, delete-orphan" on GroupBuy.commits.
        for gb in db.query(GroupBuy).filter(GroupBuy.producer_id == producer.id).all():
            db.delete(gb)
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
    # MEH-1706: the availability-state demos, same contract as the dietary ones.
    for avail in (
        db.query(Producer)
        .filter(Producer.slug.in_([a["slug"] for a in AVAILABILITY_DEMOS]))
        .all()
    ):
        db.delete(avail)
    # MEH-1706: the CONSUMER-hosted moderation experiences. The owner-hosted
    # ones cascade away when the owner user is deleted below
    # (Experience.host_user_id is ON DELETE CASCADE), but the demo consumer is
    # deliberately NOT in the delete set — so without this, a --refresh leaves
    # them behind and the next run inserts a second copy of each.
    consumer = db.query(User).filter(User.email == DEMO_CONSUMER_EMAIL).first()
    if consumer:
        db.query(Experience).filter(Experience.host_user_id == consumer.id).delete()
    # MEH-1528: DEMO_ADMIN_EMAIL joins the owner in the delete set (both are
    # recreated by seed_demo_business); the display reviewers stay by convention.
    # MEH-2794: the display-only follower accounts join the delete set. Their
    # `favorites` rows cascade with the producer, but the users themselves
    # would otherwise accumulate across --refresh runs.
    emails = (
        [r["email"] for r in DEMO_REVIEWS]
        + [DEMO_OWNER_EMAIL, DEMO_ADMIN_EMAIL]
        + [
            DEMO_FOLLOWER_EMAIL_TEMPLATE.format(i + 1)
            for i in range(DEMO_INSIGHTS["favorites"])
        ]
    )
    # ORM-level deletes (not bulk .delete()) keep the session's identity map
    # consistent — a bulk delete here leaves stale review objects that emit a
    # spurious 0-rows-matched DELETE at the re-seed commit.
    for user in db.query(User).filter(User.email.in_(emails)).all():
        db.delete(user)
    db.commit()


def _seed_kashrut_request(db, producer) -> None:
    """MEH-1706 §2 item 4 — the approved badge request carrying the certificate.

    MEH-1672 shipped "tap the badge to see the certificate" with ZERO `cert_url`
    anywhere in the seed, so the feature merged and was invisible on staging
    (§2.1). No teardown is needed in `_delete_existing`: `kashrut_requests` uses
    `passive_deletes=True` and defers to the DB's ON DELETE CASCADE, so deleting
    the producer removes this row.
    """
    db.add(
        KashrutBadgeRequest(
            producer_id=producer.id,
            reviewed_by=None,
            **DEMO_KASHRUT_REQUEST,
        )
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


def _israel_wall_to_utc(day: date, hour: int) -> datetime:
    """An Israel wall-clock hour on `day`, as the NAIVE UTC instant the column holds.

    MEH-2679 is the incident this exists to avoid repeating: `rescue_offers`'
    `pickup_start` / `pickup_end` / `cancel_until` are naive `DateTime`
    columns, and the convention across this codebase is that naive means UTC
    (`utc_now()` writes naive UTC everywhere else in this file). Writing
    `datetime.combine(israel_today(), time(18))` would store 18:00 as if it
    were UTC — i.e. 20:00 or 21:00 in Israel, depending on the season — so a
    bag advertised for 18:00 would open two hours late on the page.

    Converting first and dropping the tzinfo keeps the stored value a real
    instant, and keeps the Israel wall time the one a reader of the constants
    expects.
    """
    local = datetime.combine(day, time(hour=hour), tzinfo=ISRAEL_TZ)
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def _to_naive_utc(aware: datetime) -> datetime:
    """An aware datetime as the naive UTC instant the column stores.

    `RescueOffer.pickup_start` / `pickup_end` / `cancel_until` are naive
    `DateTime` columns holding UTC instants (the MEH-2679 class), so an Israel
    wall-clock time has to be converted, not merely stripped of its tzinfo.
    Stripping would store 18:00 as 18:00Z — 20:00 or 21:00 Israel — which is
    the bug the #4114 reviewer caught in the first version of these times.
    """
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def _demo_pickup_window(now_utc: datetime) -> tuple[date, datetime, datetime]:
    """`(israel day, pickup_start, pickup_end)` for the demo bag, from `now`.

    Pure arithmetic on an injected `now`, so the tests can pin both sides of
    the cutoff with a frozen clock instead of passing only at the hour the
    suite happens to run (`.claude/rules/testing.md`).

    The cutoff is compared as a DATETIME, not as a time-of-day: `now + 3h` at
    23:00 Israel is 02:00 the next day, whose *time* is before 20:00 while the
    moment plainly is not, and a time-only comparison would open a window in
    the small hours and call it this evening.

    Known shape, flagged rather than changed: the rule is literal `now + 1h`
    and `now + 3h`, so a seed at 10:17 produces 11:17-13:17 rather than a
    rounded hour, and a seed at 00:30 produces 01:30-03:30 — odd for a bakery
    but visible, which is what the window is for. Rounding or an early-morning
    floor would be a change to Sapir's rule, not an implementation detail.
    """
    now_il = now_utc.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ)
    cutoff_il = datetime.combine(
        now_il.date(),
        time(hour=DEMO_RESCUE_BAG["evening_cutoff_hour"]),
        tzinfo=ISRAEL_TZ,
    )
    end_il = now_il + timedelta(hours=DEMO_RESCUE_BAG["lead_hours_end"])
    if end_il < cutoff_il:
        start_il = now_il + timedelta(hours=DEMO_RESCUE_BAG["lead_hours_start"])
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
    existing = (
        db.query(RescueOffer)
        .filter(
            RescueOffer.producer_location_id == location.id,
            RescueOffer.date == day,
        )
        .first()
    )
    if existing is not None:
        if existing.pickup_end > now + RESERVE_CLOSES_BEFORE_END:
            return False
        print(
            f"Replacing the demo rescue bag for {day}: its window closed at "
            f"{israel_hhmm(existing.pickup_end)} Israel time."
        )
        db.delete(existing)
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
                category="אפייה",
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


def seed_availability_demos(db) -> int:
    """MEH-1706 §2 item 9 — the `full_this_week` / `on_vacation` producers.

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
            # MEH-1706: same contract as the dietary demos — idempotent
            # per-slug, so it runs even when the main business already existed.
            seed_availability_demos(db)
            # MEH-2794: same contract again — the /join screenshot fixtures
            # (offer, rescue bag, insight numbers), added only if missing.
            seed_marketing_fixtures(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
