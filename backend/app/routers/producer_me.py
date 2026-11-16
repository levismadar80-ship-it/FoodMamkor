from datetime import timedelta
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import func, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.limits import enforce_cap
from app.auth import require_producer
from app.database import get_db
from app.rate_limit import limiter
from app.services.availability_validation import (
    AvailabilityValidationError,
    resolve_vacation_until,
    validate_transition,
)
from app.utils.clock import utc_now
from app.models import (
    DeliveryArea,
    Favorite,
    Producer,
    Product,
    ProducerOffer,
    ProducerWhatsAppClick,
    User,
)
import logging

from app.schemas.schemas import (
    WRITABLE_AVAILABILITY_STATES,
    clean_display_city,
    AvailabilityStateUpdate,
    BioGenerateIn,
    ProducerOwnerOut,
    ProducerUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
)
from app.services.auth_notifications import (
    notify_admin_producer_review_ready,
    notify_admin_producer_sensitive_edit,
)
from app.services import indexnow  # MEH-2852
from app.services.owner_attention import owner_attention  # MEH-3108
from app.services.gallery_cap import assert_free_gallery_cap  # MEH-3220
from app.services.phone_reverify import reset_verification_if_phone_changed  # grill B8
from app.services.submission_gate import (
    attach_upcoming_events_count,
)
from app.services.delivery_validation import (
    ensure_exclusion_requires_nationwide,
    ensure_nationwide_requires_delivery,
)
from app.services.farmer_declaration import apply_farmer_declaration_on_update
from app.services.license_validation import (
    categories_require_license,
    enforce_license_gate_on_update,
)

log = logging.getLogger(__name__)

router = APIRouter(prefix="/producers/me", tags=["producer-management"])


@router.get("", response_model=ProducerOwnerOut)
def get_my_producer(
    user: User = Depends(require_producer), db: Session = Depends(get_db)
) -> ProducerOwnerOut | Producer:
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
    attach_upcoming_events_count(producer)  # MEH-2460
    return producer


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]) -> None:
    """Replace all delivery areas for this producer with the given city list."""
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        if city:
            db.add(DeliveryArea(producer_id=producer.id, city=city))


