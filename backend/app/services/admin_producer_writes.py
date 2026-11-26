"""
Module:   admin_producer_writes
Purpose:  The admin's create and edit of a business (POST /admin/producers and
          PUT /admin/producers/{id}): slug, categories, delivery areas, the
          editorial pick, the pause guards and the post-commit cleanup.
Touches:  producers, producer_categories, delivery_areas, producer_locations,
          retired_slugs · Cloudinary (freed images) · IndexNow.
Does NOT: declare the routes or check the admin — routers/admin.py does.
          Toggle-status, delete and the story card stay in the router. The
          reads live in services/admin_producer_reads.py; the owner's own save
          is services/producer_owner_update.py.
Related:  routers/admin.py (admin_create_producer, admin_update_producer) ·
          services/producer_me_writes.py (_apply_delivery_rows, reused).
History:  MEH-3843 (moved out of routers/admin.py, MEH-3537; no behaviour
          change).
"""

from typing import Any, cast
from uuid import UUID

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from app.data.cities import canonical_city  # MEH-3475
from app.models import DeliveryArea, Producer, ProducerCategory
from app.schemas import delivery_time  # MEH-3511
from app.schemas.schemas import (
    WRITABLE_AVAILABILITY_STATES,
    ProducerAdminCreate,
    ProducerAdminUpdate,
)
from app.services import delivery_zones  # MEH-3484
from app.services import indexnow  # MEH-2852
from app.services import retired_slugs  # MEH-2528
from app.services.admin_create_duplicates import refuse_duplicate_create  # MEH-3883
from app.services.admin_producer_reads import attach_has_owner as _attach_has_owner
from app.services.availability_validation import (  # MEH-2758
    AvailabilityValidationError,
    validate_transition,
)
from app.services.delivery_validation import (
    ensure_exclusion_requires_nationwide,
    ensure_nationwide_requires_delivery,
)
from app.services.phone_reverify import reset_verification_if_phone_changed  # grill B8
from app.services.producer_approval import _ensure_unique_slug, _guard_supplied_slug
from app.services.producer_me_writes import (  # MEH-3475
    _apply_delivery_rows,
    reconcile_secondary_phone,  # MEH-3339
)
from app.services.producer_queries import (
    attach_badge_fields,
    create_primary_branch_location,
    upsert_primary_branch_location,
)
from app.services.review_conflicts import recompute_after_categories_changed  # MEH-3258
from app.slug_utils import latin_slug  # MEH-3336
from app.slug_utils import slugify as _slugify
from app.utils.clock import israel_now


def _apply_categories(db: Session, producer: Producer, category_ids: list[int]) -> None:
    db.query(ProducerCategory).filter(
        ProducerCategory.producer_id == producer.id
    ).delete()
    # MEH-1297: payload order = stored order (position 0 = primary).
    for pos, cid in enumerate(category_ids):
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid, position=pos))


def _write_delivery_areas(
    db: Session,
    producer: Producer,
    rows: list[dict[str, Any]] | None,
    cities: list[str] | None,
) -> None:
    """MEH-3475: structured rows (the DeliveryCard shape) win over the flat
    city list (ProducerForm), the same precedence as the owner PUT."""
    if rows is not None:
        _apply_delivery_rows(db, producer, rows)
    elif cities is not None:
        _apply_delivery_cities(db, producer, cities)


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]) -> None:
    # MEH-3475: the admin ProducerForm sends the flat city list on every save.
    # A city that stays keeps its day / minimum / fee; only new cities start
    # empty. Before, every admin save wiped the per-city details.
    kept = {
        # Keyed canonically: a row stored before MEH-2602 may carry another
        # spelling of the same city.
        (canonical_city(str(a.city)) or str(a.city)): (
            a.delivery_day,
            a.min_order,
            a.delivery_fee,
            a.delivery_days,  # MEH-3484
        )
        for a in db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id)
    }
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        city = (city or "").strip()
        if not city:
            continue
        day, min_order, fee, days = kept.get(
            canonical_city(city) or city, (None, None, None, None)
        )
        db.add(
            DeliveryArea(
                producer_id=producer.id,
                city=city,
                delivery_day=day,
                min_order=min_order,
                delivery_fee=fee,
                delivery_days=days,
            )
        )


