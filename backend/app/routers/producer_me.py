from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import and_, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.database import get_db
from app.rate_limit import limiter
from app.services.availability_validation import (
    AvailabilityValidationError,
    resolve_vacation_until,
    validate_transition,
)
from app.services.whatsapp import send_template
from app.services.whatsapp_templates import OtpCodeV1
from app.utils.clock import ISRAEL_TZ, israel_today
from app.models import (
    ContactClick,
    DeliveryArea,
    Favorite,
    HomeProduct,
    Producer,
    Product,
    ProducerLocation,
    ProducerOffer,
    ProducerPageView,
    ProducerWhatsAppClick,
    User,
)
import logging
import secrets
import string

from app.models.models import PhoneOtpToken, KashrutBadgeRequest
from app.schemas.schemas import (
    AVAILABILITY_STATES,
    AvailabilityStateUpdate,
    AvailabilityStatusUpdate,
    BioGenerateIn,
    KashrutRequestCreate,
    KashrutRequestOut,
    OtpConfirmIn,
    ProducerLocationCreate,
    ProducerLocationOwnerOut,
    ProducerLocationUpdate,
    ProducerOwnerOut,
    ProducerUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from app.services.auth_notifications import notify_admin_producer_review_ready
from app.services.delivery_validation import (
    ensure_exclusion_requires_nationwide,
    ensure_nationwide_requires_delivery,
)
from app.services.license_validation import (
    categories_require_license,
    ensure_license_for_categories,
)
from app.services.analytics import israel_day_of, unique_views_count
from app.services.trust_tier import VALID_BADGE_CODES

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerOwnerOut)
def get_my_producer(
    user: User = Depends(require_producer), db: Session = Depends(get_db)
):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
        )
        .filter(Producer.id == user.producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]):
    """Replace all delivery areas for this producer with the given city list."""
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        if city:
            db.add(DeliveryArea(producer_id=producer.id, city=city))


def _sync_delivery_areas(
    db: Session,
    producer: Producer,
    delivery_rows: list[dict] | None,
    delivery_cities: list[str] | None,
) -> list[str]:
    """MEH-1644: route the two delivery-area write shapes (structured rows
    take precedence over the flat city list) and return the newly-added
    cities for the MEH-54/MEH-1360 delivery_area alert — identical semantics
    on both paths."""
    if delivery_rows is None and delivery_cities is None:
        return []
    existing_cities = (
        {da.city for da in producer.delivery_areas}
        if producer.delivery_areas
        else set()
    )
    if delivery_rows is not None:
        _apply_delivery_rows(db, producer, delivery_rows)
        sent_cities = [(r.get("city") or "").strip() for r in delivery_rows]
    else:
        _apply_delivery_cities(db, producer, delivery_cities)
        sent_cities = delivery_cities
    return [c for c in sent_cities if c and c not in existing_cities]


def _apply_delivery_rows(db: Session, producer: Producer, rows: list[dict]):
    """MEH-1644: replace all delivery areas with structured rows
    (city · min_order · delivery_day · delivery_fee). Same delete+insert
    semantics as _apply_delivery_cities; delivery_day arrives
    whitelist-validated by DeliveryAreaCreate (DeliveryDayField — 422 outside
    the canonical vocabulary, None = "בתיאום מראש").

    MEH-1772: delivery_fee is the per-area override of producers.delivery_fee.
    `row.get("delivery_fee")` returns None both when the key is absent and when
    it is explicitly null, and both mean the same thing here — inherit — so the
    two cases do not need distinguishing. A 0 survives untouched (it is
    "משלוח חינם", not absence), which is why this reads the value rather than
    testing it for truthiness."""
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for row in rows:
        city = (row.get("city") or "").strip()
        if not city:
            continue
        db.add(
            DeliveryArea(
                producer_id=producer.id,
                city=city,
                min_order=row.get("min_order"),
                delivery_day=row.get("delivery_day"),
                delivery_fee=row.get("delivery_fee"),
            )
        )


def _sync_active_offer(db: Session, producer: Producer, offer: dict | None):
    """MEH-1823 chunk 2: write the owner's single offer.

    Called ONLY when the key was explicitly present in the body — the caller
    checks `model_fields_set`, because `exclude_unset` alone cannot distinguish
    "omitted" (leave the offer alone) from "explicit null" (deactivate it), and
    conflating those would silently wipe an offer on every unrelated PUT from
    the dashboard.

    Replace, never update: any currently-active row is flipped inactive and a
    new row is inserted. That keeps the unique partial index
    (`uq_producer_offers_active_per_producer`) satisfied without an UPSERT, and
    leaves the superseded offer in place as history rather than destroying it.

    # REUSES: backend/app/routers/producer_me.py:122 — _apply_delivery_rows
    #         (same owner-writes-child-rows shape, same delete-then-insert
    #         ordering inside the request's transaction).
    """
    active = (
        db.query(ProducerOffer)
        .filter(
            ProducerOffer.producer_id == producer.id,
            ProducerOffer.is_active.is_(True),
        )
        .all()
    )
    for row in active:
        row.is_active = False
    # Flush the deactivation before inserting, or the new row collides with the
    # old one on the unique partial index inside the same transaction.
    db.flush()
    if offer is None:
        return
    db.add(
        ProducerOffer(
            producer_id=producer.id,
            offer_type=offer["offer_type"],
            threshold_value=offer.get("threshold_value"),
            threshold_unit=offer.get("threshold_unit"),
            headline=offer.get("headline"),
            starts_at=offer.get("starts_at"),
            expires_at=offer["expires_at"],
            # Hardcoded, never read from the payload. `is_active` is not a
            # ProducerOfferCreate field (see its docstring): a caller-supplied
            # False here would deactivate the current offer and then insert a
            # row that was never active — a fourth state whose visible effect
            # is identical to `null`, and which accumulates dead rows because
            # uq_producer_offers_active_per_producer is partial (WHERE is_active)
            # and so does not constrain them. Reaching this line means the
            # caller sent an offer object, and an offer object means active.
            is_active=True,
        )
    )
    # MEH-1823: flush HERE so a collision on uq_producer_offers_active_per_producer
    # surfaces as a 409 instead of a 500 from an uncaught IntegrityError at commit.
    #
    # The race is real and was REPRODUCED, not theorised: two concurrent PUTs for
    # the same producer both SELECT the active rows before either writes, so the
    # second INSERT lands on a row the first committed after that SELECT. A
    # double-clicked save is enough.
    #
    # `.with_for_update()` on the SELECT above does NOT close it. When the
    # business has no offer yet there is no row to lock, so both requests lock
    # nothing and both insert — verified: the collision reproduces with and
    # without the lock in the no-existing-row case. The unique index is the only
    # thing that can arbitrate, so the fix is to let it, and translate its verdict.
    #
    # The invariant was never at risk — the index already guaranteed at most one
    # active offer. What changes here is the symptom: a clean 409 the dashboard
    # can act on, rather than a 500.
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="ההטבה עודכנה במקביל מחלון אחר. רעננו את הדף ונסו שוב.",
        ) from exc


