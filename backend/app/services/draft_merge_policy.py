"""
Module:   draft_merge_policy
Purpose:  What survives when an admin-prepared draft is moved to the owner who
          registered the same business herself (MEH-3865): column by column of
          `producers`, and table by table of every child table. Sapir's rule
          (25/11): what only the owner knows is hers; the admin's prose stays.
Touches:  producers (the draft row, in the session), every table with a FK to
          producers.id (bulk UPDATE / DELETE, synchronize_session=False — the
          caller expires the session after).
Does NOT: lock, check or refuse anything, commit, or delete her row
          (routers/admin_draft_merge.py does all of that). Whatever loses is
          either parked on her row (it is deleted with it, images included) or
          deleted here.
Related:  routers/admin_draft_merge.py merge_draft_into_owner (the caller) ·
          routers/admin.py admin_delete_producer (what her row's delete
          destroys) · tests/test_meh3865_draft_twin_merge.py TestPolicyCoverage
          (every column and every child table is classified here).
History:  MEH-3865 (creation; split out of the router after the rule-5a review
          found columns and child tables that died silently with her row).
"""

from typing import Any
from uuid import UUID

from sqlalchemy import delete, update
from sqlalchemy.orm import Session

from app.database import Base
from app.limits import MAX_GALLERY_IMAGES
from app.models import DeliveryArea, Producer, ProducerLocation, Product
from app.services.business_name_key import name_key
from app.services.producer_duplicates import phone_key

# --- producers columns ---------------------------------------------------------

# Hers replaces the draft's whenever she has a value: how to reach her, where
# she is, what she declared, how her account stands (Sapir 25/11).
OWNER_WINS = (
    "name",
    "contact_name",
    "city",
    "address",
    "lat",
    "lng",
    "phone",
    "secondary_phone",
    "secondary_phone_label",
    "primary_contact_method",
    "instagram",
    "website",
    "whatsapp_group",
    "contact_email",
    "facebook",
    "external_order_form",
    "established_year",
    "price_range",
    "plan",
    "google_place_id",
    "kosher",
    "kashrut_badges",
    "kashrut_verified_at",
    "kashrut_expires_at",
    "producer_license_number",
    "license_expires_at",
    "referral_source",
    "referral_source_other",
    "grass_fed",
    "reservist_owned",
    "organic_certified",
    "vegan_scope",
    "vegetarian_scope",
    "gluten_free_facility",
    "lactose_free_facility",
    "payment_info",
    "order_window",
    "special_hours",
    "custom_questions",
    "coverage_cta_enabled",
    "weekly_summary_opt_out",
    "weekly_summary_sent_at",
    "is_available_today",
    "availability_status",
    "availability_state",
    "availability_confirmed_at",
    "vacation_until",
    "last_active_at",
    "last_confirmed_at",
    "freshness_email_sent_at",
    "declared_at",
    "declaration_version",
    "farmer_declared_at",
    "farmer_declaration_version",
    "verified_at",
    "verification_doc_type",
    # Her review history and the emails she already got: carried, so she is
    # neither re-nudged nor reset to a first submission.
    "requested_changes",
    "changes_requested_at",
    "resubmission_count",
    "resubmitted_at",
    "rejection_reason",
    "rejection_reason_code",
    "risk_score",
    "risk_reasoning",
    "email_followup_2_sent_at",
    "email_followup_3_sent_at",
    "email_followup_4_sent_at",
    "email_followup_5_sent_at",
    "email_pending_nudge_sent_at",
)
# The admin's prose stays; hers fills only a blank.
FILL_IF_BLANK = ("description", "short_description", "owner_bio", "opening_hours")
# Delivery settings go with the delivery areas: all hers, or all the draft's.
DELIVERY_COLUMNS = (
    "has_delivery",
    "offers_delivery",
    "delivery_nationwide",
    "delivery_cities",
    "delivery_excluded_cities",
    "delivery_zones",
    "delivery_days_min",
    "delivery_days_max",
    "delivery_min_order",
    "delivery_fee",
    "free_delivery_above",
)
# MEH-3977: her store list wins when she wrote one; an empty list never wipes
# the draft's. Not in DELIVERY_COLUMNS: her_delivery reads delivery areas, and
# a partner-only owner has none (review: her stores were silently dropped).
PARTNER_STORES_IF_HERS = ("partner_stores",)
# Pickup settings go with the pickup points (producer_locations).
PICKUP_COLUMNS = (
    "has_physical_location",
    "by_arrangement",
    "pickup_points",
)  # MEH-2447: goes with the place
# Cloudinary URLs: hers wins, the losing one is parked on her row and destroyed
# with it (admin_delete_producer reads logo_url, owner_photo_url and images).
IMAGE_OWNER_WINS = ("logo_url", "owner_photo_url")
# Set by _merge_images / _copy_fields / the router, not by a rule above.
SPECIAL = ("images", "phone_verified", "status", "submitted_for_review_at")
# The draft's own: identity, the admin's curation, the claim / invite trail,
# counters that are recomputed. Her values die with her row.
DRAFT_KEEPS = (
    "id",
    "slug",
    "kind",
    "is_test",
    "created_at",
    "updated_at",
    "is_recommended",
    "recommended_at",
    "recommended_note",
    "in_season_until",
    "story_card_url",
    "admin_notes",
    "ambassador",
    "top_product_name",
    "top_product_id",
    "product_groups",
    "avg_rating",
    "reviews_count",
    "claim_link_sent_at",
    "owner_invite_email",
    "owner_invite_name",
    "owner_invite_token_hash",
    "owner_invite_expires_at",
    "owner_invite_sent_at",
    "owner_invite_accepted_at",
    "owner_invite_consent_note",
    "consent_screenshot_url",
    "owner_invite_created_by",
    "owner_invite_code_hash",
    "owner_invite_code_expires_at",
    "owner_invite_code_attempts",
)