def _apply_recommended_pick(producer: Producer, payload: dict[str, Any]) -> None:
    """Normalise the editorial pick and stamp/clear its date on a transition.

    MEH-1494 chunk B. The stamp is driven by the TRANSITION, never by the
    value: `recommended_at` is what makes the annual review possible (the
    TripAdvisor/Michelin pattern on the card), so a row re-saved while already
    picked keeps its original date. Stamping on the value instead would reset
    the review window on every unrelated admin edit to that producer — which is
    the whole clock, silently disarmed.

    Gated on the PAYLOAD, not on the resulting value, matching this handler's
    `exclude_unset` semantics throughout: an admin editing only the name never
    touches the stamp.

    `bool(...)` on both sides because `is_recommended` is nullable and an
    explicit `is_recommended: null` reaches here — a NULL flag is not a pick,
    so it lands on the un-pick branch.

    `recommended_note` is deliberately NOT cleared on an un-pick: it is the
    editor's record of a decision that was actually made, and erasing it would
    destroy the only trace of why — the thing ADR-030 requires to be
    defensible. The next pick overwrites it.
    """
    if "is_recommended" not in payload:
        return
    was = bool(producer.is_recommended)
    will_be = bool(payload["is_recommended"])
    # Normalise BEFORE the setattr loop reaches the column. `is_recommended` is
    # nullable while `ProducerAdminOut.is_recommended` is a plain `bool`, so a
    # PUT carrying an explicit `is_recommended: null` wrote NULL and then died
    # in response validation — a 500 on a successful write. Measured 06/09
    # against the pre-chunk-B code, so this is a latent defect this chunk
    # surfaced rather than one it introduced; the column stays nullable
    # (narrowing it is Alembic, and this handler is not where that belongs).
    payload["is_recommended"] = will_be
    if will_be and not was:
        producer.recommended_at = israel_now()  # type: ignore[assignment]
    elif was and not will_be:
        # Clearing the date takes the row OUT of the review list rather than
        # leaving it there forever as permanently overdue.
        producer.recommended_at = None  # type: ignore[assignment]


def _retire_replaced_slug(
    db: Session, producer: Producer, payload: dict[str, Any]
) -> None:
    """MEH-2528 — an admin edit that changes or clears the slug retires the old
    one, so the next business with that name cannot inherit its links; a slug
    this business retired earlier and now takes back is released again.

    Must run before the payload is applied: it reads the OLD `producer.slug`.
    """
    if "slug" not in payload or (payload["slug"] or None) == producer.slug:
        return
    retired_slugs.retire_slug(db, producer, "renamed")
    if payload["slug"]:
        retired_slugs.reclaim(db, payload["slug"], producer.id)  # type: ignore[arg-type]


def _guard_vacation_return_date(producer: Producer, payload: dict[str, Any]) -> None:
    """MEH-2782: a paused business always has a return date, on the admin PUT
    too — the owner endpoint has required it since AUD-039/040. The past-date
    check stays in ProducerUpdate._validate_vacation_until."""
    if "availability_state" not in payload and "vacation_until" not in payload:
        return  # an unrelated edit of a legacy dateless pause stays possible
    state = payload.get("availability_state", producer.availability_state)
    until = (
        payload["vacation_until"]
        if "vacation_until" in payload
        else producer.vacation_until
    )
    if state == "on_vacation" and until is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "vacation_return_date_required",
                "message": "תאריך חזרה לחופשה נדרש",
            },
        )


def _guard_availability_change(producer: Producer, payload: dict[str, Any]) -> None:
    """MEH-2758: pause-only availability writes on the admin PUT.

    Only a CHANGE is checked, since ProducerForm sends availability_state on
    every save. Since MEH-2782 the schema enum is the same two values, so this
    is the second line of defence. Runs the MEH-2782 return-date check first.
    """
    _guard_vacation_return_date(producer, payload)
    new_state = payload.get("availability_state")
    if "availability_state" not in payload or new_state == producer.availability_state:
        return
    try:
        validate_transition(producer.availability_state, cast(str, new_state))  # type: ignore[arg-type]
    except AvailabilityValidationError as e:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_availability_state",
                "message": "מצב לא תקין",
                "params": {"allowed": list(WRITABLE_AVAILABILITY_STATES)},
            },
        ) from e


