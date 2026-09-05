from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import and_, func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.auth import require_producer
from app.constants import MAX_PRODUCER_RESUBMISSIONS
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
from app.services.auth_notifications import (
    notify_admin_new_producer,
    notify_admin_producer_review_ready,
    notify_admin_producer_sensitive_edit,
)
from app.services.submission_confirmation import send_submission_confirmation
from app.services.submission_gate import submission_missing_items
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


# MEH-2073: fields whose change is worth telling the admin about after a
# business is already approved — identity (city, phone) and the trust
# declarations MEH-1508 cross-checks at approval time (the diet scopes). ONE
# constant; the Hebrew labels live with the sender in auth_notifications.py.
#
# Deliberately NOT the whole writable set: description / short_description /
# owner_bio / links change often and legitimately, and a ping that fires on
# every copy edit is a ping the admin learns to ignore.
#
# Every member is verified present in _PRODUCER_WRITABLE_FIELDS below — a name
# that drifts out of that set would make this silently un-pingable, which is
# what `test_sensitive_fields_are_all_writable` exists to catch.
#
# MEH-1938 chunk 5a (ruling A, Sapir 02/09): `city` was REMOVED from this set
# together with its removal from _PRODUCER_WRITABLE_FIELDS below. Keeping it
# here would have kept a second writer on `Producer.city` alive solely to
# protect a ping no UI can reach — since B2 (MEH-2141) the owner edits her
# city through the locations CRUD, which pings nobody. That gap is real and
# pre-dates this change; it is MEH-2073 chunk 2's to close by moving the ping
# into `_sync_producer_city_from_primary`, not this handler's to paper over.
SENSITIVE_FIELDS = frozenset(
    {"phone", "vegan_scope", "vegetarian_scope", "gluten_free_facility"}
)

# MEH-1938 follow-up (Sapir, 02/09) — the single-primary invariant speaks with
# ONE voice. Both the demote arm and the delete arm of the locations CRUD are
# the same rule seen from two sides, so they share this exact string; a second
# wording (or a second status code) would read to a client as a second rule.
# Hebrew in `detail=` is required — backend/app/routers/CLAUDE.md.
ONE_PRIMARY_REQUIRED = "חובה מיקום ראשי אחד"

# Promotion is branch-only. `pickup` and `market_stand` are the secondary
# layer (MEH-1412) and cannot answer "where is the business".
#
# The second sentence is load-bearing and was added on Sapir's copy ruling
# (rule 22): the prohibition alone leaves a delivery-only owner stuck, since
# she flags her only pickup point and is told no with no way forward. It names
# the legitimate state MEH-213 already recognises instead. Mirrored for the UI
# as settings.locations.errors.primary_must_be_branch in he.json + en.json.
PRIMARY_MUST_BE_BRANCH = (
    "המיקום הראשי חייב להיות סניף. "
    "אם אין לעסק כתובת פיזית, אפשר להשאיר את המיקום הראשי ריק."
)


def _snapshot_sensitive(producer) -> dict:
    """Read the sensitive fields BEFORE the setattr loop mutates them.

    Mirrors the `was_approvable` idiom above: the comparison has to happen
    against values captured on a row read under the same advisory lock
    (MEH-2007), or two overlapping PUTs can each miss the other's write.
    """
    return {field: getattr(producer, field, None) for field in SENSITIVE_FIELDS}


def _maybe_fire_sensitive_edit(background_tasks, producer, before: dict) -> None:
    """MEH-2073: one ping per PUT, listing every sensitive field that actually
    changed, and only for a producer that is ALREADY approved.

    `status == "approved"` is read AFTER the commit deliberately — this endpoint
    never changes status, so before and after agree; reading it after keeps the
    check on the same object the diff is computed from.

    Compares values, not "was this key in the payload": a save that submits
    `phone` unchanged (which the dashboard form does on every save, since it
    posts the whole card) must not ping. That is the difference between a
    signal and noise, and it is what the no-op test pins down.
    """
    _fire_sensitive_edit(
        background_tasks,
        producer,
        sorted(
            field
            for field in SENSITIVE_FIELDS
            if before.get(field) != getattr(producer, field, None)
        ),
    )


def _fire_sensitive_edit(background_tasks, producer, changed: list[str]) -> None:
    """MEH-2073 chunk 2: the gate + dispatch shared by BOTH call sites — the
    owner PUT (chunk 1, above) and the locations CRUD (chunk 2, below).

    Extracted rather than duplicated because the two decisions that determine
    whether the admin hears anything at all are the same on both paths: the
    business is ALREADY approved, and something actually changed. Only the way
    the change list is computed differs — a column diff on the PUT, a city
    write-through or a lost primary row on the locations CRUD — so that half
    stays with each caller and this half cannot drift between them.
    """
    if producer.status != "approved" or not changed:
        return
    background_tasks.add_task(_sensitive_edit_task, producer.name, changed)


def _sensitive_edit_task(producer_name: str, changed: list[str]) -> None:
    """The fail-open boundary for the MEH-2073 ping.

    `notify_admin_producer_sensitive_edit` guards WhatsApp and email in
    separate try blocks, but its preamble — `_sanitize_wa_param(name)`, the
    label join, the f-string — sits outside both, so the function is not
    total. Under Starlette a BackgroundTask that raises propagates AFTER the
    response has begun, which turns an owner's successful save into an error
    she cannot act on and did not cause.

    `add_task` alone therefore does NOT satisfy the fail-open contract
    (MEH-1051/977); this wrapper is what does. Proven by
    `test_notification_failure_does_not_affect_the_200`, which patches the
    notifier to raise — without this it fails, which is how the gap was found.

    NOT retrofitted onto `_maybe_fire_review_ready` (MEH-1351) or the resubmit
    ping: same latent shape, but they are outside this ticket's
    notification-only scope. Reported rather than widened.
    """
    try:
        notify_admin_producer_sensitive_edit(producer_name, changed)
    except Exception:  # noqa: BLE001 — fire-and-forget; the 200 is already out
        log.exception(
            "[NOTIFY] sensitive-edit ping failed for '%s' (fields=%s)",
            producer_name,
            changed,
        )