# --- child tables (FK to producers.id) -----------------------------------------

# Moved by name below, with their own rule.
HANDLED_TABLES = frozenset(
    {"products", "producer_locations", "delivery_areas", "users", "producer_categories"}
)
# Hers are added to the draft's.
APPEND_TABLES = frozenset(
    {
        "events",
        "group_buys",
        "producer_recipes",
        "kashrut_badge_requests",
        "producer_name_change_requests",
        "category_requests",
        "billable_events",
    }
)
# Hers replace the draft's when she has any (one per business, or keyed by the
# business in a unique constraint). For a never-public page most are empty.
REPLACE_TABLES = frozenset(
    {
        "producer_offers",
        "rescue_typical_items",
        "producer_staff",
        "producer_order_settings",
        "producer_order_windows",
        "business_billing",
        "producer_review_checks",
        "product_orders",
        "product_order_repeats",
        "producer_reviews",
        "favorites",
        "favorite_alerts",
        "reports",
        "delivery_waitlist",
        "alert_log",
        "producer_analytics_daily",
        "producer_page_views",
        "producer_contact_clicks",
        "producer_whatsapp_clicks",
    }
)
# Die with her row on purpose: a code sent to her old row, the tombstone
# admin_delete_producer writes for her never-public slug, and the short
# preview/claim links minted for her old row (MEH-3896; CASCADE).
LEFT_TABLES = frozenset({"phone_otp_tokens", "retired_slugs", "share_links"})


def producer_child_tables() -> dict[str, Any]:
    """Every table with a FK to producers.id → its producer_id column."""
    out: dict[str, Any] = {}
    for table in Base.metadata.sorted_tables:
        for fk in table.foreign_keys:
            if fk.column.table.name == "producers":
                out[table.name] = fk.parent
    return out


def _blank(value: Any) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def _merge_images(draft: Producer, target: Producer) -> None:
    for name in IMAGE_OWNER_WINS:
        if not _blank(getattr(target, name)):
            hers, ours = getattr(target, name), getattr(draft, name)
            setattr(draft, name, hers)
            setattr(target, name, None if ours == hers else ours)
    # Gallery: hers first, then the admin's, no repeats, within the cap. What
    # does not fit stays on her row and is destroyed with it.
    theirs: list[str] = list(target.images or [])
    admins: list[str] = list(draft.images or [])
    combined = theirs + [u for u in admins if u not in theirs]
    keep = combined[:MAX_GALLERY_IMAGES]
    draft.images = keep  # type: ignore[assignment]
    target.images = [u for u in combined if u not in keep]  # type: ignore[assignment]


def _copy_group(draft: Producer, target: Producer, names: tuple[str, ...]) -> None:
    for name in names:
        setattr(draft, name, getattr(target, name))


