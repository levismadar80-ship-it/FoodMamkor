"""Part 1 of 2 of `seed_demo_business.py` (MEH-3542 mechanical split).

Moved verbatim, dependencies first: this module imports only from the
parts before it. `seed_demo_business.py` re-exports every name, so callers and
tests keep using that module.
"""

import os
import sys
from datetime import date, datetime, time, timezone

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from app.models import Producer, ProducerLocation  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.models.models import (
    Event,
    Experience,
    GroupBuy,
    KashrutBadgeRequest,
    RescueOffer,
    User,
)  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.routers.rescue import RESERVE_CLOSES_BEFORE_END  # noqa: E402  # imports must follow sys.path.insert (script shim)
from app.utils.clock import ISRAEL_TZ  # noqa: E402  # imports must follow sys.path.insert (script shim)

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
    # MEH-2794 (19/11): mehamakor/demo/ruach-hasadeh-owner was never uploaded
    # (staging /_next/image → 404, while ruach-hasadeh-hero → 200), so the owner
    # card showed a broken image. It reuses the hero, which exists; the seed
    # coverage contract (check_seed_coverage.py "owner_card/photo") needs a
    # value here. Safe against cleanup: producer_me.py:981 destroys only URLs
    # that leave BOTH images[] and the owner photo, and the hero stays in
    # images[]. DO NOT point this at an asset nobody uploaded.
    "owner_photo_url": (
        "https://res.cloudinary.com/dfzpscjks/image/upload/mehamakor/demo/ruach-hasadeh-hero"
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
# MEH-2847: every `category` here is a key of EXPERIENCE_CATEGORIES
# (schemas.py / lib/event-categories.js). The bread rows said «אפייה», which is
# in neither, so no chip on /experiences could find them; baking is «בישול»
# (labelled «בישול ואפייה»).
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
        "category": "בישול",
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
        "category": "בישול",
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
    "title": "קבוצת רכישה: שק קמח כוסמין מלא",
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
# cannot red the gate.
#
# Those exemption reasons say that these tables are seeded for the demo
# business and may still be empty elsewhere, which is why they stay exempt
# rather than living in SEEDED_SURFACES: a local or CI database with none of
# them is legitimate and must not fail the gate. `producer_analytics_daily`'s
# reason also carries the cost of getting it wrong — a row above the roll-up
# watermark strands every unrolled day beneath it, for every producer
# (MEH-2801). History: MEH-2800.
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

# MEH-1706 §2 item 9 — the availability state the demo never exercised.
# Every seeded producer was `accepting_orders`, so the "on vacation" branches
# of the card, the header and the detail page had no row to render anywhere on
# staging. `vacation_until` is relative (§2.3 idiom) —
# hardcoding it means the vacation silently ends and the surface goes dark again.
AVAILABILITY_DEMOS = [
    {
        "slug": "demo-availability-vacation",
        "name": "מאפיית חופשה (דמו)",
        "contact_name": "יעל חופש",
        "short_description": "בית עסק לדוגמה שנמצא בחופשה — לבדיקת מצב הזמינות.",
        "availability_state": "on_vacation",
        "vacation_days_ahead": 18,
    },
]
# MEH-2782: «עמוס השבוע» left the enum. Its demo row is no longer seeded but
# still sits on staging, so --refresh keeps deleting the old slug.
RETIRED_AVAILABILITY_DEMO_SLUGS = ["demo-availability-full"]


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
        .filter(
            Producer.slug.in_(
                [a["slug"] for a in AVAILABILITY_DEMOS]
                + RETIRED_AVAILABILITY_DEMO_SLUGS
            )
        )
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


def _israel_hhmm(naive_utc: datetime) -> str:
    """A naive-UTC instant as an Israel wall-clock HH:MM, for a log line.

    Local rather than imported from `app.services.rescue_emails` (MEH-2814):
    pulling the email service into a seed script to format one string drags its
    whole import graph along for no benefit.
    """
    return f"{naive_utc.replace(tzinfo=timezone.utc).astimezone(ISRAEL_TZ):%H:%M}"


def _to_naive_utc(aware: datetime) -> datetime:
    """An aware datetime as the naive UTC instant the column stores.

    `RescueOffer.pickup_start` / `pickup_end` / `cancel_until` are naive
    `DateTime` columns holding UTC instants (the MEH-2679 class), so an Israel
    wall-clock time has to be converted, not merely stripped of its tzinfo.
    Stripping would store 18:00 as 18:00Z — 20:00 or 21:00 Israel — which is
    the bug the #4114 reviewer caught in the first version of these times.
    """
    return aware.astimezone(timezone.utc).replace(tzinfo=None)


def _bag_still_open(now: datetime):
    """The SQL predicate for "this bag is one `/rescue` will still show".

    The same expression the public listing filters on (`rescue.py`), built from
    the router's own `RESERVE_CLOSES_BEFORE_END` rather than a copy of it, so
    the seed and the listing cannot disagree about what is visible.

    `pickup_end` is nullable=False (models.py), so this predicate and its
    negation are exact complements — no bag falls outside both.
    """
    return RescueOffer.pickup_end > now + RESERVE_CLOSES_BEFORE_END


def _stale_bags_query(db, location_id, now: datetime):
    """The bags at `location_id` that `/rescue` can no longer show.

    THE QUERY THE SWEEP ACTUALLY DELETES THROUGH, shared with its test rather
    than described to it. `test_the_stale_filter_selects_only_closed_bags`
    calls this function, so dropping `~_bag_still_open(now)` from here turns
    that test red — which a test re-typing the same filter could not do
    (reviewer on #4136, round 3).

    It carries its own `pickup_end` condition and is therefore safe to call in
    any order. The caller's live-bag guard is an early exit, not what makes
    this correct: a query that is safe only in context is a trap for whoever
    edits the context, which is the defect MEH-2816 fixes.
    """
    return db.query(RescueOffer).filter(
        RescueOffer.producer_location_id == location_id,
        ~_bag_still_open(now),
    )
