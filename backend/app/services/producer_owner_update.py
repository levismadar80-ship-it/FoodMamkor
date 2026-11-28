"""
Module:   producer_owner_update
Purpose:  The owner's save of her own business card (PUT /producers/me): the
          writable-field set, the delivery/offer/category writes, and the admin
          pings that follow a save.
Touches:  producers, producer_categories, producer_delivery_areas,
          producer_offers (via producer_me_writes) · Cloudinary (freed images)
          · admin WhatsApp/email pings (BackgroundTasks) · IndexNow.
Does NOT: parse the request or declare the route — routers/producer_me.py
          does, and re-exports the helpers below for the other owner routers.
          The per-field write helpers live in services/producer_me_writes.py.
Related:  routers/producer_me.py (update_my_producer) ·
          routers/producer_me_locations.py (_fire_sensitive_edit) ·
          routers/producer_me_review.py (_test_cause).
History:  MEH-3841 (moved out of routers/producer_me.py, MEH-3537; no
          behaviour change).
"""

import logging
from typing import Any

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy.orm import Session

from app.models import Producer, User
from app.schemas import delivery_time  # MEH-3511
from app.schemas.schemas import ProducerUpdate
from app.services import approved_edit_moderation as approved_edit  # MEH-3261
from app.services import indexnow  # MEH-2852
from app.services.auth_notifications import (
    notify_admin_producer_review_ready,
    notify_admin_producer_sensitive_edit,
)
from app.services.delivery_validation import (
    ensure_exclusion_requires_nationwide,
    ensure_location_mode,
    ensure_nationwide_requires_delivery,
)
from app.services.dietary_scope_conflict import conflict_keys  # MEH-3982
from app.services.farmer_declaration import apply_farmer_declaration_on_update
from app.services.image_ownership import assert_own_new_images  # MEH-3247
from app.services.phone_reverify import reset_verification_if_phone_changed  # grill B8
from app.services.producer_me_writes import (
    _apply_organizer_city,
    _assert_gallery_rules,
    _lock_producer_updates,
    _resolve_top_product,
    _sync_active_offer,
    _sync_delivery_areas,
    reconcile_secondary_phone,
)
from app.services.review_conflicts import recompute_after_categories_changed  # MEH-3258
from app.services.submission_gate import (
    attach_owner_email_verified,
    attach_upcoming_events_count,
)

log = logging.getLogger(__name__)


# MEH-1351: approvability = the admin approve gate's definition — ≥1 image
# (MEH-799). Keep in sync with services/producer_approval.py::_assert_approvable.
def _is_approvable(db: Session, producer: Producer) -> bool:
    # MEH-3026: the photo is the only approve gate this mirrors now — a missing
    # licence no longer blocks approval (services/producer_approval.py).
    return bool(producer.images)


def _pending_and_approvable(db: Session, producer: Producer) -> bool:
    return producer.status == "pending" and _is_approvable(db, producer)  # type: ignore[return-value]


# MEH-2073: fields whose change is worth telling the admin about after a
# business is already approved — identity (city, phone) and the trust
# declarations MEH-1508 cross-checks at approval time (the diet scopes). ONE
# constant; the Hebrew labels live with the sender in auth_notifications.py.
#
# Not the whole writable set. MEH-3261 (D11) replaced the old "never ping on
# copy edits": description / short / owner_bio / images now get their own
# «עדכן תוכן» message + AI check (services/approved_edit_moderation.py).
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
        # MEH-3977 (review): store names go live on the page at once — owner
        # text no one has read, same reason as whatsapp_group.
        "partner_stores",
    }
)


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
    changed = sorted(
        field
        for field in SENSITIVE_FIELDS
        if before.get(field) != getattr(producer, field, None)
    )
    # MEH-3982: a «טבעוני / צמחוני: כן» on an animal category is named
    # explicitly in the same ping, so the admin checks it. The save stands.
    changed += conflict_keys(producer, changed)
    _fire_sensitive_edit(background_tasks, producer, changed, actor=actor)


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
    # MEH-3026 (F7): after the admin asked for changes, the owner's own
    # «סיימתי להשלים — שלחו לבדיקה» (POST /producers/me/request-review) is the
    # signal, and it pings the admin itself. Firing review-ready on the save
    # just before it sent the admin two emails 7 s apart for one action.
    if producer.requested_changes:
        return
    if not was_approvable and _pending_and_approvable(db, producer):
        background_tasks.add_task(
            notify_admin_producer_review_ready,
            producer.name,  # type: ignore[arg-type]
            producer.city,  # type: ignore[arg-type]
            test_cause=_test_cause(producer, actor),  # MEH-2952
        )


def _free_replaced_logo(
    db: Session, producer: Producer, payload: dict[str, Any], old: Any
) -> None:
    """MEH-3611: a replaced or removed logo is freed, after the commit (MEH-375
    order). destroy_image skips a URL another column still references."""
    if "logo_url" not in payload:
        return
    from app.cloudinary_utils import destroy_replaced

    destroy_replaced(
        old, producer.logo_url, context="producer_me.update_my_producer logo", db=db
    )