def copy_fields(
    draft: Producer, target: Producer, *, her_delivery: bool, her_pickup: bool
) -> None:
    for name in OWNER_WINS:
        if not _blank(getattr(target, name)):
            setattr(draft, name, getattr(target, name))
    for name in FILL_IF_BLANK:
        if _blank(getattr(draft, name)) and not _blank(getattr(target, name)):
            setattr(draft, name, getattr(target, name))
    draft_physical = draft.has_physical_location
    if her_delivery:
        _copy_group(draft, target, DELIVERY_COLUMNS)
    if her_pickup:
        _copy_group(draft, target, PICKUP_COLUMNS)
    for name in PARTNER_STORES_IF_HERS:
        if getattr(target, name):
            setattr(draft, name, getattr(target, name))
    # MEH-3977: the two groups move independently, so her «no place» can land
    # beside the draft's «no delivery» with no store either — CHECK
    # producer_location_mode would 500 the merge. Keep the draft's place then.
    if not (draft.has_physical_location or draft.offers_delivery or draft.partner_stores):
        draft.has_physical_location = draft_physical
    # Verified by code only if the number the page now shows is hers, verified.
    if not _blank(target.phone):
        draft.phone_verified = bool(  # type: ignore[assignment]
            target.phone_verified
            and phone_key(draft.phone) is not None  # type: ignore[arg-type]
            and phone_key(draft.phone) == phone_key(target.phone)  # type: ignore[arg-type]
        )
    _merge_images(draft, target)
    # Categories: both sets — a missing category hides the page from a filter.
    draft.categories = list(
        {c.id: c for c in [*draft.categories, *target.categories]}.values()
    )


def her_delivery(db: Session, target: Producer) -> bool:
    """She set delivery up: areas of her own, or nationwide (needs no area).

    A flag with no area and no nationwide is half a setup: the draft's stays.
    """
    has_rows = db.query(DeliveryArea.id).filter(DeliveryArea.producer_id == target.id)
    return bool(target.delivery_nationwide or has_rows.first())


def her_pickup(db: Session, target: Producer) -> bool:
    """She has pickup points of her own (a flag alone does not wipe the draft's)."""
    has_rows = db.query(ProducerLocation.id).filter(
        ProducerLocation.producer_id == target.id
    )
    return has_rows.first() is not None


def duplicate_draft_products(
    db: Session, draft: Producer, target: Producer
) -> list[UUID]:
    """The draft's products that she also added (same name): hers win (Sapir 25/11)."""
    hers = {
        name_key(n)
        for (n,) in db.query(Product.name).filter(Product.producer_id == target.id)
    }
    hers.discard("")
    return [
        pid
        for pid, n in db.query(Product.id, Product.name).filter(
            Product.producer_id == draft.id
        )
        if name_key(n) in hers
    ]


def _repoint(db: Session, col: Any, src: UUID, dst: UUID) -> None:
    db.execute(update(col.table).where(col == src).values({col.name: dst}))


def _replace(
    db: Session, col: Any, draft_id: UUID, target_id: UUID, force: bool = False
) -> None:
    """Her rows replace the draft's: when she has any, or when `force`."""
    hers = db.execute(col.table.select().where(col == target_id).limit(1)).first()
    if not (hers or force):
        return
    db.execute(delete(col.table).where(col == draft_id))
    _repoint(db, col, target_id, draft_id)


def _move_products(db: Session, draft: Producer, target: Producer) -> int:
    dupes = duplicate_draft_products(db, draft, target)
    hers = [i for (i,) in db.query(Product.id).filter(Product.producer_id == target.id)]
    if dupes:
        # Parked on her row: admin_delete_producer deletes them and their images.
        db.query(Product).filter(Product.id.in_(dupes)).update(
            {"producer_id": target.id}, synchronize_session=False
        )
        if draft.top_product_id in dupes:
            draft.top_product_id = None  # type: ignore[assignment]
            draft.top_product_name = None  # type: ignore[assignment]
    if not hers:
        return 0
    return int(
        db.query(Product)
        .filter(Product.id.in_(hers))
        # Her groups were the other page's (producers.product_groups).
        .update({"producer_id": draft.id, "group_id": None}, synchronize_session=False)
    )


def move_rows(
    db: Session, draft: Producer, target: Producer, *, delivery: bool, pickup: bool
) -> int:
    """Re-point her child rows to the draft. Returns the products moved."""
    moved = _move_products(db, draft, target)
    d_id, t_id = draft.id, target.id
    if delivery:
        _replace(db, DeliveryArea.producer_id, d_id, t_id, force=True)  # type: ignore[arg-type]
    if pickup:
        _replace(db, ProducerLocation.producer_id, d_id, t_id, force=True)  # type: ignore[arg-type]
    for name, col in producer_child_tables().items():
        if name in APPEND_TABLES:
            _repoint(db, col, t_id, d_id)  # type: ignore[arg-type]
        elif name in REPLACE_TABLES:
            _replace(db, col, d_id, t_id)  # type: ignore[arg-type]
    return moved