def _maybe_fire_review_ready(background_tasks, db, producer, was_approvable) -> None:
    """MEH-1351: review-ready ping on the false→true approvability transition
    of a pending producer (first image / license completed). Fire-and-forget
    BackgroundTask mirroring the resubmit ping's contract; the transition
    check (not a sent-flag) is the idempotency guard — no schema change."""
    if not was_approvable and _pending_and_approvable(db, producer):
        background_tasks.add_task(
            notify_admin_producer_review_ready, producer.name, producer.city
        )


# MEH-2007: namespace for the (int4, int4) form of pg_advisory_xact_lock. The
# second half is derived from the producer UUID; two different producers can in
# principle fold onto the same 31-bit value, which costs them one avoidable wait
# and nothing else — correctness does not depend on the derivation being
# injective.
#
# The repo's only other advisory lock is alembic's migration mutex
# (`backend/alembic/env.py:42`, key 273273273) and it CANNOT collide with this
# one — measured, not assumed. The two call forms occupy separate lock objects:
# holding `pg_advisory_xact_lock(273273273)` in one backend and
# `pg_advisory_xact_lock(2007, 273273273)` in another yields two rows in
# `pg_locks`, distinguished by `objsubid` (1 for the int8 form, 2 for the
# int4-pair form) — with the numeric halves deliberately made identical, which
# is the case that would have collided if the spaces were shared.
_PRODUCER_UPDATE_LOCK_NAMESPACE = 2007


def _lock_producer_updates(db, producer_id) -> None:
    """Serialize concurrent owner PUTs on one producer, until this commit.

    MEH-2007. `update_my_producer` reads `was_approvable` before mutating and
    re-evaluates it after `db.commit()`, firing the review-ready ping on the
    false→true edge. Under READ COMMITTED two overlapping PUTs that each attach
    the first image both read False, both see True afterwards, and the admin is
    pinged twice for one transition.

    WHY AN ADVISORY LOCK AND NOT `with_for_update` ON THE PRODUCER ROW: both are
    transaction-scoped, so the hold time is identical and neither is "cheaper"
    on that axis. What differs is the blast radius. A row lock blocks every
    concurrent writer of that row for the whole request — admin approve
    (`admin.py`), the OTP confirm below, `producer_import.py`. This key is taken
    in exactly one place, so the only thing it can block is another PUT on the
    same producer, which is the pair that has to serialize for the ping to be
    correct.

    MUST be taken BEFORE the producer is loaded. Taken after, the loser wakes
    holding the row it read *before* the winner committed, snapshots a stale
    `was_approvable=False`, and fires anyway — the same bug wearing a lock.

    MEH-2051 — THE SECOND CALLER, and the one exception to the line above.
    `confirm_phone_otp` also completes the review-ready transition, so it takes
    this same key; without it a PUT and a confirm each compute the false→true
    edge independently and the admin is pinged twice for one transition. It
    CANNOT take the lock before its producer load, because MEH-1820's token
    claim has to be the first thing that blocks a rival confirm — so it takes
    the lock late and pays the freshness debt explicitly with `db.expire`,
    which is what the paragraph above is really asking for. The rule is
    therefore "the snapshot must be computed on a row read under this lock",
    and taking it before the load is the cheap way to satisfy it, not the only
    one. See the call site for the full reasoning.
    """
    if producer_id is None:
        return
    db.execute(
        text("SELECT pg_advisory_xact_lock(:ns, :key)"),
        {
            "ns": _PRODUCER_UPDATE_LOCK_NAMESPACE,
            "key": UUID(str(producer_id)).int % 2**31,
        },
    )


def _resolve_top_product(db, producer, payload: dict) -> None:
    """MEH-2137 switch — authorize the featured-product vote and sync the name.

    The vote used to be a STRING, so any product whose name matched won the
    badge: two products both called «לחם» both showed it (Sapir, 20/08). The
    vote is an id now, and an id has to be checked — `top_product_id` is a
    plain UUID in the payload, and nothing in Pydantic can know whether it
    belongs to this producer.

    Three cases, and the middle one is the whole point:

      * key absent          → no change. Uses `in payload`, not truthiness: an
                              unrelated dashboard save must not clear the vote.
      * value is None       → clear BOTH columns. "No featured product" is one
                              state, not two, and leaving the stale name behind
                              would keep rendering a badge the owner just removed.
      * value is a UUID     → must be a product of THIS producer, or 422. On
                              success `top_product_name` is synced from it, so
                              the legacy column stays truthful for every reader
                              that has not switched yet.

    Runs BEFORE the writable-field setattr loop, so a rejected id never lands.
    """
    if "top_product_id" not in payload:
        return

    new_id = payload["top_product_id"]
    if new_id is None:
        payload["top_product_name"] = None
        return

    product = (
        db.query(Product)
        .filter(Product.id == new_id, Product.producer_id == producer.id)
        .first()
    )
    if product is None:
        # Deliberately the same message whether the product does not exist or
        # belongs to someone else — distinguishing them would let an owner probe
        # for other producers' product ids.
        raise HTTPException(
            status_code=422,
            detail="המוצר המוביל חייב להיות מוצר קיים של העסק שלך",
        )
    payload["top_product_name"] = product.name