def _enforce_owner_license_gate(db, producer, payload, category_ids):
    """MEH-999: grandfather rule — validate NEWLY-ADDED categories only, never
    the set the producer already holds. The MEH-530 full-set re-check bricked
    every edit for MEH-971 license-pending producers (licensed category +
    NULL license → 422 on any PUT). Same posture as the auth.py register
    bypass: NOT a security relaxation — licensed-only is enforced downstream
    by the admin approval guard and by publication requiring
    status=="approved"; a pending producer editing her bio publishes nothing.
    """
    effective_license = (
        payload.get("producer_license_number")
        if "producer_license_number" in payload
        else producer.producer_license_number
    )
    persisted_category_ids = {c.id for c in producer.categories}
    added_category_ids = (
        [cid for cid in category_ids if cid not in persisted_category_ids]
        if category_ids is not None
        else []
    )
    # Helper short-circuits on an empty list, so this only fires for adds.
    ensure_license_for_categories(db, added_category_ids, effective_license)

    # MEH-999 (2c): the one hole grandfathering would open — a LICENSED
    # producer blanking her license while keeping a license-required category.
    # Re-run the gate against the final category set with the cleared value.
    # Pending producers are unaffected: their license is already NULL, so
    # nothing is being cleared.
    license_cleared = (
        "producer_license_number" in payload
        and not (payload.get("producer_license_number") or "").strip()
        and (producer.producer_license_number or "").strip()
    )
    if license_cleared:
        final_category_ids = (
            category_ids if category_ids is not None else list(persisted_category_ids)
        )
        ensure_license_for_categories(db, final_category_ids, None)


# MEH-1351: approvability = the admin approve gate's definition, REUSED not
# reimplemented — ≥1 image (MEH-799) AND license present when the categories
# require one (MEH-971). Keep in sync with admin.py:approve_producer.
def _is_approvable(db, producer) -> bool:
    if not producer.images:
        return False
    category_ids = [c.id for c in producer.categories]
    license_missing = not (producer.producer_license_number or "").strip()
    return not (categories_require_license(db, category_ids) and license_missing)


def _pending_and_approvable(db, producer) -> bool:
    return producer.status == "pending" and _is_approvable(db, producer)


def _maybe_fire_review_ready(background_tasks, db, producer, was_approvable) -> None:
    """MEH-1351: review-ready ping on the false→true approvability transition
    of a pending producer (first image / license completed). Fire-and-forget
    BackgroundTask mirroring the resubmit ping's contract; the transition
    check (not a sent-flag) is the idempotency guard — no schema change."""
    if not was_approvable and _pending_and_approvable(db, producer):
        background_tasks.add_task(
            notify_admin_producer_review_ready, producer.name, producer.city
        )