def _sync_delivery_areas(
    db: Session,
    producer: Producer,
    delivery_rows: list[dict[str, Any]] | None,
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
        _apply_delivery_cities(db, producer, cast(list[str], delivery_cities))
        sent_cities = cast(list[str], delivery_cities)
    return [c for c in sent_cities if c and c not in existing_cities]


def _apply_delivery_rows(
    db: Session, producer: Producer, rows: list[dict[str, Any]]
) -> None:
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


def _sync_active_offer(
    db: Session, producer: Producer, offer: dict[str, Any] | None
) -> None:
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
        row.is_active = False  # type: ignore[assignment]
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


# MEH-1351: approvability = the admin approve gate's definition, REUSED not
# reimplemented — ≥1 image (MEH-799) AND license present when the categories
# require one (MEH-971). Keep in sync with admin.py:approve_producer.
def _is_approvable(db: Session, producer: Producer) -> bool:
    if not producer.images:
        return False
    category_ids = [c.id for c in producer.categories]
    license_missing = not (producer.producer_license_number or "").strip()
    return not (categories_require_license(db, category_ids) and license_missing)


def _pending_and_approvable(db: Session, producer: Producer) -> bool:
    return producer.status == "pending" and _is_approvable(db, producer)  # type: ignore[return-value]


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
#
# MEH-2626: `whatsapp_group` (the WhatsApp updates link) joined — it goes live
# on the public page the moment it is saved, and a swapped link sends every
# visitor who taps it to a different group or channel.
SENSITIVE_FIELDS = frozenset(
    {
        "phone",
        "vegan_scope",
        "vegetarian_scope",
        "gluten_free_facility",
        "whatsapp_group",
        # MEH-3339 (review): the second number is a live public tel: link, the
        # same reason whatsapp_group is here — a swapped one sends visitors to
        # a different number, and it skips phone verification by design.
        "secondary_phone",
    }
)


def reconcile_secondary_phone(producer: Producer, payload: dict[str, Any]) -> None:
    """MEH-3339 (review): the number/label pair is judged on the MERGED state,
    not on the payload alone, before the setattr loop of either PUT.

    - the number ends up empty → the label is cleared with it (no orphan label
      that a later number would resurrect);
    - a label ends up with no number → 422.
    So each field may travel on its own: a label-only save is fine while a
    number is stored, and the admin form need not resend a number it did not
    change (which would revert the owner's own edit).
    """
    if "secondary_phone" not in payload and "secondary_phone_label" not in payload:
        return
    number = payload.get("secondary_phone", producer.secondary_phone)
    label = payload.get("secondary_phone_label", producer.secondary_phone_label)
    if not number:
        if "secondary_phone_label" in payload and label:
            raise HTTPException(
                status_code=422, detail="לתווית של הטלפון הנוסף צריך גם מספר"
            )
        payload["secondary_phone_label"] = None


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

# MEH-1943 chunk 1: `{code, message, params}` (the MEH-1164 / MEH-1940 shape).
# `message` is the approved sentence above, word for word, so a consumer that
# still renders `detail.message` shows exactly what it showed before; the
# frontend maps the `code` to settings.locations.errors.<code> (he + en).
ONE_PRIMARY_REQUIRED_DETAIL = {
    "code": "one_primary_required",
    "message": ONE_PRIMARY_REQUIRED,
    "params": {},
}
PRIMARY_MUST_BE_BRANCH_DETAIL = {
    "code": "primary_must_be_branch",
    "message": PRIMARY_MUST_BE_BRANCH,
    "params": {},
}


def _test_cause(producer: Producer, actor: User | None = None) -> bool:
    """MEH-2952: the business, or the account acting on it, is a test row."""
    return bool(
        producer.is_test or (actor is not None and getattr(actor, "is_test", False))
    )


def _snapshot_sensitive(producer: Producer) -> dict[str, Any]:
    """Read the sensitive fields BEFORE the setattr loop mutates them.

    Mirrors the `was_approvable` idiom above: the comparison has to happen
    against values captured on a row read under the same advisory lock
    (MEH-2007), or two overlapping PUTs can each miss the other's write.
    """
    return {field: getattr(producer, field, None) for field in SENSITIVE_FIELDS}


def _maybe_fire_sensitive_edit(
    background_tasks: BackgroundTasks,
    producer: Producer,
    before: dict[str, Any],
    actor: User | None = None,
) -> None:
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
        actor=actor,
    )


def _fire_sensitive_edit(
    background_tasks: BackgroundTasks,
    producer: Producer,
    changed: list[str],
    actor: User | None = None,
) -> None:
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
    background_tasks.add_task(
        _sensitive_edit_task,
        producer.name,  # type: ignore[arg-type]
        changed,
        # MEH-2952: the business, or the owner account that made the edit
        # (`actor`, when the caller has it), is a test row.
        test_cause=_test_cause(producer, actor),
    )


def _sensitive_edit_task(
    producer_name: str, changed: list[str], test_cause: bool = False
) -> None:
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
        notify_admin_producer_sensitive_edit(
            producer_name, changed, test_cause=test_cause
        )
    except Exception:  # noqa: BLE001 — fire-and-forget; the 200 is already out
        log.exception(
            "[NOTIFY] sensitive-edit ping failed for '%s' (fields=%s)",
            producer_name,
            changed,
        )


