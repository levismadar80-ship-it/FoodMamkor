"""
Module:   limits
Purpose:  The one place that says how much of each thing a business (or a
          request) may hold. Every per-business cap, every request-list cap,
          and the Hebrew sentence an owner sees when she reaches one.
Touches:  DB (count queries only, through `enforce_cap` callers).
Does NOT: rate limiting — that is per-route `@limiter.limit` (app/rate_limit.py).
          A rate limit bounds how FAST rows arrive; a cap here bounds how MANY
          can exist. Both are needed: 60 products/hour is 1,440 a day.
Related:  tests/test_meh3022_resource_caps.py — three guards that fail when a
          new write route has no rate limit, a new request list has no
          max_length, or a new business-owned table has no cap here.
History:  MEH-3022 (creation, after MEH-3021 found products had no cap at all).

Numbers are calibrated against what large platforms allow (research in
MEH-3022): Etsy 20 photos per listing, Google Business Profile ~10 edits a
minute per profile, Instagram 25 posts a day per account. Each cap sits far
above anything a real local food business needs and far below what a script
can produce, which is what OWASP API4:2023 ("Unrestricted Resource
Consumption") asks for.

DO NOT lower a cap without checking live data first — a business already above
a new cap can no longer save its own form.
"""

from fastapi import HTTPException

# --- Per-business caps (rows a business may own) -----------------------------

MAX_PRODUCTS = 100
MAX_RECIPES = 50
MAX_LOCATIONS = 20
MAX_UPCOMING_EVENTS = 30
MAX_UPCOMING_EXPERIENCES = 30
MAX_OPEN_GROUP_BUYS = 30

# --- Request-list caps ---------------------------------------------------------

MAX_GALLERY_IMAGES = 20
MAX_DELIVERY_CITIES = 300
# Safety ceiling for lists whose real, friendlier cap lives in a validator
# (category_ids ≤ 3, custom_questions ≤ 5) or that only an admin sends. Set
# ABOVE the validator's cap on purpose: pydantic checks max_length before an
# after-validator runs, so a ceiling equal to the cap would replace the
# validator's Hebrew sentence with pydantic's English one.
MAX_SMALL_LIST = 20
MAX_TAG_LIST = 50
# Admin-only request lists (checklist rows, review-check ids).
MAX_ADMIN_LIST = 200

# Sentences approved by Sapir 13/11/2026 («אותו מבנה גם לשאר הסוגים»).
_CAP_DETAIL = {
    "products": f"אפשר להוסיף עד {MAX_PRODUCTS} מוצרים. כדי להוסיף מוצר חדש, צריך קודם למחוק אחד קיים.",
    "recipes": f"אפשר להוסיף עד {MAX_RECIPES} מתכונים. כדי להוסיף מתכון חדש, צריך קודם למחוק אחד קיים.",
    "locations": f"אפשר להוסיף עד {MAX_LOCATIONS} כתובות. כדי להוסיף כתובת חדשה, צריך קודם למחוק אחת קיימת.",
    "events": f"אפשר להוסיף עד {MAX_UPCOMING_EVENTS} אירועים עתידיים. כדי להוסיף אירוע חדש, צריך קודם למחוק אחד קיים.",
    "experiences": f"אפשר להוסיף עד {MAX_UPCOMING_EXPERIENCES} חוויות עתידיות. כדי להוסיף חוויה חדשה, צריך קודם למחוק אחת קיימת.",
    "group_buys": f"אפשר להוסיף עד {MAX_OPEN_GROUP_BUYS} קבוצות רכישה פתוחות. כדי להוסיף קבוצה חדשה, צריך קודם לסגור אחת קיימת.",
}

GALLERY_IMAGES_DETAIL = f"אפשר להוסיף עד {MAX_GALLERY_IMAGES} תמונות. כדי להוסיף תמונה חדשה, צריך קודם למחוק אחת קיימת."
DELIVERY_CITIES_DETAIL = f"אפשר להוסיף עד {MAX_DELIVERY_CITIES} ערי משלוח. כדי להוסיף עיר חדשה, צריך קודם להסיר אחת קיימת."


def enforce_cap(current_count: int, kind: str) -> None:
    """Raise 409 when a business already holds the maximum of `kind`.

    `current_count` is the count BEFORE the insert, so `>=` is the boundary:
    at MAX_PRODUCTS rows the next create is refused.
    """
    cap = CAPS[kind]
    if current_count >= cap:
        raise HTTPException(status_code=409, detail=_CAP_DETAIL[kind])


CAPS = {
    "products": MAX_PRODUCTS,
    "recipes": MAX_RECIPES,
    "locations": MAX_LOCATIONS,
    "events": MAX_UPCOMING_EVENTS,
    "experiences": MAX_UPCOMING_EXPERIENCES,
    "group_buys": MAX_OPEN_GROUP_BUYS,
}


def cap_list(value, cap: int, detail: str):
    """mode="before" validator body: refuse an over-long list in Hebrew before
    pydantic's own max_length check answers in English."""
    if value is not None and isinstance(value, list | tuple) and len(value) > cap:
        raise ValueError(detail)
    return value


# --- Registries the MEH-3022 guards read ---------------------------------------

# Every table with a FK to producers.id is either capped (row count bounded
# per business) or listed with the reason it cannot grow without bound.
OWNED_TABLE_CAPS = {
    "products": "products",
    "producer_recipes": "recipes",
    "producer_locations": "locations",
    "events": "events",
    "group_buys": "group_buys",
}

OWNED_TABLE_EXEMPT = {
    "delivery_areas": "written only as the delivery_areas list on ProducerUpdate, capped by MAX_DELIVERY_CITIES",
    "producer_categories": "written only from category_ids, capped at 3 by _cap_categories_validator",
    "rescue_typical_items": "one row per business (PUT replaces it)",
    "producer_offers": "history rows: each save deactivates the old offer and inserts one (producer_me.py ~190), so growth is bounded by the PUT /producers/me rate limit",
    "producer_name_change_requests": "409 while one is pending (producer_name_requests.py)",
    "kashrut_badge_requests": "409 while one is pending per badge (producer_me.py)",
    "producer_review_checks": "admin-only checklist rows, bounded by the checklist item count",
    "retired_slugs": "one row per rename; renames go through the pending name-change request",
    "users": "the owner's own account row(s)",
    "producer_reviews": "one review per user per business (upsert in reviews.py ~495), rate-limited",
    "favorites": "one row per user per business (existing-row check in favorites.py ~85), rate-limited",
    "favorite_alerts": "one row per favorite",
    "category_requests": "rate-limited public form, admin-moderated",
    "reports": "rate-limited public form, admin-moderated",
    "delivery_waitlist": "one row per email per business, rate-limited public form",
    "phone_otp_tokens": "rate-limited OTP send, short-lived rows",
    "alert_log": "system-written fan-out log, capped per send by MEH-1338",
    "producer_analytics_daily": "one row per business per day, system-written",
    "producer_page_views": "system-written analytics, rate-limited beacon",
    "producer_contact_clicks": "system-written analytics, rate-limited beacon",
    "producer_whatsapp_clicks": "system-written analytics, rate-limited beacon",
}

# Write routes allowed to run without a per-route rate limit, with the reason.
RATE_LIMIT_EXEMPT_PREFIXES = {
    "/admin/": "role-gated to admins (require_admin); the only admins are the founder's accounts",
}