@router.put("", response_model=ProducerOwnerOut)
@limiter.limit("30/hour")
def update_my_producer(
    request: Request,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-1351: snapshot approvability BEFORE mutation — the review-ready ping
    # fires only on the false→true transition of a pending producer (below).
    was_approvable = _pending_and_approvable(db, producer)

    _PRODUCER_WRITABLE_FIELDS = {
        "contact_name",
        "description",
        "short_description",
        "city",
        "lat",
        "lng",
        "phone",
        "instagram",
        "website",
        "whatsapp_group",
        "primary_contact_method",
        "contact_email",
        "facebook",
        "external_order_form",
        "top_product_name",
        "price_range",
        # MEH-1335: owner story fields (public OwnerCard data path). Validated
        # in ProducerUpdate (bio sanitize ≤300, photo image-URL guard).
        "owner_bio",
        "owner_photo_url",
        "grass_fed",
        "organic_certified",
        # MEH-1508 ch2: owner declares business-level dietary scope. Values are
        # enum-validated in ProducerUpdate (schemas.py); this opens the write path.
        "vegan_scope",
        "vegetarian_scope",
        "gluten_free_facility",
        "has_delivery",
        # MEH-1856 (dispositions from MEH-1851): `address`, `slug`,
        # `lactose_free_facility` and `pickup_points` were REMOVED from this set.
        # Each was writable here with no editor anywhere in the owner dashboard —
        # the API accepted a value no owner UI could produce. The columns stay,
        # and the admin (`admin.py`) + import (`producer_import.py`) write paths
        # are unchanged; only the owner PUT path is closed. Do not re-add one
        # without shipping its editor in the same PR:
        #   address              → superseded by ProducerLocation.address, which
        #                          the owner DOES edit (LocationsEditor.jsx)
        #   slug                 → owner edit silently breaks every shared /p/<slug>
        #                          link; needs a redirect story first
        #   lactose_free_facility→ its question was cut (DietaryScopeCard.jsx
        #                          "Does NOT: … touch lactose"); no reader exists
        #   pickup_points        → duplicates ProducerLocation.kind='pickup'
        # MEH-1851 (Sapir's 03/08 ruling, rows 1 · 19 · 39): three more owner
        # write paths closed for the same reason — the API accepted a value no
        # owner UI produces. Columns stay; admin (`admin.py`) and import
        # (`producer_import.py`) are untouched. Note MEH-1856's body deferred
        # these three as "EXPOSE, future ticket"; the 03/08 ruling supersedes
        # that and made all three REMOVE-WRITE. Do not re-add one without
        # shipping its editor in the same PR:
        #   name                 → a DNA-LOCK hole, not a missing feature: the
        #                          setattr loop below writes it with NO re-review,
        #                          so an APPROVED business could rename itself
        #                          into something else entirely through the raw
        #                          API. An editor with re-moderation is MEH-1872.
        #   starting_price_label → the owner edits `price_range` (PricingCard);
        #                          this second, older price string has no editor
        #                          and is what ProducerSections.jsx:206 actually
        #                          renders. MEH-1855 owns mirroring price_range
        #                          into it — deliberately NOT done here, so the
        #                          two PRs cannot collide in either merge order.
        #   is_available_today   → written by POST /producers/me/availability-state
        #                          (and the legacy /availability toggle), BOTH of
        #                          which mirror `availability_state`. This path
        #                          did not, so a raw PUT desynced the pair. The
        #                          column's removal is MEH-1854, not this.
        # MEH-1242 PR5: owner permission-surface extension — location mode +
        # opening hours (previously admin-only). delivery_area_cities is still
        # popped + processed separately below. The (has_physical_location OR
        # offers_delivery) and nationwide-XOR-cities invariants are enforced by
        # ProducerUpdate._validate_location_mode (schemas.py) + the DB CHECK
        # constraints (models.py) — this only opens the write path.
        "has_physical_location",
        "offers_delivery",
        "delivery_nationwide",
        # MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:") — guarded by
        # _ensure_exclusion_requires_nationwide + the DB CHECK.
        "delivery_excluded_cities",
        "opening_hours",
        # MEH-1543: owner-editable weekly order-acceptance window. Validated in
        # ProducerUpdate (day keys, HH:MM 24h, close>open). Explicit null in the
        # body clears it (present-but-None flows through model_dump(exclude_unset)
        # and setattr sets the column to NULL).
        "order_window",
        "kosher",
        # MEH-530: owner can edit her own license # via /producer/me PUT.
        "producer_license_number",
        "images",
        "custom_questions",
        # MEH-1541: owner sets her own founding year. Range-validated
        # (1800..current year) in ProducerUpdate (schemas.py); this opens
        # the write path.
        "established_year",
        # MEH-1577: owner states delivery cost + free-delivery threshold.
        # Validated in ProducerUpdate (both >= 0; free_delivery_above > 0;
        # delivery_fee 0 accepted = "משלוח חינם") — this only opens the write
        # path. Explicit null in the body clears either one (present-but-None
        # flows through model_dump(exclude_unset) and setattr writes NULL),
        # matching order_window above.
        "delivery_fee",
        "free_delivery_above",
    }
    payload = data.model_dump(exclude_unset=True)
    category_ids = payload.pop("category_ids", None)
    delivery_cities = payload.pop("delivery_area_cities", None)
    # MEH-1644: structured rows (city · min_order · delivery_day) from the
    # dashboard DeliveryCard. Takes precedence over the flat city list when
    # both are sent; absent (exclude_unset) → the flat path behaves as before.
    delivery_rows = payload.pop("delivery_areas", None)
    # MEH-1823 chunk 2: three-valued. `in payload` (post-exclude_unset) is the
    # ONLY way to tell "omitted" from "explicit null" — popping the value alone
    # collapses them, and that difference is whether an unrelated dashboard save
    # leaves the offer alone or deletes it.
    offer_sent = "active_offer" in payload
    offer_payload = payload.pop("active_offer", None)

    _enforce_owner_license_gate(db, producer, payload, category_ids)
    # MEH-1255: effective-state guard — excluded cities require nationwide.
    ensure_exclusion_requires_nationwide(producer, payload)
    # MEH-1879: same shape — nationwide delivery requires the delivery flag,
    # or the DB CHECK (MEH-1849) turns a partial update into a 500.
    ensure_nationwide_requires_delivery(producer, payload)

    # MEH-1856: the slug validate-and-deduplicate step that stood here is gone
    # along with `slug` itself (see _PRODUCER_WRITABLE_FIELDS). Leaving it would
    # have been worse than dead code: `_resolve_unique_slug` raises 400 on a
    # RESERVED_SLUGS value, so this endpoint would have kept REJECTING a slug it
    # no longer writes — `slug: "about"` → 400 while `slug: "anything"` → 200
    # and silently ignored. Slug uniqueness for the paths that do write it lives
    # in admin.py (:81, :148, :258) and producer_import.py (:59), untouched.

    # MEH-375: snapshot the gallery BEFORE mutation so we can diff old vs
    # new and clean up dropped URLs AFTER db.commit succeeds. Destroying
    # before commit would orphan-leak in the opposite direction (assets
    # gone, DB still references them) if commit raises.
    old_images = list(producer.images or [])

    for field, value in payload.items():
        if field in _PRODUCER_WRITABLE_FIELDS:
            setattr(producer, field, value)

    # Handle delivery areas (replaces existing rows like the admin endpoint).
    # MEH-1644: structured rows take precedence over the flat city list.
    new_cities = _sync_delivery_areas(db, producer, delivery_rows, delivery_cities)

    # MEH-1823 chunk 2: the owner's single offer (replace-or-deactivate).
    if offer_sent:
        _sync_active_offer(db, producer, offer_payload)

    # Handle category updates
    if category_ids is not None:
        from app.models.models import ProducerCategory

        db.query(ProducerCategory).filter(
            ProducerCategory.producer_id == producer.id
        ).delete()
        # MEH-1297: payload order = stored order (position 0 = primary).
        for pos, cid in enumerate(category_ids):
            db.add(
                ProducerCategory(producer_id=producer.id, category_id=cid, position=pos)
            )

    db.commit()
    db.refresh(producer)

    # MEH-375: best-effort destroy of Cloudinary assets the producer
    # dropped from the gallery, AFTER db.commit so a constraint failure
    # / deadlock leaves DB and Cloudinary in sync. Helper does the set
    # diff + dedup + per-URL fail-open destroy; failures log via
    # app.upload and the cleanup script catches misses on its next run.
    if "images" in payload:
        from app.cloudinary_utils import destroy_removed_images

        destroy_removed_images(
            old_images,
            producer.images or [],
            context="producer_me.update_my_producer images",
        )

    # MEH-54: fire delivery area alerts for newly added cities.
    # MEH-1360: targeted — only users whose User.city is among new_cities
    # receive it; fire_alerts fills "{cities}" per recipient with only THEIR
    # matched cities (a user in כרמיאל no longer hears about אילת).
    if new_cities:
        from app.routers.alerts import AlertContent, fire_alerts

        background_tasks.add_task(
            fire_alerts,
            db,
            producer.id,
            "delivery_area",
            AlertContent(
                title=f"🚚 משלוחים חדשים: {producer.name}",
                body="עכשיו מגיעים גם ל: {cities}",
                url=f"/producer/{producer.id}",
            ),
            new_cities,
        )

    _maybe_fire_review_ready(background_tasks, db, producer, was_approvable)

    return producer


# LEGACY(2026-09-01, MEH-1854)
# MEH-291 — dual-write helpers used during the 7-day overlap.
# Phase 4 (separate PR) drops the legacy is_available_today + availability_status
# columns and removes these helpers along with the legacy endpoints below.
# MEH-1857: that "7-day overlap" opened in May 2026 and the contract step never
# ran — ~14 months, which is why the expiry marker above now exists. MEH-1854
# owns the removal; scripts/legacy-expiry-check.sh fails once the date passes,
# so the next person either finishes it or extends the date in a reviewed PR.


def _state_to_legacy(state: str) -> tuple[bool, str]:
    """Map the new 4-value enum to the (is_available_today, availability_status)
    pair so old readers (ProducerCard, ProducerDetail, dashboard) stay accurate
    until the legacy columns are dropped."""
    return {
        "accepting_orders": (False, "available"),
        "available_today": (True, "available"),
        "full_this_week": (False, "full"),
        "on_vacation": (False, "vacation"),
    }[state]


def _legacy_to_state(
    is_available_today: bool | None, availability_status: str | None
) -> str:
    """Inverse mapping. Precedence matches the Phase 1 backfill CASE WHEN tree:
    vacation > full > is_available_today > default."""
    if availability_status == "vacation":
        return "on_vacation"
    if availability_status == "full":
        return "full_this_week"
    if is_available_today:
        return "available_today"
    return "accepting_orders"


@router.post("/availability")
@limiter.limit("20/hour")
def toggle_availability(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Toggle today's availability for the logged-in producer.

    Legacy endpoint — kept during MEH-291 7-day overlap. Mirrors the toggle to
    `availability_state` so consumers reading the new column stay consistent.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.is_available_today = not bool(producer.is_available_today)
    producer.availability_state = _legacy_to_state(
        producer.is_available_today, producer.availability_status
    )
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "is_available_today": producer.is_available_today,
        "availability_state": producer.availability_state,
    }


# MEH-12: durable availability status ("open | full | vacation") that
# persists until the producer changes it, vs. the per-day
# `is_available_today` flag above. Rendered as a colored-dot badge on
# ProducerCard + ProducerDetail. Keep the two endpoints separate —
# collapsing them would break the existing "זמין היום" UX.
AVAILABILITY_STATUSES = {"available", "full", "vacation"}


@router.post("/availability-status")
def set_availability_status(
    data: AvailabilityStatusUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Legacy endpoint — kept during MEH-291 7-day overlap. Mirrors the
    durable status to `availability_state`."""
    if data.status not in AVAILABILITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"סטטוס לא תקין. חייב להיות אחד מתוך: {sorted(AVAILABILITY_STATUSES)}",
        )
    # AUD-039: reject a past return date here too (Israel tz), so the legacy
    # surface can't persist an already-expired vacation.
    if (
        data.status == "vacation"
        and data.vacation_until is not None
        and data.vacation_until < israel_today()
    ):
        raise HTTPException(
            status_code=422, detail="תאריך החזרה לחופשה חייב להיות עתידי"
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    producer.availability_status = data.status
    producer.vacation_until = data.vacation_until if data.status == "vacation" else None
    producer.availability_state = _legacy_to_state(
        producer.is_available_today, producer.availability_status
    )
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "availability_status": producer.availability_status,
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


# MEH-291 — new unified endpoint. Phase 3 frontend will call this exclusively;
# the two legacy endpoints above stay during the 7-day overlap and dual-write.


@router.post("/availability-state")
@limiter.limit("20/hour")
def set_availability_state(
    request: Request,
    data: AvailabilityStateUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    # Value membership stays a 400 before the DB hit (preserves existing
    # contract); the transition + return-date guards run against the
    # producer's current state below (AUD-039/040).
    if data.state not in AVAILABILITY_STATES:
        raise HTTPException(
            status_code=400,
            detail=f"מצב לא תקין. חייב להיות אחד מתוך: {', '.join(AVAILABILITY_STATES)}",
        )

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    try:
        validate_transition(producer.availability_state, data.state)
        vacation_until = resolve_vacation_until(data.state, data.vacation_until)
    except AvailabilityValidationError as e:
        # value violation → 400; missing/past return date → 422.
        raise HTTPException(
            status_code=400 if e.kind == "value" else 422, detail=str(e)
        ) from e

    producer.availability_state = data.state
    is_today, legacy_status = _state_to_legacy(data.state)
    producer.is_available_today = is_today
    producer.availability_status = legacy_status
    producer.vacation_until = vacation_until
    producer.last_active_at = datetime.utcnow()
    db.commit()
    return {
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


@router.get("/dashboard")
def dashboard(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Minimal producer dashboard summary — kept stable for backward compat
    with the existing `/producer/dashboard` UI that already fetches this
    route. The richer analytics live at /producers/me/analytics."""
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    favorites_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )

    # feature/producer-analytics: replace the hardcoded 0 with real counts
    # from producer_whatsapp_clicks.
    week_ago = datetime.utcnow() - timedelta(days=7)
    whatsapp_clicks_week = (
        db.query(func.count(ProducerWhatsAppClick.id))
        .filter(
            ProducerWhatsAppClick.producer_id == producer.id,
            ProducerWhatsAppClick.clicked_at >= week_ago,
        )
        .scalar()
        or 0
    )

    return {
        "producer": {
            "id": str(producer.id),
            "name": producer.name,
            "is_available_today": bool(producer.is_available_today),
            # MEH-12 — dashboard toggle reads this to highlight the active pill
            "availability_status": producer.availability_status or "available",
            # MEH-291 — durable 4-value enum that supersedes the two above.
            # Defensive default in case ORM ever returns NULL despite NOT NULL.
            "availability_state": producer.availability_state or "accepting_orders",
            "vacation_until": producer.vacation_until.isoformat()
            if producer.vacation_until
            else None,
            "status": producer.status,
            "plan": producer.plan,
        },
        "favorites_count": int(favorites_count),
        "whatsapp_clicks_week": int(whatsapp_clicks_week),
    }


# ============================================================
# GET /producers/me/analytics — feature/producer-analytics
# ============================================================


def _rank_in_city(db: Session, producer, israel_day):
    """MEH-57: 1-based rank among approved producers in the same city, by 30d
    views descending. None when the producer has no city.

    Extracted from `producer_analytics` under MEH-160 — inlining it pushed the
    endpoint over PLR0915's 50-statement cap.

    MEH-160: ranks on the same unit the dashboard displays. The LEFT JOIN here
    is why `unique_views_count` gates its NULL arm on the row id — a producer
    with zero views still yields one all-NULL row, and an ungated
    `hash IS NULL` would score every view-less rival a 1.
    """
    if not producer.city:
        return None
    cutoff_30d = datetime.utcnow() - timedelta(days=30)
    rank_views = unique_views_count(israel_day)
    city_ranks = (
        db.query(Producer.id, rank_views.label("views"))
        .outerjoin(
            ProducerPageView,
            and_(
                ProducerPageView.producer_id == Producer.id,
                ProducerPageView.created_at >= cutoff_30d,
            ),
        )
        .filter(Producer.city == producer.city, Producer.status == "approved")
        .group_by(Producer.id)
        .order_by(rank_views.desc())
        .all()
    )
    return next(
        (i + 1 for i, row in enumerate(city_ranks) if row.id == producer.id), None
    )


@dataclass
class WindowFilter:
    """MEH-447: collapse the 2 optional kwargs of _count_in_window into a
    single value object so the helper stays under PLR0913's 5-arg cap.
    `extra_filter` is a SQLAlchemy ColumnElement — typed as Any to avoid
    Pydantic-arbitrary-type friction on an internal-only helper."""

    days: int | None = None
    extra_filter: Any = None
    # MEH-160: when set, count DISTINCT (israel-day, value) pairs instead of
    # rows — one count per visitor per 24h Israel calendar day (Sapir's 09/08
    # ruling: the 24h window is the analytics norm). Rows where the column IS
    # NULL are still counted individually — they cannot be deduped against
    # anything, and dropping them (which COUNT(DISTINCT) does silently) would
    # trade over-counting for under-counting.
    distinct_col: Any = None


def _count_in_window(
    db: Session, model, time_col, producer_id, window: WindowFilter = WindowFilter()
):
    """Count rows for the given model, optionally windowed to last N days.

    MEH-160: with ``window.distinct_col`` set, counts DISTINCT
    (israel-day, value) pairs PLUS the NULL rows one-by-one — a visitor counts
    once per 24h Israel calendar day (ruling 09/08), and a hit with no hash
    counts individually. `producer_page_views` writes `viewer_ip_hash` on every
    row and nothing ever read it, so one visitor refreshing N times counted as
    N profile views — the inflation the ticket describes, reachable without
    any spoofed user-agent. hash_ip's salt is settings.secret_key — stable per
    deploy, not time-rotating — so the day grain comes from created_at, not
    from the hash itself (a secret rotation resets uniques; acceptable, rare).
    """
    if window.distinct_col is not None:
        counter = unique_views_count(
            israel_day_of(time_col),
            hash_col=window.distinct_col,
            row_id_col=model.id,
        )
    else:
        counter = func.count(model.id)
    q = db.query(counter).filter(model.producer_id == producer_id)
    if window.days is not None:
        cutoff = datetime.utcnow() - timedelta(days=window.days)
        q = q.filter(time_col >= cutoff)
    if window.extra_filter is not None:
        q = q.filter(window.extra_filter)
    return int(q.scalar() or 0)


@router.get("/analytics")
def producer_analytics(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Rich analytics for the producer dashboard.

    Returns:
      - profile_views / search_appearances / whatsapp_clicks as {last_7d, last_30d, total}
      - follower_count + new_followers_this_week
      - average_rating + total_reviews (from the producers.avg_rating aggregate)
      - home_products_count (active only, scoped to the owning user)
      - views_by_day: 30-entry zero-filled daily series for the line chart
      - top_cities: top 5 cities the views come from (NULL excluded)
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    pid = producer.id

    # Time-windowed counts for the 3 main metrics.
    def windowed(model, time_col, *, extra=None, distinct_col=None):
        return {
            label: _count_in_window(
                db,
                model,
                time_col,
                pid,
                WindowFilter(days=days, extra_filter=extra, distinct_col=distinct_col),
            )
            for label, days in (("last_7d", 7), ("last_30d", 30), ("total", None))
        }

    # MEH-160: page views dedupe per (israel-day, viewer_ip_hash) — one count
    # per visitor per 24h day (ruling 09/08). "Unique inside a window" is what
    # models.py's own docstring said the column was for; until now nothing read
    # it. The windowed counters therefore equal the SUM of their days' unique
    # counts, so the headline numbers and the views_by_day chart agree by
    # construction.
    profile_views = windowed(
        ProducerPageView,
        ProducerPageView.created_at,
        distinct_col=ProducerPageView.viewer_ip_hash,
    )
    search_appearances = windowed(
        ProducerPageView,
        ProducerPageView.created_at,
        extra=(ProducerPageView.referrer == "search"),
        distinct_col=ProducerPageView.viewer_ip_hash,
    )
    whatsapp_clicks = windowed(ProducerWhatsAppClick, ProducerWhatsAppClick.clicked_at)
    contact_clicks = windowed(ContactClick, ContactClick.clicked_at)

    # Followers — MEH-1364 (decision A, MEH-1362): counted from `favorites`,
    # the canonical interest record, since MEH-1363 removed the follow button
    # and producer_followers stopped receiving writes (Expand half only —
    # the table + producer_follows.py stay until the Contract ticket).
    # favorites has a composite PK (user_id, producer_id) and NO id column —
    # count on a key column (REUSES: :510 func.count(Favorite.producer_id)).
    follower_count = (
        db.query(func.count(Favorite.producer_id))
        .filter(Favorite.producer_id == pid)
        .scalar()
        or 0
    )
    week_ago = datetime.utcnow() - timedelta(days=7)
    new_followers_this_week = (
        db.query(func.count(Favorite.producer_id))
        .filter(
            Favorite.producer_id == pid,
            Favorite.created_at >= week_ago,
        )
        .scalar()
        or 0
    )

    # Reviews — use the cached aggregate on the Producer row so we don't
    # re-scan producer_reviews on every dashboard hit.
    average_rating = float(producer.avg_rating or 0)
    total_reviews = int(producer.reviews_count or 0)

    # Home products owned by the producer's user account (is_active only)
    home_products_count = (
        db.query(func.count(HomeProduct.id))
        .filter(
            HomeProduct.user_id == user.id,
            HomeProduct.is_active.is_(True),
        )
        .scalar()
        or 0
    )

    # Views by day for the last 30 days, zero-filled.
    # MEH-1894: the whole window runs on the Israel calendar day. Three parts
    # move together, and they have to — fixing only one is what produces an
    # off-by-a-few-hours bucket.
    #   1. the anchor: israel_today(), not the server's UTC date.
    #   2. the bucket: created_at is a NAIVE UTC column (models.py:1461), so
    #      it is first labelled UTC and then converted to Israel local before
    #      func.date() cuts the day. Without this the day boundary falls at
    #      midnight UTC = 02:00/03:00 Israel, so a 00:30 view counts as
    #      yesterday. The double cast is required precisely BECAUSE the column
    #      is naive; a tz-aware column would need only the inner one.
    #   3. the cutoff: Israel midnight of the oldest day, expressed back in
    #      naive UTC to match the column. Leaving the old naive
    #      datetime.combine() here would silently drop the first 2-3 hours of
    #      the oldest bucket, since that bucket starts at 21:00/22:00 UTC the
    #      previous day.
    today = israel_today()
    window_start = (
        datetime.combine(
            today - timedelta(days=29), datetime.min.time(), tzinfo=ISRAEL_TZ
        )
        .astimezone(timezone.utc)
        .replace(tzinfo=None)
    )
    israel_day = israel_day_of(ProducerPageView.created_at)
    # MEH-160: the chart dedupes per DAY on the same column the windowed
    # counters use, so the series and the headline number cannot disagree.
    # Grouped by the day already, so the day-less shape of the helper applies.
    daily_rows = (
        db.query(
            israel_day.label("day"),
            # `israel_day` is already the GROUP BY key, so the day inside
            # the DISTINCT tuple is constant per group — the same count, and
            # no shorthand to get wrong (adversarial review, round 2).
            unique_views_count(israel_day).label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.created_at >= window_start,
        )
        .group_by(israel_day)
        .all()
    )
    by_day = {str(row.day): int(row.count) for row in daily_rows}
    views_by_day = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        views_by_day.append(
            {"date": d.isoformat(), "count": by_day.get(d.isoformat(), 0)}
        )

    # Top cities (viewers who had a city attached — i.e. logged-in viewers).
    # MEH-160: same unit as profile_views — one visitor per city per day.
    # Grouped by city, not by day, so the day travels inside the DISTINCT.
    city_views = unique_views_count(israel_day)
    top_city_rows = (
        db.query(
            ProducerPageView.city,
            city_views.label("count"),
        )
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.city.isnot(None),
        )
        .group_by(ProducerPageView.city)
        .order_by(city_views.desc())
        .limit(5)
        .all()
    )
    top_cities = [{"city": row.city, "count": int(row.count)} for row in top_city_rows]

    rank_in_city = _rank_in_city(db, producer, israel_day)

    # MEH-57 ── conversion_rate: whatsapp clicks / profile views × 100 (30d).
    # MEH-160 contract note: the denominator is now unique daily viewers,
    # while `producer_whatsapp_clicks` carries NO viewer hash (models.py:1515
    # — only a nullable user_id), so the numerator cannot be deduped to match
    # without a schema change. The ratio is therefore "clicks per 100 unique
    # daily viewers" and CAN exceed 100 legitimately: one viewer clicking
    # twice in a day. The copy states that in both locales, and the display no
    # longer clamps it — clamping hid a wrong contract behind a screen that
    # looked fine. Alternative (Sapir's call, drafted on the card): add
    # viewer_ip_hash to the clicks table and restore a bounded percentage.
    conversion_rate = (
        round(whatsapp_clicks["last_30d"] / profile_views["last_30d"] * 100, 1)
        if profile_views["last_30d"] > 0
        else 0.0
    )

    # MEH-57 ── profile_strength: 0-100 score from 5-item checklist.
    # MEH-794: the home-product item was removed with /neighbor (MEH-793);
    # its 25% was redistributed +5 across the remaining 5 signals so a
    # fully-complete profile still reaches 100.
    has_delivery_area = (
        db.query(func.count(DeliveryArea.id))
        .filter(DeliveryArea.producer_id == pid)
        .scalar()
        or 0
    ) > 0
    strength_score = sum(
        [
            20 if (producer.images or []) else 0,
            25
            if (producer.description or "").strip()
            and len((producer.description or "").strip()) >= 50
            else 0,
            15 if has_delivery_area else 0,
            20 if int(total_reviews) > 0 else 0,
            20 if producer.phone_verified else 0,
        ]
    )
    profile_strength = int(strength_score)

    # MEH-57 ── weekly_trend: compare last 7d views vs previous 7d (days 14→7).
    now = datetime.utcnow()
    prev_start = now - timedelta(days=14)
    prev_end = now - timedelta(days=7)
    # MEH-160: the comparison arm has to use the SAME unit as `last_7d`, which
    # is deduped. Comparing deduped-now against raw-then reads "down" on
    # perfectly flat traffic — a permanent regression, not a rounding wobble:
    # any repeat visitor deflates only one side of the subtraction.
    prev_7d_views = int(
        db.query(unique_views_count(israel_day))
        .filter(
            ProducerPageView.producer_id == pid,
            ProducerPageView.created_at >= prev_start,
            ProducerPageView.created_at < prev_end,
        )
        .scalar()
        or 0
    )
    last_7d = profile_views["last_7d"]
    if last_7d == 0 and prev_7d_views == 0:
        weekly_trend = "stable"
    elif prev_7d_views == 0:
        weekly_trend = "up"
    elif last_7d == 0:
        weekly_trend = "down"
    else:
        change = (last_7d - prev_7d_views) / prev_7d_views
        weekly_trend = "up" if change > 0.10 else "down" if change < -0.10 else "stable"

    return {
        "profile_views": profile_views,
        "search_appearances": search_appearances,
        "whatsapp_clicks": whatsapp_clicks,
        "contact_clicks": contact_clicks,
        "follower_count": int(follower_count),
        "new_followers_this_week": int(new_followers_this_week),
        "average_rating": round(average_rating, 2),
        "total_reviews": total_reviews,
        "home_products_count": int(home_products_count),
        "views_by_day": views_by_day,
        "top_cities": top_cities,
        "rank_in_city": rank_in_city,
        "conversion_rate": conversion_rate,
        "profile_strength": profile_strength,
        "weekly_trend": weekly_trend,
    }


# ---------------------------------------------------------------------------
# MEH-51: Phone verification (WhatsApp OTP)
# ---------------------------------------------------------------------------


def _send_whatsapp_otp(phone: str, code: str) -> bool:
    """Send a 6-digit OTP via WhatsApp Cloud API (MEH-508, MEH-754).

    Fail-open: returns False if WHATSAPP_* config is missing or the Meta
    Graph call errors — caller logs and still returns HTTP 200.

    MEH-754: switched from `send_text` (free-form) to the Meta
    AUTHENTICATION template `producer_otp_v1`. Free-form text is only
    delivered inside Meta's 24h customer-service window, so a brand-new
    producer who never messaged the business number never received the
    code. Templates are delivered unconditionally. send_template owns
    config / HTTP fail-open internally.
    """
    return send_template(phone, OtpCodeV1(code=code))


@router.post("/verify-phone", status_code=200)
@limiter.limit("3/10minute")
def send_phone_otp(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if not producer.phone:
        raise HTTPException(status_code=400, detail="לא נמצא מספר טלפון בפרופיל")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    code = "".join(secrets.choice(string.digits) for _ in range(6))
    expires = datetime.utcnow() + timedelta(minutes=10)

    # Invalidate any previous unused tokens for this producer
    db.query(PhoneOtpToken).filter(
        PhoneOtpToken.producer_id == producer.id,
        PhoneOtpToken.used.is_(False),
    ).update({"used": True})

    db.add(
        PhoneOtpToken(
            producer_id=producer.id,
            phone=producer.phone,
            code=code,
            expires_at=expires,
        )
    )
    db.commit()

    _send_whatsapp_otp(producer.phone, code)
    return {"detail": "קוד נשלח"}


@router.post("/verify-phone/confirm", status_code=200)
@limiter.limit("3/minute")
def confirm_phone_otp(
    request: Request,
    body: OtpConfirmIn,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if producer.phone_verified:
        return {"detail": "הטלפון כבר מאומת"}

    # MEH-1820: claim the token with a CONDITIONAL UPDATE, not SELECT-then-set.
    # The previous form read `used == False` and assigned `used = True` as two
    # statements, so under READ COMMITTED (Postgres' default) two overlapping
    # confirms could both find the same token before either committed — and
    # both would then run the pending_whatsapp → pending transition and fire
    # the "ready for review" admin ping. Damage was noise, not data: a
    # duplicate admin notification.
    #
    # `.update()` returns the affected-row count, and that count IS the lock:
    # the second request blocks on the first's row lock, re-evaluates the
    # WHERE against the committed row, finds `used` already true, and matches
    # zero rows. Exactly one caller can win, per token.
    #
    # Chose the conditional UPDATE over `SELECT … FOR UPDATE` (the card's
    # option (a)) for three reasons: it is one statement rather than a
    # lock-then-mutate pair; it holds no row lock across the
    # `_pending_and_approvable` query below; and `with_for_update()` is a
    # silent no-op on backends that ignore it, which would make the guard
    # disappear without any test going red — the failure mode this repo keeps
    # getting caught by.
    #
    # The loser gets the SAME 400 as a wrong or expired code. That is
    # deliberate: from the caller's side a lost race and a stale code are the
    # same event — this token is no longer usable — and inventing a new status
    # or Hebrew string would leak concurrency internals into the API surface.
    claimed = (
        db.query(PhoneOtpToken)
        .filter(
            PhoneOtpToken.producer_id == producer.id,
            PhoneOtpToken.code == body.code,
            PhoneOtpToken.used.is_(False),
            PhoneOtpToken.expires_at > datetime.utcnow(),
        )
        .update({PhoneOtpToken.used: True}, synchronize_session=False)
    )
    if not claimed:
        raise HTTPException(status_code=400, detail="קוד שגוי או פג תוקף")

    producer.phone_verified = True
    # MEH-1816: snapshot approvability BEFORE the flip below, exactly as
    # PUT /producers/me does at :259 — this is the SECOND mutation site able to
    # complete the review-ready transition, and MEH-1351 only covered the first.
    # A business that uploaded its image while still pending_whatsapp crosses
    # the threshold here, so a ping owned by one site alone gets swallowed.
    # The snapshot is also what keeps the already-pending path silent: such a
    # producer is approvable before the call, so the false→true edge is absent.
    was_approvable = _pending_and_approvable(db, producer)
    # MEH-745: self-registered producers wait in pending_whatsapp until the
    # business phone is verified; a successful OTP confirm is the gate that
    # releases them into the normal admin-review queue (pending). Only advance
    # from pending_whatsapp — never touch approved / rejected / inactive.
    if producer.status == "pending_whatsapp":
        producer.status = "pending"
    db.commit()
    # REUSES: backend/app/routers/producer_me.py:413 — same helper, same
    # post-commit position, so an admin is never pinged about a transition that
    # failed to persist.
    _maybe_fire_review_ready(background_tasks, db, producer, was_approvable)
    return {"detail": "הטלפון אומת בהצלחה"}


# ---------------------------------------------------------------------------
# MEH-51: Kashrut badge requests
# ---------------------------------------------------------------------------


@router.post("/kashrut-request", response_model=KashrutRequestOut, status_code=201)
@limiter.limit("10/hour")
def request_kashrut_badge(
    request: Request,
    body: KashrutRequestCreate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    if body.badge_code not in VALID_BADGE_CODES:
        raise HTTPException(
            status_code=400,
            detail=f"קוד badge לא תקין. ערכים מותרים: {', '.join(sorted(VALID_BADGE_CODES))}",
        )
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    existing = (
        db.query(KashrutBadgeRequest)
        .filter(
            KashrutBadgeRequest.producer_id == producer.id,
            KashrutBadgeRequest.badge_code == body.badge_code,
            KashrutBadgeRequest.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="בקשה לbadge זה כבר ממתינה לאישור")

    req = KashrutBadgeRequest(
        producer_id=producer.id,
        badge_code=body.badge_code,
        cert_url=body.cert_url,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    out = KashrutRequestOut.model_validate(req)
    out.producer_name = producer.name
    return out


@router.get("/kashrut-requests", response_model=list[KashrutRequestOut])
@limiter.limit("30/minute")
def list_kashrut_requests(
    request: Request,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """MEH-1167: the logged-in producer's own kashrut badge requests,
    newest first — feeds the dashboard KashrutCard status zone so a
    pending/rejected request is visible after submit. Owner-isolated by
    producer_id (require_producer guarantees one); no schema change —
    KashrutRequestOut already exists (MEH-51)."""
    rows = (
        db.query(KashrutBadgeRequest)
        .filter(KashrutBadgeRequest.producer_id == user.producer_id)
        .order_by(KashrutBadgeRequest.created_at.desc())
        .all()
    )
    return rows


# ---------------------------------------------------------------------------
# MEH-1236: resubmit-for-review — the owner signals she finished completing
# the details an admin requested, so the admin knows to look again.
# ---------------------------------------------------------------------------


@router.post("/request-review", status_code=200)
@limiter.limit("3/hour")
def request_producer_review(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """Producer-initiated "I'm done — please re-check" ping (MEH-1236).

    Notification-only: NO schema change. The `requested_changes` /
    `changes_requested_at` columns are deliberately left untouched (they are
    admin-owned; only approve/reject/request-changes in admin.py write them) —
    this closes the resubmit loop without inventing a "resubmitted" DB state.

    Pending-only: mirrors admin.request_producer_changes:599 — a re-review
    request only makes sense while the producer is still in the approval queue,
    so an already-decided producer (approved/rejected/inactive) → 409.

    The admin notification fires as a BackgroundTask, fail-open (MEH-1051 /
    MEH-977): a Meta/Resend outage or missing admin config must never affect
    the 200 the owner sees.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    if producer.status not in ("pending", "pending_whatsapp"):
        raise HTTPException(
            status_code=409,
            detail="ניתן לשלוח לבדיקה חוזרת רק כשבית העסק בהמתנה לאישור",
        )

    # REUSES: app/services/auth_notifications.py notify_admin_new_recipe pattern
    # (admin WhatsApp + email, fail-open). Lazy import mirrors the fire_alerts
    # style already used in this file.
    from app.services.auth_notifications import notify_admin_producer_resubmit

    background_tasks.add_task(
        notify_admin_producer_resubmit, producer.name, producer.city
    )
    return {"detail": "נשלח לבדיקה חוזרת"}


# ---------------------------------------------------------------------------
# MEH-56: AI bio generator
# ---------------------------------------------------------------------------


@router.post("/bio/generate")
@limiter.limit("5/hour")
def generate_bio_endpoint(
    request: Request,
    body: BioGenerateIn,
    user: User = Depends(require_producer),
):
    """Generate a Hebrew ≤150-char business description via Claude Haiku.

    MEH-1173: accepts structured input (sells + optional area/special/
    instagram) — the Instagram scrape is gone. Fail-open: returns
    {"bio": ""} when AI is unavailable.
    """
    from app.services.bio_generator import generate_bio

    bio = generate_bio(body.sells, body.area, body.special, body.instagram)
    return {"bio": bio}


# MEH-88: Product CRUD
# ---------------------------------------------------------------------------


@router.get("/products", response_model=list[ProductOut])
def list_my_products(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    return db.query(Product).filter(Product.producer_id == user.producer_id).all()


@router.post("/products", response_model=ProductOut, status_code=201)
@limiter.limit("60/hour")
def create_my_product(
    request: Request,
    data: ProductCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = Product(producer_id=user.producer_id, **data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)

    # PR #404 (3b7e3ea5, "audit Gap A"): notify favoriting users who opted in
    # for new-product alerts. Wires the previously-orphaned "new_product"
    # alert_type (see _ALERT_COL in routers/alerts.py). No Linear ticket was
    # ever assigned — the original marker was a literal, unresolvable MEH-XXX.
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    producer_name = producer.name if producer else "בית העסק"
    from app.routers.alerts import AlertContent, fire_alerts

    background_tasks.add_task(
        fire_alerts,
        db,
        user.producer_id,
        "new_product",
        AlertContent(
            title=f"🆕 מוצר חדש מ{producer_name}",
            body=product.name,
            url=f"/producer/{user.producer_id}",
        ),
    )

    return product


@router.put("/products/{product_id}", response_model=ProductOut)
@limiter.limit("60/hour")
def update_my_product(
    request: Request,
    product_id: UUID,
    data: ProductUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == user.producer_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
def delete_my_product(
    product_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.producer_id == user.producer_id,
        )
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="מוצר לא נמצא")

    # MEH-375 (YF-2): capture image_url BEFORE db.delete; destroy after
    # commit per the external-cleanup rule. Truthy guard skips the
    # logger spam for products that never had an image.
    old_image_url = product.image_url

    db.delete(product)
    db.commit()

    if old_image_url:
        from app.cloudinary_utils import destroy_image

        destroy_image(old_image_url, context="producer_me.delete_my_product image")


# ============================================================================
# MEH-1421 (MEH-1388 chunk 4a): producer_locations owner CRUD.
# Owner-scoped physical presence points (branch / pickup / market_stand),
# mirroring the products CRUD shape above (list/create/update/delete).
#
# IDOR: `require_producer` gates the ROLE (403 for a non-producer, auth.py:268);
# a location id that exists but belongs to ANOTHER producer raises 403 via
# `_get_owned_location` — the security.md ownership invariant. This
# INTENTIONALLY differs from the products 404-on-not-owned (producer_me.py:1108):
# the MEH-1421 AC + IDOR test require a 403. There is NO admin override — an
# admin has role != "producer" and is 403'd by require_producer upstream, so
# admin location management is out of 4a scope (admin surface = the read-only
# dedup signal, not mutation).
#
# Two cross-row invariants live here (not the schema — they need the session):
#   1. Single-primary: a producer has exactly one primary location while ≥1
#      exists. First create is forced primary; setting one primary clears the
#      others; deleting the primary promotes the oldest survivor.
#   2. Same-city label: a location whose city already exists for the producer
#      must carry a non-empty label (map tooltip disambiguation, epic rule).
# ============================================================================


def _get_owned_location(
    db: Session, producer_id: UUID, location_id: UUID
) -> ProducerLocation:
    # MEH-1421 IDOR: look up by id ALONE, then check ownership so a cross-owner
    # id is a 403 (not a 404). A genuinely missing id is a 404.
    # REUSES: .claude/rules/security.md — owner_id == current_user.id else 403.
    loc = db.query(ProducerLocation).filter(ProducerLocation.id == location_id).first()
    if loc is None:
        raise HTTPException(status_code=404, detail="מיקום לא נמצא")
    if loc.producer_id != producer_id:
        raise HTTPException(status_code=403, detail="אין הרשאה למיקום זה")
    return loc


SAME_CITY_NEEDS_LABEL_CODE = "location_same_city_needs_label"

# Transition-safety string ONLY. Any client that still reads a bare-string
# `detail` falls back to this; the rendered copy comes from messages/he.json
# keyed on the code above. Deliberately generic — it carries no label examples,
# because inventing one ("הדוכן בשוק") hands the owner a KIND name for a form
# that already has a kind selector, and duplicates the label field's own
# placeholder two centimetres away.
SAME_CITY_NEEDS_LABEL_MESSAGE = "כשיש שני מיקומים באותו יישוב יש להוסיף שם מזהה"


def _same_city_label_error_detail(
    city: str | None,
    existing_kind: str | None = None,
    existing_label: str | None = None,
    existing_count: int = 1,
) -> dict[str, object]:
    # MEH-1940: `{code, message, params}` rather than a Hebrew sentence.
    # REUSES: backend/app/auth.py:374-382 (_EMAIL_UNVERIFIED_DETAIL, MEH-1164) —
    # same shape, same reason: the client matches on a stable, locale-independent
    # `code` and renders its own copy, and `message` stays for transition safety.
    #
    # `params` describes the location she ALREADY has, so the frontend can name
    # it instead of inventing an example. NO Hebrew kind name is produced here:
    # `existing_kind` is the raw enum ("branch" / "pickup" / "market_stand") and
    # the translation lives in settings.locations.kind.* in he.json + en.json.
    return {
        "code": SAME_CITY_NEEDS_LABEL_CODE,
        "message": SAME_CITY_NEEDS_LABEL_MESSAGE,
        "params": {
            # The city the OWNER typed, not the stored row's: the compare is
            # case-insensitive, so the stored value can differ in case/spacing
            # from what she is looking at in the form.
            "city": city.strip() if city and city.strip() else None,
            "existing_kind": existing_kind,
            "existing_label": existing_label,
            "existing_count": existing_count,
        },
    }


def _reject_same_city_without_label(
    db: Session,
    producer_id: UUID,
    city: str | None,
    label: str | None,
    exclude_id: UUID | None = None,
) -> None:
    # MEH-1421: a 2nd location in a city the producer already uses MUST carry a
    # label so the map tooltip + dashboard can tell the points apart. Python-side
    # compare (a producer has few locations) keeps it DB-agnostic (sqlite tests
    # + Postgres prod).
    if not city or not city.strip():
        return
    if label and label.strip():
        return
    target = city.strip().lower()
    rows = (
        db.query(
            ProducerLocation.id,
            ProducerLocation.city,
            ProducerLocation.kind,
            ProducerLocation.label,
        )
        .filter(ProducerLocation.producer_id == producer_id)
        .all()
    )
    # MEH-1940: collect ALL colliding rows rather than raising on the first.
    # The message describes what she already has, and "2 מיקומים" versus naming
    # a single one is a different sentence — which needs the count, so the loop
    # can no longer short-circuit. The invariant is unchanged: a non-empty list
    # blocks, exactly as the first match did.
    clashes = [
        row
        for row in rows
        if (exclude_id is None or row.id != exclude_id)
        and row.city
        and row.city.strip().lower() == target
    ]
    if not clashes:
        return
    first = clashes[0]
    raise HTTPException(
        status_code=422,
        detail=_same_city_label_error_detail(
            city,
            existing_kind=first.kind,
            existing_label=first.label,
            existing_count=len(clashes),
        ),
    )


def _clear_other_primaries(db: Session, producer_id: UUID, keep_id: UUID) -> None:
    db.query(ProducerLocation).filter(
        ProducerLocation.producer_id == producer_id,
        ProducerLocation.id != keep_id,
    ).update({ProducerLocation.is_primary: False})


@router.get("/locations", response_model=list[ProducerLocationOwnerOut])
def list_my_locations(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    return (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == user.producer_id)
        .order_by(
            ProducerLocation.is_primary.desc(),
            ProducerLocation.created_at.asc(),
        )
        .all()
    )


@router.post("/locations", response_model=ProducerLocationOwnerOut, status_code=201)
@limiter.limit("60/hour")
def create_my_location(
    request: Request,
    data: ProducerLocationCreate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    _reject_same_city_without_label(db, user.producer_id, data.city, data.label)
    existing_count = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == user.producer_id)
        .count()
    )
    loc = ProducerLocation(producer_id=user.producer_id, **data.model_dump())
    # Single-primary: the first location is always primary; an explicit
    # is_primary=true on a later one clears the existing primary.
    if existing_count == 0:
        loc.is_primary = True
    db.add(loc)
    db.flush()  # assign loc.id before clearing siblings
    if loc.is_primary:
        _clear_other_primaries(db, user.producer_id, loc.id)
    db.commit()
    db.refresh(loc)
    return loc


@router.put("/locations/{location_id}", response_model=ProducerLocationOwnerOut)
@limiter.limit("60/hour")
def update_my_location(
    request: Request,
    location_id: UUID,
    data: ProducerLocationUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    loc = _get_owned_location(db, user.producer_id, location_id)
    patch = data.model_dump(exclude_unset=True)
    # Same-city check ONLY when this update actually touches city or label —
    # otherwise a pure is_primary toggle would re-validate an already-valid row
    # and falsely 422 a label-less FIRST location whose city a labeled sibling
    # legitimately shares (adversarial-review-errors finding).
    if "city" in patch or "label" in patch:
        new_city = patch.get("city", loc.city)
        new_label = patch.get("label", loc.label)
        _reject_same_city_without_label(
            db, user.producer_id, new_city, new_label, exclude_id=loc.id
        )

    want_primary = patch.pop("is_primary", None)
    for field, value in patch.items():
        setattr(loc, field, value)

    if want_primary is True:
        _clear_other_primaries(db, user.producer_id, loc.id)
        loc.is_primary = True
    elif want_primary is False and loc.is_primary:
        # Can't directly demote the sole primary (that would leave zero) — the
        # owner promotes another location instead (which clears this one).
        raise HTTPException(status_code=422, detail="חובה מיקום ראשי אחד")

    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/locations/{location_id}", status_code=204)
def delete_my_location(
    location_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    loc = _get_owned_location(db, user.producer_id, location_id)
    was_primary = loc.is_primary
    db.delete(loc)
    db.flush()
    # Delete-primary: promote the oldest survivor so the producer keeps exactly
    # one primary while any location remains (map/geo needs a primary anchor).
    if was_primary:
        replacement = (
            db.query(ProducerLocation)
            .filter(ProducerLocation.producer_id == user.producer_id)
            .order_by(ProducerLocation.created_at.asc())
            .first()
        )
        if replacement is not None:
            replacement.is_primary = True
    db.commit()