def _maybe_fire_review_ready(
    background_tasks: BackgroundTasks,
    db: Session,
    producer: Producer,
    was_approvable: bool,
    actor: User | None = None,
) -> None:
    """MEH-1351: review-ready ping on the false→true approvability transition
    of a pending producer (first image / license completed). Fire-and-forget
    BackgroundTask mirroring the resubmit ping's contract; the transition
    check (not a sent-flag) is the idempotency guard — no schema change."""
    if not was_approvable and _pending_and_approvable(db, producer):
        background_tasks.add_task(
            notify_admin_producer_review_ready,
            producer.name,  # type: ignore[arg-type]
            producer.city,  # type: ignore[arg-type]
            test_cause=_test_cause(producer, actor),  # MEH-2952
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


# MEH-2911: Sapir-approved copy, verbatim (10/11). The owner reads this
# string, so rule 22 makes it hers — do not reword it, and do not
# paraphrase it in a test. `frontend/messages/he.json`
# (`dashboard.producer.images.last_photo`) carries the same sentence for
# the inline message next to the remove button, and
# tests/test_meh2911_last_photo_guard.py asserts the two are identical so
# the pair cannot drift (workflow.md smell #1).
LAST_PHOTO_REMOVAL_CODE = "last_photo_required"
LAST_PHOTO_REMOVAL_MESSAGE = (
    "אי אפשר להסיר את התמונה האחרונה. הוסיפו תמונה אחרת, ואז הסירו את זו."
)

# MEH-2911: the statuses the guard covers. `inactive` is here because a
# reviewer measured the bypass it leaves open otherwise: an admin toggles
# approved -> inactive, the owner empties the gallery through this route,
# and the admin toggles back — and `toggle_producer_status` (admin.py)
# re-approves WITHOUT running `_assert_approvable`, so the business is
# live again with no photo. Sapir's ruling named "approved"; this widens
# it by one status to close that chain at the owner's end, which costs an
# inactive business nothing (it is not public, and it can still REPLACE
# its photo). The toggle's own missing gate is the root cause and is
# filed as MEH-2945 — this does not fix it.
LAST_PHOTO_GUARDED_STATUSES = frozenset({"approved", "inactive"})


def _assert_keeps_a_photo(
    producer: Producer, payload: dict[str, Any], old_images: list[Any]
) -> None:
    """An APPROVED business may not remove its last gallery photo.

    MEH-2911, Sapir's ruling (10/11) on the hole MEH-2907's reviewer
    measured: an already-approved business could PUT `{"images": []}`, get
    200, and stay live with an empty gallery.
    `ProducerUpdate._validate_images` checks URL shape only, never
    non-emptiness, and the approve-time gate (MEH-799,
    `admin.py::_assert_approvable`) deliberately "lives at the moment of
    approval" — so nothing re-checked afterwards. This is the owner-route
    half of the same invariant.

    DO NOT change `status` here. Option (ג), demoting the business back to
    `pending`, was rejected explicitly: refuse the removal, keep the row.

    Only `approved`, deliberately. A draft or pending business may still
    empty its gallery — the submit gate and the approve gate are where
    that is caught for those, and widening this would change behaviour the
    ruling did not cover.

    `old_images` is load-bearing, not defensive: a legacy approved row
    whose gallery is ALREADY empty has no last photo to remove, and
    without that clause such an owner could not save any field at all.

    Extracted rather than inlined because the condition pushed
    `update_my_producer` past ruff's C901 ceiling (11 > 10), which is an
    error in this repo — a per-file ignore would have been removing a
    constraint to fit a change (workflow rule 32).
    """
    if (
        producer.status in LAST_PHOTO_GUARDED_STATUSES
        and "images" in payload
        and not payload["images"]
        and old_images
    ):
        # MEH-1943 shape, deliberately, and not a bare string: the client
        # has to recognise this refusal to render it next to the remove
        # button rather than at the card foot, and comparing a HEBREW
        # sentence in JS is both fragile and broken on /en — there the
        # client's own copy is English, so the comparison can never match
        # and an English-locale owner would be shown the raw Hebrew.
        # `detailToMessage` (frontend/lib/errors.js) already renders
        # `message` unchanged, so the copy is unaffected.
        raise HTTPException(
            status_code=422,
            detail={
                "code": LAST_PHOTO_REMOVAL_CODE,
                "message": LAST_PHOTO_REMOVAL_MESSAGE,
                "params": {},
            },
        )


def _lock_producer_updates(db: Session, producer_id: UUID) -> None:
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


def _resolve_top_product(
    db: Session, producer: Producer, payload: dict[str, Any]
) -> None:
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


def _apply_organizer_city(producer: Producer, raw: Any) -> bool:
    """MEH-2475: write an organizer's display city under the registration rule
    (`clean_display_city`: bleach, 100 chars, ≥1 letter). A blank or
    letterless value is refused rather than stored — the page shows the city
    line and registration requires one. Returns whether the city changed, so
    the caller can ping the admin for an approved organizer (review #3728)."""
    try:
        city = clean_display_city(raw)
    except ValueError:
        raise HTTPException(status_code=422, detail="יש לבחור עיר") from None
    changed = city != (producer.city or "")
    producer.city = city  # type: ignore[assignment]
    return changed


@router.put("", response_model=ProducerOwnerOut)
@limiter.limit("30/hour")
def update_my_producer(
    request: Request,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProducerOwnerOut | Producer:
    # MEH-2007: held until this request's commit, so the snapshot below and the
    # write it is compared against are one atomic unit against another PUT on
    # this producer. Deliberately above the load — see the helper's docstring
    # for why after-the-load is not a weaker fix but a non-fix.
    _lock_producer_updates(db, user.producer_id)  # type: ignore[arg-type]

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
        # MEH-3339: the optional second number + label (no CTA reads them).
        "secondary_phone",
        "secondary_phone_label",
        "instagram",
        "website",
        "whatsapp_group",
        # MEH-1676: the owner's opt-out for the public coverage CTA.
        "coverage_cta_enabled",
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
        # «עסק של מילואימניקים»: owner declares; editor = ReservistOwnedCard.jsx.
        "reservist_owned",
        # MEH-1508 ch2: owner declares business-level dietary scope. Values are
        # enum-validated in ProducerUpdate (schemas.py); this opens the write path.
        "vegan_scope",
        "vegetarian_scope",
        "gluten_free_facility",
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
        #   (price alias)        → the second, older price string that used to
        #                          sit beside `price_range` was closed here by
        #                          MEH-1851 and then DROPPED outright by
        #                          MEH-1855 chunk 2 (revision 9849fab1637a) —
        #                          `price_range` (PricingCard) is the only
        #                          price-label field now. Its registry row went
        #                          with the column (data_ownership.py).
        #   is_available_today   → nothing writes it any more. MEH-2271 made
        #                          `availability_state` the sole written column
        #                          and the legacy pair a derived view, so the
        #                          desync this row was blocking a raw PUT from
        #                          creating is no longer reachable. The
        #                          column's removal is MEH-2273, not this.
        # MEH-2521: two more closed, same reason — no owner editor exists:
        #   organic_certified    → no owner UI writes it, and its public badge
        #                          was removed by MEH-1259 — no surface renders it.
        #   has_delivery         → superseded by delivery areas
        #                          (offers_delivery + delivery_areas /
        #                          delivery_nationwide); column drop is MEH-1850.
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
        #                          LEGACY(2026-11-30, MEH-1938) and its removal
        #                          is the contract step.
        # MEH-1543: owner-editable weekly order-acceptance window. Validated in
        # ProducerUpdate (day keys, HH:MM 24h, close>open). Explicit null in the
        # body clears it (present-but-None flows through model_dump(exclude_unset)
        # and setattr sets the column to NULL).
        "order_window",
        # MEH-1889 chunk B (MEH-2264): per-date overrides ABOVE order_window,
        # order-axis authoritative. Chunk A shipped the column + validator and
        # deliberately left this line out, so a body carrying `special_hours`
        # was validated and then ignored; chunk B opens the write path in the
        # SAME PR as the dashboard editor (SpecialHoursEditor.jsx) and the
        # guidance-audit row the ratchet demands — the standing rule the
        # `kosher` block below states. Validated in ProducerUpdate: date keys,
        # `ranges` via _validate_order_day (reused verbatim), `[]` = closed,
        # `note` display-only, and dates older than today-30 rejected (Sapir's
        # ruling ג). Explicit null clears it, same as order_window.
        "special_hours",
        # MEH-3035 chunk 2: how the business takes payment. Chunk 1 shipped the
        # column + _payment_info_validator; the write path opens here in the
        # SAME PR as its editor (PaymentInfoEditor.jsx) and guidance-audit row,
        # per the standing rule above. Explicit null clears it.
        "payment_info",
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
        #            "I wrote it and it is not displayed" class as the price
        #            alias MEH-1855 retired.
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

    enforce_license_gate_on_update(db, producer, payload, category_ids)
    # MEH-3137: moving into ירקות/פירות needs the grower declaration once.
    # Written onto the row here; a later 422 rolls it back with everything else.
    apply_farmer_declaration_on_update(
        db, producer, category_ids, payload.pop("farmer_declaration_accepted", False)
    )
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
    old_phone: str | None = producer.phone  # type: ignore[assignment]  # grill B8

    # MEH-2475: an ORGANIZER's city. `city` stays out of the set above for a
    # business (ruling A: its city follows the primary location row, and a PUT
    # would be a second writer racing that sync). An organizer has no location
    # rows at all (MEH-2460), so for her this PUT is the only writer, and its
    # editor ships in the same PR (OrganizerCityCard.jsx) — the standing rule
    # the blocks above state.
    organizer_city_changed = (
        producer.kind == "organizer"
        and "city" in payload
        and _apply_organizer_city(producer, payload["city"])
    )

    # MEH-2911: raised BEFORE the setattr loop, so the whole PUT is refused
    # rather than half-applied. See the helper for the ruling it enforces.
    _assert_keeps_a_photo(producer, payload, old_images)
    # MEH-3220: the free-plan 3-photo cap belongs to the gallery write.
    assert_free_gallery_cap(producer, payload, old_images)

    reconcile_secondary_phone(producer, payload)  # MEH-3339
    for field, value in payload.items():
        if field in _PRODUCER_WRITABLE_FIELDS:
            setattr(producer, field, value)

    # Grill B8: a new WhatsApp number is not a verified one (MEH-745).
    reset_verification_if_phone_changed(db, producer, payload, old_phone)

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
            producer.images or [],  # type: ignore[arg-type]
            context="producer_me.update_my_producer images",
            db=db,  # MEH-3247
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
            producer.id,  # type: ignore[arg-type]
            "delivery_area",
            AlertContent(
                title=f"🚚 משלוחים חדשים: {producer.name}",
                body="עכשיו מגיעים גם ל: {cities}",
                url=f"/producer/{producer.id}",
            ),
            new_cities,
        )
        # MEH-2618: the no-account sibling of the alert above — everyone who
        # left «תודיעו לי כשתגיעו ל{עיר}» for one of these cities gets her
        # one email. Called through the module so tests can patch it.
        from app.services import delivery_waitlist

        background_tasks.add_task(
            delivery_waitlist.notify_cities,
            db,
            producer.id,  # type: ignore[arg-type]
            new_cities,
        )

    _maybe_fire_review_ready(background_tasks, db, producer, was_approvable, actor=user)
    # MEH-2073: notification only — runs after the commit above, adds a
    # BackgroundTask, and touches neither the response nor any column.
    _maybe_fire_sensitive_edit(background_tasks, producer, sensitive_before, actor=user)
    # MEH-2475 (review #3728): an approved organizer moving her city is the same
    # admin-visible event as a business moving its primary location (the
    # locations CRUD pings "city" through the same gate).
    if organizer_city_changed:
        _fire_sensitive_edit(background_tasks, producer, ["city"], actor=user)
    # MEH-2852: the public profile changed — tell IndexNow (production only).
    indexnow.schedule_public_producer(background_tasks, producer)

    attach_upcoming_events_count(producer)  # MEH-2460
    return producer


# MEH-2758 (MEH-2757 chunk 1): the two legacy availability write paths
# (POST /availability, POST /availability-status — MEH-291, LEGACY MEH-1854)
# are deleted. No frontend called either, and both could still write
# `available_today` / `full_this_week`, which MEH-2782 later removed.
# POST /availability-state below is the only availability write endpoint.


@router.post("/availability-state", response_model=None)
@limiter.limit("20/hour")
def set_availability_state(
    request: Request,
    data: AvailabilityStateUpdate,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    # Value membership stays a 400 before the DB hit (preserves existing
    # contract); the transition + return-date guards run against the
    # producer's current state below (AUD-039/040).
    # MEH-2758: pause-only — the read-side enum is wider than what may be written.
    if data.state not in WRITABLE_AVAILABILITY_STATES:
        raise HTTPException(
            status_code=400,
            # MEH-1943 chunk 2: the allowed set moves to params, never the message.
            detail={
                "code": "invalid_availability_state",
                "message": "מצב לא תקין",
                "params": {"allowed": list(WRITABLE_AVAILABILITY_STATES)},
            },
        )

    producer = db.query(Producer).filter(Producer.id == user.producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    try:
        validate_transition(producer.availability_state, data.state)  # type: ignore[arg-type]
        vacation_until = resolve_vacation_until(data.state, data.vacation_until)
    except AvailabilityValidationError as e:
        # value violation → 400; missing/past return date → 422.
        raise HTTPException(
            status_code=400 if e.kind == "value" else 422, detail=str(e)
        ) from e

    # MEH-2271: one column. The dual-write to is_available_today +
    # availability_status is gone — ProducerListOut derives both from this
    # value, so writing them here would be a second authority over one fact.
    producer.availability_state = data.state  # type: ignore[assignment]
    producer.vacation_until = vacation_until  # type: ignore[assignment]
    producer.last_active_at = utc_now()  # type: ignore[assignment]
    db.commit()
    return {
        "availability_state": producer.availability_state,
        "vacation_until": producer.vacation_until.isoformat()
        if producer.vacation_until
        else None,
    }


@router.get("/dashboard", response_model=None)
def dashboard(
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
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

    # feature/producer-analytics: real counts from producer_whatsapp_clicks.
    week_ago = utc_now() - timedelta(days=7)
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
            # MEH-291 — durable 4-value enum, the only one written.
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
        "attention": owner_attention(db, producer.id, user.id),  # type: ignore[arg-type]  # MEH-3108
    }


# ---------------------------------------------------------------------------
# MEH-51: Phone verification (WhatsApp OTP)
# ---------------------------------------------------------------------------


OTP_NOT_SENT = "לא הצלחנו לשלוח את הקוד בוואטסאפ כרגע. נסו שוב בעוד כמה דקות."


# ---------------------------------------------------------------------------
# MEH-56: AI bio generator
# ---------------------------------------------------------------------------


@router.post("/bio/generate", response_model=None)
@limiter.limit("5/hour")
def generate_bio_endpoint(
    request: Request,
    body: BioGenerateIn,
    user: User = Depends(require_producer),
) -> dict[str, Any]:
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
) -> list[ProductOut] | list[Product]:
    return db.query(Product).filter(Product.producer_id == user.producer_id).all()


@router.post("/products", response_model=ProductOut, status_code=201)
@limiter.limit("60/hour")
def create_my_product(
    request: Request,
    data: ProductCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> ProductOut | Product:
    # MEH-3022: per-business cap (app/limits.py).
    enforce_cap(
        db.query(Product).filter(Product.producer_id == user.producer_id).count(),
        "products",
    )
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
        user.producer_id,  # type: ignore[arg-type]
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
) -> ProductOut | Product:
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
@limiter.limit("60/hour")  # MEH-3022
def delete_my_product(
    request: Request,  # required by slowapi (MEH-3022)
    product_id: UUID,
    user: User = Depends(require_producer),
    db: Session = Depends(get_db),
) -> None:
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

        destroy_image(
            old_image_url,  # type: ignore[arg-type]
            context="producer_me.delete_my_product image",
            db=db,  # MEH-3247
        )