def update_owner_producer(  # noqa: PLR0915 — MEH-3261 (AI check) and MEH-3339 (second phone) each add steps; moved verbatim from the router (MEH-3841)
    db: Session,
    user: User,
    data: ProducerUpdate,
    background_tasks: BackgroundTasks,
) -> Producer:
    """PUT /producers/me, end to end. Moved verbatim from the router (MEH-3841)."""
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
    content_before = approved_edit.snapshot_content(producer)  # MEH-3261

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
        # MEH-3611: the logo; image-URL guard in ProducerUpdate, ownership below.
        "logo_url",
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
        # MEH-2447: «איסוף או ביקור בתיאום מראש», edited in DeliveryCard.
        "by_arrangement",
        "delivery_nationwide",
        # MEH-1255: nationwide exclusion list ("לכל הארץ חוץ מ:") — guarded by
        # _ensure_exclusion_requires_nationwide + the DB CHECK.
        "delivery_excluded_cities",
        # MEH-3977: «נמכר דרך חנויות אחרות» — names normalised in
        # schemas/partner_stores.py, effective state in ensure_location_mode.
        "partner_stores",
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
        # MEH-3511: business-wide delivery time + minimum (ProducerUpdate).
        "delivery_days_min",
        "delivery_days_max",
        "delivery_min_order",
    }
    payload = data.model_dump(exclude_unset=True)
    category_ids = payload.pop("category_ids", None)
    delivery_cities = payload.pop("delivery_area_cities", None)
    # MEH-1644: structured rows (city · min_order · delivery_day) from the
    # dashboard DeliveryCard. Takes precedence over the flat city list when
    # both are sent; absent (exclude_unset) → the flat path behaves as before.
    delivery_rows = payload.pop("delivery_areas", None)
    # MEH-3484: None = not sent (zones and memberships stay as stored).
    zones_sent = data.delivery_zones if "delivery_zones" in payload else None
    payload.pop("delivery_zones", None)
    # MEH-1823 chunk 2: three-valued. `in payload` (post-exclude_unset) is the
    # ONLY way to tell "omitted" from "explicit null" — popping the value alone
    # collapses them, and that difference is whether an unrelated dashboard save
    # leaves the offer alone or deletes it.
    offer_sent = "active_offer" in payload
    offer_payload = payload.pop("active_offer", None)

    # MEH-3026 (Sapir 21/11): no licence gate on update — adding a category
    # that requires a licence saves without one; the business has no «מאומת».
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
    ensure_location_mode(producer, payload)  # MEH-3977

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
    old_logo_url = producer.logo_url  # MEH-3611: destroyed after commit if replaced
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

    # MEH-2911 + MEH-3220: raised BEFORE the setattr loop, so the whole PUT is
    # refused rather than half-applied (keeps a photo; free-plan 3-photo cap).
    _assert_gallery_rules(producer, payload, old_images)
    # MEH-3247: a business stores only photos she uploaded herself.
    assert_own_new_images(
        user,
        [
            *(payload.get("images") or []),
            payload.get("owner_photo_url"),
            payload.get("logo_url"),
        ],
        [*old_images, producer.owner_photo_url, producer.logo_url],
    )
    # MEH-3261: changed public text of an APPROVED business → AI (REJECTED = 422).
    content_ai = approved_edit.check_producer(producer, payload)

    reconcile_secondary_phone(producer, payload)  # MEH-3339
    for field, value in payload.items():
        if field in _PRODUCER_WRITABLE_FIELDS:
            setattr(producer, field, value)
    delivery_time.check_stored(producer)  # MEH-3511: the range on the merged row

    # Grill B8: a new WhatsApp number is not a verified one (MEH-745).
    reset_verification_if_phone_changed(db, producer, payload, old_phone)

    # Handle delivery areas (replaces existing rows like the admin endpoint).
    # MEH-1644: structured rows take precedence over the flat city list.
    new_cities = _sync_delivery_areas(
        db, producer, delivery_rows, delivery_cities, zones_sent
    )

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
    # MEH-3258: a category write can move competitor conflicts (no-op on None).
    recompute_after_categories_changed(db, producer.id, category_ids)

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
    _free_replaced_logo(db, producer, payload, old_logo_url)  # MEH-3611

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
                title=f"משלוחים חדשים: {producer.name}",
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
    approved_edit.fire_content_edit(  # MEH-3261: one «עדכן תוכן» ping per save
        background_tasks,
        producer,
        approved_edit.changed_content(content_before, producer),
        content_ai == "FLAGGED",
        test_cause=_test_cause(producer, user),
    )
    # MEH-2475 (review #3728): an approved organizer moving her city is the same
    # admin-visible event as a business moving its primary location (the
    # locations CRUD pings "city" through the same gate).
    if organizer_city_changed:
        _fire_sensitive_edit(background_tasks, producer, ["city"], actor=user)
    # MEH-2852: the public profile changed — tell IndexNow (production only).
    indexnow.schedule_public_producer(background_tasks, producer)

    attach_upcoming_events_count(producer)  # MEH-2460
    attach_owner_email_verified(producer)  # MEH-3660
    return producer