def admin_create_producer_row(
    db: Session, data: ProducerAdminCreate, background_tasks: BackgroundTasks
) -> Producer:
    """Admin-created producers are auto-approved — unless `as_draft`, which
    prepares an ownerless draft for the owner-claim link (MEH-2322)."""
    # MEH-3336: the suggestion is Latin (Instagram handle, else the name
    # transliterated); a typed slug must be Latin too (_guard_supplied_slug).
    if data.slug:
        _guard_supplied_slug(data.slug)
    # MEH-3883: a business we already have (phone, email, IG, website,
    # Facebook) answers 409 with the list, before anything is written.
    refuse_duplicate_create(db, data)
    slug = (
        _slugify(data.slug)
        if data.slug
        else latin_slug(data.name, instagram=data.instagram)
    )
    # Collision → the town is appended (never a bare "-2", MEH-3336).
    # `or None`: an all-Arabic name with no handle transliterates to "", and ""
    # must never be stored — NULL keeps the /producer/{id} fallback (MEH-1817).
    stored_slug: str | None = _ensure_unique_slug(db, slug, city=data.city) or None

    # MEH-3026 (Sapir 21/11): no licence 422 here any more — a business with
    # no licence number goes live without the «מאומת» badge, the same rule as
    # approval (services/producer_approval.py). Replaces the MEH-530 guard.

    producer = Producer(
        name=data.name,
        contact_name=data.contact_name,
        description=data.description,
        short_description=data.short_description,
        owner_bio=data.owner_bio,  # MEH-3338
        secondary_phone=data.secondary_phone,  # MEH-3339
        secondary_phone_label=data.secondary_phone_label,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        whatsapp_group=data.whatsapp_group,
        # MEH-17
        primary_contact_method=data.primary_contact_method or "whatsapp",
        contact_email=data.contact_email,
        # MEH-296 3d: admin-create parity for the new channels.
        facebook=data.facebook,
        external_order_form=data.external_order_form,
        slug=stored_slug,
        top_product_name=data.top_product_name,
        price_range=data.price_range,
        grass_fed=data.grass_fed,
        organic_certified=data.organic_certified,
        has_delivery=data.has_delivery,
        # MEH-2060: pickup_points stopped being written here — it's derived
        # from producer_locations rows now (attach_badge_fields below), and a
        # freshly-created producer has none yet regardless of this form field.
        kosher=data.kosher,
        producer_license_number=data.producer_license_number,
        admin_notes=data.admin_notes,
        # MEH-766 ch3: is_verified no longer set on admin create — column default
        # False applies; verification is via grant-verified (verified_at) only.
        images=data.images or [],
        # MEH-213 — location mode
        has_physical_location=data.has_physical_location,
        offers_delivery=data.offers_delivery,
        delivery_nationwide=data.delivery_nationwide,
        # MEH-1255: nationwide exclusion list — schema validator already
        # rejected excluded-without-nationwide on create.
        delivery_excluded_cities=data.delivery_excluded_cities,
        # MEH-903 A: the legacy delivery_cities column is no longer written —
        # delivery_areas (via _apply_delivery_cities below) is the single store.
        # Column stays declared (drop = Chunk C); new rows keep the [] default.
        # admin = pre-approved. MEH-2322: an owner-claim draft is NOT — it
        # has no owner and no declaration, and stays off every public surface
        # until its owner claims it, completes it and submits it for review.
        status="draft" if data.as_draft else "approved",
    )
    db.add(producer)
    db.flush()

    _apply_categories(db, producer, data.category_ids)
    _apply_delivery_cities(db, producer, data.delivery_area_cities)
    # MEH-1921: this is the FIFTH create-from-payload path, and the one easiest
    # to miss — `_apply_delivery_cities` is shared with the PUT route (:286),
    # so classifying it by call site reads "edit path, leave alone" and hides
    # that THIS caller creates. Like the importer, the row is born
    # `status="approved"` and is live immediately.
    #
    # Unlike the four signup paths, `ProducerAdminCreate` DOES carry
    # `offers_delivery` (schemas.py:1431), so an admin can state it — and an
    # explicit `false` alongside delivery cities is a deliberate declaration
    # that MEH-1848's predicates are right to exclude. Only the UNSTATED case
    # is derived, which `model_fields_set` distinguishes and a plain falsy
    # check cannot. Same distinction `_sync_active_offer` (services/producer_me_writes.py)
    # already relies on: "omitted" and "explicitly false" are different answers.
    if data.delivery_area_cities and "offers_delivery" not in data.model_fields_set:
        producer.offers_delivery = True  # type: ignore[assignment]

    # MEH-2059 (MEH-1938 chunk 4b): the admin half of the dual-write. Same
    # helper the four signup paths call (producer_queries.py:351), so this is
    # the SIXTH create-from-payload site and the field contract cannot drift
    # between them. Declines by itself when a coordinate is missing.
    #
    # This site can only ever create: the producer was flushed six lines up, so
    # it owns no locations yet — `upsert_...` would find nothing and delegate
    # here anyway. Calling the create helper directly says that out loud.
    #
    # REUSES: backend/app/services/producer_queries.py:449 — the same call, in
    # the same position (after flush, before commit), on the public-create path.
    create_primary_branch_location(db, producer)

    db.commit()
    db.refresh(producer)
    # MEH-2852: an admin-created business is live at once (a draft is not).
    indexnow.schedule_public_producer(background_tasks, producer)
    attach_badge_fields(producer)
    _attach_has_owner(db, [producer])
    return producer


