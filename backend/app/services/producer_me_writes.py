"""
Module:   producer_me_writes
Purpose:  The owner PUT /producers/me write helpers — delivery areas, the
          active offer, the second phone, the gallery rules, the per-producer
          advisory lock, the featured product and an organizer's city.
Touches:  delivery_areas, producer_offers, products (read), pg advisory lock.
Does NOT: route, authorize or commit — `routers/producer_me.py` does, and it
          keeps the writable-field whitelist and the admin-ping chain (tests
          read the whitelist from that file's text and patch the ping names on
          that module).
Related:  backend/app/routers/producer_me.py::update_my_producer ·
          backend/app/routers/admin.py (reconcile_secondary_phone,
          _apply_delivery_rows).
History:  MEH-3569 (moved verbatim from routers/producer_me.py, no behaviour
          change).
"""

from typing import Any, cast
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import DeliveryArea, Producer, ProducerOffer, Product
from app.schemas.schemas import clean_display_city
from app.services import delivery_zones  # MEH-3484
from app.services.gallery_cap import assert_free_gallery_cap  # MEH-3220


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
    zones: list[Any] | None = None,
) -> list[str]:
    """MEH-1644: route the two delivery-area write shapes (structured rows
    take precedence over the flat city list) and return the newly-added
    cities for the MEH-54/MEH-1360 delivery_area alert — identical semantics
    on both paths. MEH-3484: then the zones (None = not sent)."""
    if delivery_rows is None and delivery_cities is None and zones is None:
        return []
    zone_before = delivery_zones.memberships(db, producer)
    had = {delivery_zones.city_key(da.city) for da in producer.delivery_areas or []}
    added = _replace_city_rows(db, producer, delivery_rows, delivery_cities)
    # A zone can re-add a city this body's rows dropped: only a city that was
    # not there before the save is new (the MEH-54 alert).
    zone_added = delivery_zones.sync(db, producer, zones, zone_before)
    if producer.delivery_nationwide:
        # MEH-3511 review: a nationwide business already delivered to its zone
        # cities — a zone is other terms, not a new city (no MEH-54 alert).
        return added
    return added + [c for c in zone_added if delivery_zones.city_key(c) not in had]


def _replace_city_rows(
    db: Session,
    producer: Producer,
    delivery_rows: list[dict[str, Any]] | None,
    delivery_cities: list[str] | None,
) -> list[str]:
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
                delivery_days=row.get("delivery_days"),  # MEH-3484
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

    # REUSES: _apply_delivery_rows above
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


def _assert_gallery_rules(
    producer: Producer, payload: dict[str, Any], old_images: list[Any]
) -> None:
    """MEH-3247: both gallery-write rules in one call (PLR0915 budget)."""
    _assert_keeps_a_photo(producer, payload, old_images)
    # MEH-3220: the free-plan 3-photo cap belongs to the gallery write.
    assert_free_gallery_cap(producer, payload, old_images)


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
    (`admin.py`), the OTP confirm (`routers/producer_me_review.py`), `producer_import.py`. This key is taken
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
        .filter(
            Product.id == new_id,
            Product.producer_id == producer.id,
            Product.is_draft.is_(False),  # MEH-2312: a draft is never featured
        )
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