@router.put("", response_model=ProducerOwnerOut)
@limiter.limit("30/hour")
def update_my_producer(
    request: Request,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    # MEH-2007: held until this request's commit, so the snapshot below and the
    # write it is compared against are one atomic unit against another PUT on
    # this producer. Deliberately above the load — see the helper's docstring
    # for why after-the-load is not a weaker fix but a non-fix.
    _lock_producer_updates(db, user.producer_id)

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-1351: snapshot approvability BEFORE mutation — the review-ready ping
    # fires only on the false→true transition of a pending producer (below).
    was_approvable = _pending_and_approvable(db, producer)
    # MEH-2073: same idiom, different question — the sensitive-field values as
    # they stand before the setattr loop, so the post-commit diff can tell an
    # actual change from a form resubmitting an unchanged value.
    sensitive_before = _snapshot_sensitive(producer)

    # MEH-2137 switch — see _resolve_top_product, defined above this handler.
    _PRODUCER_WRITABLE_FIELDS = {
        "contact_name",
        "description",
        "short_description",
        # MEH-1938 chunk 5a: `city`, `lat` and `lng` were REMOVED from this
        # set. Same disposition and the same standing rule as the blocks below
        # — the columns stay, `admin.py` / `producer_import.py` / the seeds are
        # untouched, and only the owner PUT path is closed. Do not re-add any
        # of them without shipping its editor in the same PR:
        #   lat / lng → chunk 4 (MEH-2058) deleted the dashboard card that
        #                sent them, so this was an API path with no owner UI
        #                behind it. Worse than the MEH-1856 class: it wrote the
        #                columns and NOT the `producer_locations` row, and the
        #                Contract phase (chunk 5a) removed every read of the
        #                columns as a fallback — so a coordinate written here
        #                would have been invisible to the map, to "near me"
        #                and to the submit gate. The owner's editor is
        #                LocationsEditor.jsx (PUT /producers/me/locations/*).
        #   city      → closed by ruling A (Sapir, 02/09). It was held open
        #                one sub-step longer than lat/lng because it sat in
        #                SENSITIVE_FIELDS (MEH-2073) and the admin ping fired
        #                only from here; both went together, because since B2
        #                (MEH-2141) `Producer.city` follows the primary
        #                location row and an owner PUT of `city` was a second
        #                writer racing that write-through. The ping's new home
        #                is MEH-2073 chunk 2 (`_sync_producer_city_from_primary`).
        "phone",
        "instagram",
        "website",
        "whatsapp_group",
        "primary_contact_method",
        "contact_email",
        "facebook",
        "external_order_form",
        "top_product_name",
        # MEH-2137 switch: the vote by identity. Ownership is enforced by
        # _resolve_top_product (defined above) BEFORE this loop runs — a product
        # not this producer's never reaches the setattr.
        "top_product_id",
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
        # MEH-2142 (MEH-1938 batch B3): `opening_hours` was REMOVED from this
        # set. Same disposition and the same standing rule as the two blocks
        # below — the column stays, `admin.py` / `producer_import.py` / the
        # seeds are untouched, and only the owner PUT path is closed. Do not
        # re-add it without shipping its editor in the same PR:
        #   opening_hours        → the business-level hours editor was removed
        #                          from the dashboard in this PR. Store hours
        #                          are now a PER-LOCATION fact: the owner edits
        #                          `ProducerLocation.opening_hours` in
        #                          LocationsEditor, and the public page prefers
        #                          the primary location's value, falling back to
        #                          this column for businesses that have not
        #                          filled one in yet. Readers-first Parallel
        #                          Change — the fallback read carries
        #                          LEGACY(2026-10-01, MEH-1938) and its removal
        #                          is the contract step.
        # MEH-1543: owner-editable weekly order-acceptance window. Validated in
        # ProducerUpdate (day keys, HH:MM 24h, close>open). Explicit null in the
        # body clears it (present-but-None flows through model_dump(exclude_unset)
        # and setattr sets the column to NULL).
        "order_window",
        # MEH-2143 (MEH-1938 batch B4): `kosher` was REMOVED from this set.
        # Same disposition and standing rule as the blocks above — the column
        # stays, `admin.py:552` / `producer_import.py:323` (sheet column M) /
        # the seeds are untouched, and only the owner PUT path is closed. Do
        # not re-add it without shipping its editor in the same PR:
        #   kosher → free text that NO consumer surface has rendered since
        #            MEH-986 removed unverified kashrut claims from every one
        #            of them (חוק איסור הונאה בכשרות — an unverified claim is
        #            a legal exposure, not a missing feature). The owner was
        #            able to fill in a field nobody could ever see: the same
        #            "I wrote it and it is not displayed" class as
        #            starting_price_label.
        #
        #            The kashrut BADGE request flow is the only owner-facing
        #            mechanism, by design (cards.jsx:1263-1264 says so at the
        #            other end). There was never a dashboard editor for this
        #            field to remove — grepped the whole owner dashboard: the
        #            single reference is a READ at cards.jsx:1363, which shows
        #            a hint when a legacy value exists WITHOUT a verified
        #            certificate, explaining that the text drives nothing and
        #            pointing at the certificate. That hint keeps working:
        #            historical values still exist and are still served by
        #            ProducerOwnerOut.kosher (schemas.py:2469), which this
        #            change deliberately leaves in place.
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

    # MEH-2137 switch: resolve + authorize the featured-product vote.
    _resolve_top_product(db, producer, payload)

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
    # MEH-2073: notification only — runs after the commit above, adds a
    # BackgroundTask, and touches neither the response nor any column.
    _maybe_fire_sensitive_edit(background_tasks, producer, sensitive_before)

    return producer


# LEGACY(2026-10-01, MEH-1854)
# MEH-291 — dual-write helpers used during the 7-day overlap.
# Phase 4 (separate PR) drops the legacy is_available_today + availability_status
# columns and removes these helpers along with the legacy endpoints below.
# MEH-1857: that "7-day overlap" opened in May 2026 and the contract step never
# ran — ~14 months, which is why the expiry marker above now exists. MEH-1854
# owns the removal; scripts/legacy-expiry-check.sh fails once the date passes,
# so the next person either finishes it or extends the date in a reviewed PR.


# DO NOT remove, rename, or make private-er — imported cross-module by
# app/services/availability_expiry.py (MEH-1828). A rename fails silently at
# the next Sunday rollover, not at startup; MEH-1854 owns deleting both ends.
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

    # MEH-57 ── conversion_rate: contact actions / profile views × 100 (30d).
    #
    # MEH-2157: the numerator is EVERY logged contact action — the WhatsApp CTA
    # plus the non-WhatsApp contact clicks — not WhatsApp alone. A business
    # whose primary_contact_method is phone/email/website/external_order used to
    # read 0% forever, because the only table consulted was one it never writes
    # to. Industry anchor: Google Business Profile's headline number is likewise
    # the SUM of contact actions ("Interactions"), with the per-channel split
    # kept as a breakdown — which is why `whatsapp_clicks` and `contact_clicks`
    # are returned unchanged above and stay separate KPIs on the dashboard.
    #
    # The two tables CANNOT double-count one tap, and that is structural rather
    # than a convention anyone has to maintain: they are written by two distinct
    # endpoints (`producers.py:471` writes ProducerWhatsAppClick only,
    # `producers.py:507` writes ContactClick only), and
    # `_VALID_CONTACT_METHODS` (`producers.py:481`) has no "whatsapp" member, so
    # a WhatsApp tap has no path into the contact table at all.
    #
    # MEH-160 contract note, still in force and now covering both arms: the
    # denominator is unique daily viewers, while NEITHER click table is counted
    # per-viewer here — `producer_whatsapp_clicks` carries no viewer hash at all
    # (models.py:1722-1751 — only a nullable user_id), and although
    # `producer_contact_clicks` does have one (`ip_hash`, models.py:1779) it is
    # deliberately counted raw so both halves of the sum share one unit. The
    # ratio therefore CAN exceed 100 legitimately — one viewer acting twice in a
    # day — and widening the numerator makes that more likely, not less. The
    # display does not clamp it; clamping hid a wrong contract behind a screen
    # that looked fine. Alternative (Sapir's call, drafted on the MEH-160 card):
    # hash the viewer on both tables and restore a bounded percentage.
    contact_actions_30d = whatsapp_clicks["last_30d"] + contact_clicks["last_30d"]
    conversion_rate = (
        round(contact_actions_30d / profile_views["last_30d"] * 100, 1)
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
    # MEH-2125: `background_tasks` is gone from this signature — the removed
    # `_maybe_fire_review_ready` call was its only consumer. FastAPI injects it
    # per-handler, so dropping it affects nothing else.
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
    # both would then run the status transition that lived below (removed in
    # MEH-2124) and fire the "ready for review" admin ping (removed in
    # MEH-2125). Damage was noise, not data: a duplicate admin notification.
    #
    # `.update()` returns the affected-row count, and that count IS the lock:
    # the second request blocks on the first's row lock, re-evaluates the
    # WHERE against the committed row, finds `used` already true, and matches
    # zero rows. Exactly one caller can win, per token.
    #
    # Chose the conditional UPDATE over `SELECT … FOR UPDATE` (the card's
    # option (a)) for two reasons: it is one statement rather than a
    # lock-then-mutate pair, so there is no window between them to reason
    # about; and `with_for_update()` is a silent no-op on backends that ignore
    # it, which would make the guard disappear without any test going red —
    # the failure mode this repo keeps getting caught by.
    #
    # NOT a reason, and stated here because the first draft of this comment
    # claimed it was: the two forms hold the row lock for exactly the same
    # span. A Postgres row-level write lock lives until the TRANSACTION ends,
    # not until the statement returns, so the row lock taken here is held
    # right up to `db.commit()`. Anything slow added between here and that
    # commit widens the window in which a concurrent confirm for the same
    # token blocks. (It used to name `_pending_and_approvable` and the status
    # flip as what sat in that span; both are gone — MEH-2124, MEH-2125.)
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

    # MEH-2125: this handler is now a pure `phone_verified` writer, and three
    # things were removed from between the claim above and the commit below —
    # the MEH-2051 advisory lock + its `db.expire`, the MEH-1816 `was_approvable`
    # snapshot, and the `_maybe_fire_review_ready` call. All three were
    # MEASURED unreachable, not judged so: `_pending_and_approvable` (:293)
    # reads status/photos/licence and never `phone_verified`, so once MEH-2124
    # deleted the status flip the snapshot and the post-commit re-read
    # evaluated the same predicate over an unchanged row and the ping's
    # `not X and X` was False for every input. The concurrency test reported
    # `fired 0 times` before its assertion was touched.
    #
    # `_pending_and_approvable`, `_lock_producer_updates` and
    # `_maybe_fire_review_ready` all REMAIN — PUT /producers/me is the live
    # caller of each, and that path still produces a genuine false→true edge.
    # What went is only this handler's use of them.
    #
    # MEH-1820's guard is unaffected in substance but its SEAM moved: the
    # barrier in tests/test_otp_confirm_concurrency.py used to be planted on
    # `_pending_and_approvable` because that was the one call between the claim
    # and the commit. There is no such call now, so the test instruments the
    # request session's `commit` instead. If you add anything here that a rival
    # confirm can reach, re-read that test's docstring first.
    producer.phone_verified = True
    db.commit()
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

    MEH-2120 — THE COMPLETENESS GATE, added after Sapir hit this live. This
    endpoint predates the shared gate, so it pinged the admin regardless of
    whether the profile could be approved at all: her test business, with no
    photo and no product, pressed "סיימתי להשלים" and was told "נשלח לבדיקה".
    The admin then gets "please look again" on a profile the MEH-799 photo gate
    will refuse — exactly the queue noise MEH-2100 removed from the FRONT door,
    arriving through the side one.

    The gate below is a verbatim copy of `submit_for_review`'s, in this same
    file: same helper, same 422 status, same `code`, same message, same
    `params.missing`. That sameness is the feature, not laziness — the client
    renders both through one path (`detailToMessage`, frontend/lib/errors.js:151)
    and the checklist highlights `params.missing` without knowing which door
    the owner used. A variant here would be a second definition of "ready".

    The admin notification fires as a BackgroundTask, fail-open (MEH-1051 /
    MEH-977): a Meta/Resend outage or missing admin config must never affect
    the 200 the owner sees.
    """
    # MEH-2210 follow-up (CI reviewer on #3343): the cap check and the
    # `resubmission_count + 1` write are two ORM steps; two concurrent requests
    # from the same owner at count=2 both read 2 and both write 3, and the
    # business gets a 4th lifetime resubmission. FOR UPDATE serialises them on
    # the producer row for the length of this request (released at commit).
    producer = (
        db.query(Producer)
        .filter(Producer.id == user.producer_id)
        .with_for_update()
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2210: `rejected` is the second admitted status — the resubmit loop.
    # Fail-closed (MEH-1587 pattern): explicit membership, every other status
    # (draft / approved / inactive / anything unknown) stays 409.
    resubmitting = producer.status == "rejected"
    if producer.status != "pending" and not resubmitting:
        raise HTTPException(
            status_code=409,
            detail="ניתן לשלוח לבדיקה חוזרת רק כשבית העסק בהמתנה לאישור",
        )
    # MEH-2210: the cap is checked BEFORE the completeness gate — a business
    # that has used its three resubmissions is told so, not handed a list of
    # things to fix for a submission it cannot make.
    if resubmitting and producer.resubmission_count >= MAX_PRODUCER_RESUBMISSIONS:
        raise HTTPException(
            status_code=409,
            detail="הגעתן למספר השליחות המקסימלי — צרו איתנו קשר",
        )

    # MEH-2120: ordered AFTER the status check, matching submit_for_review — an
    # approved business asking for re-review is answered "you are already
    # decided" (409), not handed a completeness list it has no use for.
    missing = submission_missing_items(producer)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "submit_gate_incomplete",
                "message": "עוד לא הכול מוכן — יש להשלים את פריטי החובה לפני שליחה לבדיקה",
                "params": {"missing": missing},
            },
        )

    # REUSES: app/services/auth_notifications.py notify_admin_new_recipe pattern
    # (admin WhatsApp + email, fail-open). Lazy import mirrors the fire_alerts
    # style already used in this file.
    from app.services.auth_notifications import notify_admin_producer_resubmit

    if resubmitting:
        # MEH-2210: rejected → pending. The gate above already answered the
        # unverified-phone case with 422 (`missing=["phone_verified"]`), so the
        # target is always `pending` — `pending_whatsapp` was removed in
        # MEH-2124 and is not revived here (Phase 0 on the card, 03/09).
        # `rejection_reason` + `rejection_reason_code` are KEPT: they are the
        # admin's history and the queue shows "the prior reason" next to the
        # "שליחה חוזרת #n" badge. Only approve clears them.
        # Captured BEFORE the commit: the commit expires the ORM row, and every
        # later attribute read would be a lazy reload round-trip (CI reviewer
        # on #3333). The literals below are what was just written.
        new_count = producer.resubmission_count + 1
        producer_name = producer.name
        producer_city = producer.city
        producer.status = "pending"
        producer.resubmission_count = new_count
        producer.resubmitted_at = datetime.now(timezone.utc)
        db.commit()
        background_tasks.add_task(
            notify_admin_producer_resubmit,
            producer_name,
            producer_city,
            resubmission_count=new_count,
        )
        return {
            "detail": "נשלח לבדיקה חוזרת",
            "status": "pending",
            "resubmission_count": new_count,
        }

    background_tasks.add_task(
        notify_admin_producer_resubmit, producer.name, producer.city
    )
    return {"detail": "נשלח לבדיקה חוזרת"}


# ---------------------------------------------------------------------------
# MEH-2100: draft → submit for review
# ---------------------------------------------------------------------------


@router.post("/submit-for-review", status_code=200)
@limiter.limit("5/hour")
def submit_for_review(
    request: Request,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    """The owner declares her profile ready and hands it to the admin queue.

    This is the ONLY transition out of `draft` (MEH-2100). All three producer
    creation sites now write `draft`, so before this call the business is
    invisible to the review queue by construction — and the "בסקירה" banner
    plus the 3-business-day SLA both start HERE rather than at signup, which
    is the whole point of the ticket.

    Draft-only, mirroring the MEH-1236 request-review 409 directly above: a
    business already `pending` is in the queue (nothing to do), and one that
    is approved / rejected / inactive has been decided. A silent 200 on those
    would tell the owner something happened when nothing did.

    The gate is SERVER-SIDE and reads the SAME helper the dashboard checklist
    and the MEH-1818 nudge read (`submission_missing_items`), so the three can
    never drift into different definitions of "ready". A client that ignores
    the disabled CTA still gets 422 — the button state is an affordance, not
    the rule.

    The 422 body uses the MEH-1943 `{code, message, params}` shape, which buys
    two things at once: `detailToMessage` (frontend/lib/errors.js:151) renders
    `message` with no client change, and `params.missing` carries the
    machine-readable codes the checklist highlights.

    NOT gated here, deliberately: the producer LICENSE (MEH-971's
    license_pending path must still be able to reach the queue with a NULL
    license — it is an approve-time question) and OPENING HOURS (recommended,
    not required — Google precedent). Both remain enforced where they belong;
    see submission_gate.py's "Does NOT" header.
    """
    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    if producer.status != "draft":
        raise HTTPException(
            status_code=409,
            detail="אפשר לשלוח לבדיקה רק בית עסק שנמצא בטיוטה",
        )

    missing = submission_missing_items(producer)
    if missing:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "submit_gate_incomplete",
                "message": "עוד לא הכול מוכן — יש להשלים את פריטי החובה לפני שליחה לבדיקה",
                "params": {"missing": missing},
            },
        )

    producer.status = "pending"
    # tz-aware — the column is DateTime(timezone=True) and a naive utcnow here
    # would be silently wrong by the local offset (repo-wide constraint).
    producer.submitted_for_review_at = datetime.now(timezone.utc)

    # Snapshot BEFORE the commit, matching auth.py's two registration paths.
    # Reading producer.name/.city after commit() works — the attributes are
    # expired and lazily reloaded through the still-open request session — but
    # it reads as a different pattern from its siblings for no reason, and the
    # next person comparing them has to work out which one is deliberate.
    # (CI reviewer, #2979.) Same values either way; this is legibility, not a
    # bug fix.
    p_name = producer.name
    p_city = producer.city
    # MEH-2112: the owner's confirmation needs her address and the stamp that
    # was just written. Snapshotted here with the two above, for the same
    # reason — post-commit these attributes are expired and lazily reloaded,
    # which works but reads as a different pattern from its siblings.
    owner_email = user.email
    submitted_at = producer.submitted_for_review_at
    db.commit()

    # notify_admin_new_producer lives in services/auth_notifications.py. It
    # used to ALSO fire from auth.py at registration; MEH-2100 removed it from
    # there, because a fresh registration is a draft and the ping's own
    # "לאישור: /admin" link pointed at a queue the business was not in. This
    # is now its ONLY caller — the moment the ping is actually actionable.
    # (The comment here previously cited auth.py:632, which the same diff had
    # already deleted — a REUSES pointer to code that no longer exists. CI
    # reviewer, #2979.)
    # Post-commit BackgroundTask, fail-open (MEH-1051 / MEH-977):
    # a Resend/Meta outage must never turn the owner's successful submission
    # into an error, and post-commit placement mirrors _maybe_fire_review_ready
    # so the admin is never pinged about a transition that failed to persist.
    background_tasks.add_task(notify_admin_new_producer, p_name, p_city)
    # MEH-2112: the owner-facing half of the same moment. Post-commit and
    # fail-open on the identical grounds as the admin ping above — she has
    # already been told on screen that the profile was sent, and a Resend
    # outage must not retract that.
    #
    # Placed AFTER the 409/422 raises above, which is what keeps the promise
    # honest: this fires only on the real draft→pending transition, never on a
    # rejected re-submit and never on MEH-1236's request-review ping (a
    # different endpoint entirely, untouched).
    background_tasks.add_task(
        send_submission_confirmation, owner_email, p_name, submitted_at
    )
    return {"detail": "הפרופיל נשלח לבדיקה"}


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


def _sync_producer_city_from_primary(db: Session, producer_id: UUID) -> None:
    """MEH-2141 (MEH-1938 batch B2) — write `Producer.city` through from the
    primary location, in the caller's open transaction.

    ## Why this exists

    Chunk 4 deleted the dashboard's "מיקום על המפה" card, which was the owner's
    only editor for `Producer.city`. The CI reviewer flagged the gap on that
    PR: an owner who moves her primary location to another town now has no way
    to correct the city that the listing filter, the free-text search, the
    `/producers/cities` aggregation, the admin search, `rank_in_city` and the
    two admin notification emails all read. Fourteen readers, and none of them
    has an equivalent in `producer_locations` — which is why the column stays
    and is written THROUGH rather than dropped.

    Interim derived, NOT Contract. Chunk 5 is what makes `city` fully derived,
    and it is blocked on the release card. Nothing here removes a column,
    changes a schema, or touches `lat`/`lng`.

    ## Two things it deliberately does NOT do

    **It never writes NULL.** If there is no primary row, or the primary row
    carries no city, the column keeps its last value. A NULL here is not a
    neutral "unknown" — it drops the business out of `?city=` filtering and
    out of the region picker, and it renders as a blank line in the admin
    emails. `ProducerLocation.city` is `str | None` (schemas.py:1090), so this
    is a reachable state, not a theoretical one.

    **It is not called on every mutation.** The callers below invoke it only
    when the operation changed WHICH row is primary, or changed the primary
    row's own city. That precision is what keeps admin authority intact —
    see the precedence note below.

    ## Precedence: admin wins, and nothing here contests it

    `admin.py` writes `Producer.city` directly (the create path's explicit
    `city=data.city`, and the PUT's `setattr` loop over `ProducerUpdate`).
    That write is NOT wrapped, NOT mirrored and NOT reverted by this function.
    The two paths coexist because they are triggered by different events: an
    admin edit sets the column and no owner location changed, so this function
    never runs; an owner moves her primary location and this function sets the
    column from that row. The one ordering that overwrites an admin value is
    an owner moving her primary AFTER the admin edit — which is the correct
    outcome, because at that point the owner's own primary location is the
    fresher statement of where the business is.

    # DO NOT call this from a non-primary mutation. Doing so would re-derive
    # the column on an edit that says nothing about it, and would silently
    # revert an admin's `city` the next time an owner edited an unrelated
    # pickup point's phone number.
    """
    # `SessionLocal` is built with autoflush=False (database.py:107), so a
    # promotion the caller has only assigned on the ORM instance
    # (`loc.is_primary = True`, `replacement.is_primary = True`) is NOT visible
    # to the query below until it is flushed. Without this line the query finds
    # NO primary at all — the previous one was demoted by a bulk UPDATE that
    # did hit the database, the new one is still pending in the session — and
    # the function returns early, leaving the city on the OLD location.
    #
    # That is not a hypothesis: the promote and delete-primary tests failed
    # exactly this way before this flush was added, and they are the two that
    # would have shipped the bug.
    #
    # Flushing here rather than at each call site keeps the helper correct
    # regardless of what the caller has or has not flushed. The caller still
    # owns the COMMIT.
    db.flush()

    primary = (
        db.query(ProducerLocation)
        .filter(
            ProducerLocation.producer_id == producer_id,
            ProducerLocation.is_primary.is_(True),
        )
        .order_by(ProducerLocation.created_at.asc())
        .first()
    )
    if primary is None:
        return
    if not primary.city or not primary.city.strip():
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return
    producer.city = primary.city.strip()


def _has_primary_location(db: Session, producer_id: UUID) -> bool:
    return (
        db.query(ProducerLocation.id)
        .filter(
            ProducerLocation.producer_id == producer_id,
            ProducerLocation.is_primary.is_(True),
        )
        .first()
        is not None
    )


def _snapshot_location_signal(db: Session, producer_id: UUID) -> dict:
    """MEH-2073 chunk 2 — read what the admin ping compares against, BEFORE the
    handler mutates anything.

    Same idiom as `_snapshot_sensitive` on the owner PUT: plain values, not ORM
    references, so the comparison survives the `db.commit()` that expires every
    instance in the session.

    Two entries, because the locations CRUD carries two admin-visible events
    that the PUT path never could:

    - `city` — since MEH-2141 (batch B2) `Producer.city` follows the primary
      location row, so the owner's real city editor is this CRUD and not the
      PUT. `city` left SENSITIVE_FIELDS with its PUT write path under MEH-1938
      chunk 5a ruling A; this is where the ping it used to fire now lives.
    - `has_primary` — deleting the LAST location is allowed and leaves the
      business approved with no primary row: no pin on the map and nothing to
      submit. Sapir's ruling (02/09 evening) makes that visible rather than
      blocked, which is exactly this card's notification-only posture.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return {}
    return {
        "city": producer.city,
        "has_primary": _has_primary_location(db, producer_id),
    }


def _maybe_fire_location_signal(
    background_tasks, db: Session, producer_id: UUID, before: dict
) -> None:
    """MEH-2073 chunk 2: one ping per request, AFTER the commit, listing the
    location-side changes that actually happened.

    Compares the persisted city rather than "did this request carry a city":
    LocationsEditor posts the whole row on every save, so a resubmitted
    identical city must not ping. Same distinction between signal and noise the
    chunk-1 no-op case pins down.

    `has_primary` is only ever reported in the true -> false direction. Gaining
    a primary is the normal course of registration and of adding a first
    location, and says nothing an admin needs to act on.

    Fail-open and notification-only, unchanged from chunk 1: the task is
    `_sensitive_edit_task`, which swallows and logs, so nothing here can turn
    a saved location into an error the owner cannot act on.
    """
    if not before:
        return
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if producer is None:
        return
    changed: list[str] = []
    if before.get("city") != producer.city:
        changed.append("city")
    if before.get("has_primary") and not _has_primary_location(db, producer_id):
        changed.append("primary_location_removed")
    _fire_sensitive_edit(background_tasks, producer, changed)


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
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    # MEH-2073 chunk 2: snapshot before any mutation — adding a location that
    # becomes primary re-derives Producer.city, which is an identity change the
    # admin hears about when the business is already approved.
    signal_before = _snapshot_location_signal(db, user.producer_id)
    _reject_same_city_without_label(db, user.producer_id, data.city, data.label)
    existing_count = (
        db.query(ProducerLocation)
        .filter(ProducerLocation.producer_id == user.producer_id)
        .count()
    )
    loc = ProducerLocation(producer_id=user.producer_id, **data.model_dump())

    # MEH-1938 follow-up (Sapir, 02/09) — branch-only primaries are enforced
    # HERE too, not only on the update path. A rule that the create path can
    # mint around is text in the code with a hole beside it, and this endpoint
    # is where the pickup-primary on staging actually came from: the seed was
    # not an outlier, it exercised behaviour the API had all along.
    #
    # The two cases are deliberately different, and must not be collapsed:
    #
    #   1. An EXPLICIT is_primary=true on a non-branch is refused. The schema
    #      defaults it to False (schemas.py:1202), so True here can only have
    #      come from the body — she asked for something the model forbids and
    #      is told so.
    #   2. A first location that happens to be a non-branch is CREATED, just
    #      not force-primary. Silent and correct: this is the delivery-only
    #      owner adding her only pickup point, and per MEH-213 she legitimately
    #      has no pin at all. Refusing her would block a valid business shape.
    if loc.is_primary and loc.kind != "branch":
        raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH)

    # Single-primary: the first BRANCH is primary; an explicit is_primary=true
    # on a later one clears the existing primary. A producer whose only rows
    # are pickups / market stands therefore has no primary — see case 2 above.
    if existing_count == 0 and loc.kind == "branch":
        loc.is_primary = True
    db.add(loc)
    db.flush()  # assign loc.id before clearing siblings
    if loc.is_primary:
        _clear_other_primaries(db, user.producer_id, loc.id)
        # MEH-2141: the primary changed (first location, or an explicit
        # is_primary=true that just demoted the previous one), so the city the
        # 14 readers see is re-derived from it. Gated on `is_primary` rather
        # than run unconditionally: adding a SECOND, non-primary pickup point
        # says nothing about where the business is.
        _sync_producer_city_from_primary(db, user.producer_id)
    db.commit()
    db.refresh(loc)
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)
    return loc


@router.put("/locations/{location_id}", response_model=ProducerLocationOwnerOut)
@limiter.limit("60/hour")
def update_my_location(  # noqa: PLR0913 — all 6 args are FastAPI-injected (slowapi request, path id, body, BackgroundTasks, auth dep, db dep); MEH-2073 chunk 2 added the notify hop
    # REUSES: backend/app/routers/producer_recipes.py:231 — same handler
    # shape, same waiver, same reason (a DI signature is not complexity).
    request: Request,
    location_id: UUID,
    data: ProducerLocationUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    # MEH-2073 chunk 2 — see create_my_location above. Both the promote path
    # and a city edit on the row that is already primary move Producer.city.
    signal_before = _snapshot_location_signal(db, user.producer_id)
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
        # MEH-1938 follow-up (Sapir, 02/09): promotion is BRANCH-ONLY, and this
        # is a NEW constraint rather than a description of what was here. A
        # primary answers "where is the business" — the navigation target and
        # the pin. `market_stand` is excluded along with `pickup` because the
        # repo already classifies both as the SECONDARY layer, hidden by the
        # /map toggle, in four identical call sites (MEH-1412:
        # producerPoints.js:28, MiniMap.jsx:70, MapComponent.jsx:375,
        # DeliveryBlock.jsx:468). A primary whose own marker disappears under a
        # layer toggle is a third answer to a question that must have one.
        if loc.kind != "branch":
            raise HTTPException(status_code=422, detail=PRIMARY_MUST_BE_BRANCH)
        _clear_other_primaries(db, user.producer_id, loc.id)
        loc.is_primary = True
    elif want_primary is False and loc.is_primary:
        # Can't directly demote the sole primary (that would leave zero) — the
        # owner promotes another location instead (which clears this one).
        raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED)

    # MEH-2141: re-derive `Producer.city` on exactly two events — this row was
    # just PROMOTED to primary (the primary's identity changed), or this row is
    # ALREADY primary and the patch carried a city (the primary's city changed).
    #
    # Read `loc.is_primary` AFTER the block above, not the pre-patch value: a
    # promotion sets it two lines up, and the demotion arm raises rather than
    # falling through. Every other edit — a phone on the primary, anything at
    # all on a non-primary row — leaves the column alone, which is what keeps
    # an admin-set city from being reverted by an unrelated owner edit.
    if want_primary is True or (loc.is_primary and "city" in patch):
        _sync_producer_city_from_primary(db, user.producer_id)

    db.commit()
    db.refresh(loc)
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)
    return loc


@router.delete("/locations/{location_id}", status_code=204)
def delete_my_location(
    location_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
):
    # MEH-2073 chunk 2: deleting the last remaining row is ALLOWED and leaves
    # the business approved with no primary location — no pin on the map, and
    # nothing to submit. Snapshot here so the post-commit check can see the
    # true -> false edge on `has_primary` (Sapir's ruling, 02/09 evening).
    signal_before = _snapshot_location_signal(db, user.producer_id)
    loc = _get_owned_location(db, user.producer_id, location_id)

    # MEH-1938 follow-up (Sapir, 02/09): the system does not guess which
    # location becomes primary — the OWNER chooses. This used to promote the
    # oldest surviving row automatically, with no kind filter, so deleting a
    # branch could silently make a pickup point the business's navigation
    # target. Industry precedent for refusing instead: Shopify will not let you
    # deactivate the default location (change the default first), and Google
    # Business does the same for the primary address.
    #
    # 422 and not 409, deliberately: this is the SAME invariant as the demote
    # arm above, seen from the other side, so it answers with the same status
    # and the same message key. Two codes for one violation would itself be a
    # third answer.
    if loc.is_primary:
        others_remain = (
            db.query(ProducerLocation.id)
            .filter(
                ProducerLocation.producer_id == user.producer_id,
                ProducerLocation.id != loc.id,
            )
            .first()
            is not None
        )
        if others_remain:
            raise HTTPException(status_code=422, detail=ONE_PRIMARY_REQUIRED)

    # Deleting the LAST remaining location is allowed and leaves no primary.
    # The business stays approved but is unpinned and cannot submit — STRICT
    # makes that visible rather than papering over it. `Producer.city` KEEPS
    # its last value rather than going NULL: the 17 readers depend on it, and
    # _sync_producer_city_from_primary declines on no-primary anyway, so it is
    # deliberately not called here.
    #
    # The admin ping for this event IS built — MEH-2073 chunk 2 landed on
    # staging while this branch was open, and its snapshot/fire pair now
    # brackets this handler. Note what the refusal above means for it: a
    # rejected delete promotes nothing and moves no city, so it must ping
    # nothing either. That is asserted, not assumed.
    db.delete(loc)
    db.commit()
    _maybe_fire_location_signal(background_tasks, db, user.producer_id, signal_before)