def admin_update_producer_row(
    db: Session,
    producer_id: UUID,
    data: ProducerAdminUpdate,
    background_tasks: BackgroundTasks,
) -> Producer:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    payload = data.model_dump(exclude_unset=True)
    # MEH-2502: status moves only through approve / reject / toggle-status —
    # the routes that carry the approval gate, the MEH-509 hooks and the
    # MEH-2498 group-buy cancel. ProducerAdminUpdate inherits `status` from the
    # owner's ProducerUpdate, so it is refused here, loudly, before any write.
    if "status" in payload:
        raise HTTPException(
            status_code=422,
            detail="לא ניתן לשנות סטטוס בעריכה — יש להשתמש באישור, בדחייה או בהשעיה.",
        )
    category_ids = payload.pop("category_ids", None)
    delivery_area_cities = payload.pop("delivery_area_cities", None)
    # MEH-3475: structured rows (city · delivery_day · min_order · fee), the
    # owner DeliveryCard's shape, written by the owner's own writer. Without
    # this pop the setattr loop below assigned dicts to the relationship (500).
    delivery_rows = payload.pop("delivery_areas", None)
    # MEH-3484: same three-valued zones as the owner PUT (None = not sent).
    zones_sent = data.delivery_zones if "delivery_zones" in payload else None
    payload.pop("delivery_zones", None)
    # MEH-903 A: stop writing the legacy delivery_cities column — delivery_areas
    # is the single store now. Pop it out of the payload so the bulk setattr loop
    # below can't resurrect the write. Column stays declared (drop = Chunk C).
    payload.pop("delivery_cities", None)
    # MEH-2060: same no-op-pop pattern, same reason — pickup_points is derived
    # from producer_locations rows now (attach_badge_fields below); ProducerForm
    # still has a checkbox that sends this field (frontend out of scope for this
    # ticket, flagged separately), but the bulk setattr loop must not write it.
    payload.pop("pickup_points", None)
    # MEH-3137: the grower declaration is the OWNER's to sign; an admin edit
    # never records it (same rule as declared_at, ADR-022 gate 2).
    payload.pop("farmer_declaration_accepted", None)
    # MEH-1255: effective-state guard — excluded cities require nationwide.
    ensure_exclusion_requires_nationwide(producer, payload)
    # MEH-1879: same shape — nationwide delivery requires the delivery flag,
    # or the DB CHECK (MEH-1849) turns a partial update into a 500.
    ensure_nationwide_requires_delivery(producer, payload)

    # MEH-3026: the MEH-2707 / MEH-999 licence gate on update is gone — adding
    # a licensed category without a licence number no longer 422s.

    # Keep slug unique if changed; reject reserved slugs.
    # MEH-3336: only a CHANGED slug is validated. The admin form resends the
    # stored slug on every save, so a business still on a legacy Hebrew slug
    # must stay editable — the Latin rule applies when the slug is replaced.
    if "slug" in payload and payload["slug"] and payload["slug"] != producer.slug:
        _guard_supplied_slug(payload["slug"])
        candidate = _slugify(payload["slug"])
        payload["slug"] = _ensure_unique_slug(
            db,
            candidate,
            exclude_id=producer.id,  # type: ignore[arg-type]
            city=payload.get("city") or producer.city,  # type: ignore[arg-type]
        )

    # MEH-2528: read before the setattr loop below overwrites `producer.slug`.
    _retire_replaced_slug(db, producer, payload)
    # MEH-2852: same reason — a slug change moves the page, so the old URL
    # (now gone) is pinged beside the new one.
    urls_before = indexnow.producer_urls(producer)

    # MEH-375: snapshot gallery BEFORE bulk setattr so we can diff and
    # destroy URLs the admin dropped AFTER db.commit succeeds. Order
    # matters — destroying before commit would orphan-leak in reverse
    # (assets gone, DB still references them) on a commit raise.
    old_images, old_logo_url = (
        list(producer.images or []),
        producer.logo_url,
    )  # MEH-3611

    # MEH-1494 chunk B: the editorial clock, stamped BEFORE the setattr loop
    # below — that loop is what turns `producer.is_recommended` into the new
    # value, so the transition has to be read while it is still the old one.
    _apply_recommended_pick(producer, payload)

    _guard_availability_change(producer, payload)  # MEH-2758
    old_phone: str | None = producer.phone  # type: ignore[assignment]  # grill B8

    reconcile_secondary_phone(producer, payload)  # MEH-3339
    for field, value in payload.items():
        setattr(producer, field, value)
    delivery_time.check_stored(producer)  # MEH-3511: the range on the merged row

    # Grill B8: an admin-typed number is not one the owner verified (MEH-745).
    reset_verification_if_phone_changed(db, producer, payload, old_phone)

    if category_ids is not None:
        _apply_categories(db, producer, category_ids)
    zone_before = delivery_zones.memberships(db, producer)  # MEH-3484
    _write_delivery_areas(db, producer, delivery_rows, delivery_area_cities)
    if any(x is not None for x in (zones_sent, delivery_rows, delivery_area_cities)):
        delivery_zones.sync(db, producer, zones_sent, zone_before)

    # MEH-2059 (MEH-1938 chunk 4b): the admin EDIT half of the dual-write.
    # Gated on the payload rather than on the resulting values, because
    # `exclude_unset=True` above means an admin editing only the name must not
    # re-mirror `Producer.address` over a location row the OWNER authored in
    # the dashboard. An explicit `lat: null` IS in the payload, so clearing the
    # coordinates still reaches the helper — which mirrors the clear instead of
    # leaving a stale point behind.
    #
    # Runs AFTER the setattr loop on purpose: the helper reads the producer
    # instance, so it must see the post-update values. That is the same reason
    # MEH-1939 takes the flushed Producer rather than five loose fields
    # (producer_queries.py:378-383) — the row is a mirror, and reading the
    # mirror's source off the instance is what makes them unable to drift.
    if "lat" in payload or "lng" in payload:
        upsert_primary_branch_location(db, producer)

    db.commit()
    db.refresh(producer)
    # MEH-3258: a category write can move competitor conflicts (no-op on None).
    recompute_after_categories_changed(db, producer.id, category_ids)

    # MEH-375: post-commit cleanup. Helper handles set diff + dedup +
    # fail-open per-URL destroy.
    if "images" in payload:
        from app.cloudinary_utils import destroy_removed_images

        destroy_removed_images(
            old_images,
            producer.images or [],  # type: ignore[arg-type]
            context="admin.admin_update_producer images",
            db=db,  # MEH-3247
        )
    from app.cloudinary_utils import destroy_replaced  # MEH-3611

    destroy_replaced(
        old_logo_url,
        producer.logo_url,
        context="admin.admin_update_producer logo",
        db=db,
    )

    if indexnow.is_public_owner(producer):  # MEH-2852
        indexnow.schedule(
            background_tasks, urls_before + indexnow.producer_urls(producer)
        )

    attach_badge_fields(producer)
    _attach_has_owner(db, [producer])
    return producer
