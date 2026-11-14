import logging
from datetime import timedelta
from typing import Any, cast
from uuid import UUID

import httpx
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
)
from sqlalchemy import ColumnElement, CursorResult, func, text
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import require_admin
from app.utils.clock import business_days_waiting, israel_now, israel_today
from app.utils.pii import mask_phone
from app.config import settings
from app.services.delivery_validation import (
    ensure_exclusion_requires_nationwide,
    ensure_nationwide_requires_delivery,
)
from app.services.group_buy_delist import cancel_live_group_buys  # MEH-2498
from app.services.availability_validation import (  # MEH-2758
    AvailabilityValidationError,
    validate_transition,
)
from app.services.producer_listing import is_business  # MEH-2459
from app.services import retired_slugs  # MEH-2528
from app.services import indexnow  # MEH-2852
from app.services.phone_reverify import reset_verification_if_phone_changed  # grill B8

# MEH-1242: SITE_DOMAIN is the single canonical domain constant. Import it —
# never re-declare the literal.
from app.database import get_db
from app.rate_limit import limiter
from app.models import (
    DeliveryArea,
    HomeProduct,
    Producer,
    ProducerCategory,
    Product,
    User,
)
from app.schemas.schemas import (
    LicenseExpiryReminderOut,
    LicenseExpiryReminderRow,
    ProducerAdminCreate,
    ProducerAdminOut,
    ProducerAdminUpdate,
    WRITABLE_AVAILABILITY_STATES,
    StoryCardUploadRequest,
)
from app.services.license_validation import (
    enforce_license_gate_on_update,
    ensure_license_for_categories,
)
from app.services.producer_queries import (
    attach_badge_fields,
    create_primary_branch_location,
    upsert_primary_branch_location,
)

# MEH-2020 — `_slugify` used to be a full copy of `slug_utils.slugify` here,
# and a third copy lived in `producer_import.py`. Three generators of a public
# URL is three chances to drift, and MEH-2021 already caught one docstring
# describing all three wrongly. The name stays so every call site and the
# MEH-2021 corpus keep working; only the body is gone.
from app.slug_utils import slugify as _slugify
from app.utils.sql import LIKE_ESCAPE, escape_like
from app.services.producer_approval import (
    ApprovalOverrides,
    _assert_approvable,
    _ensure_unique_slug,
    _guard_supplied_slug,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


def _yes_no(value: object) -> bool:
    """Parse Hebrew/English yes/no values from Excel."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s in ("כן", "yes", "y", "true", "1", "v", "✓")


def _apply_categories(db: Session, producer: Producer, category_ids: list[int]) -> None:
    db.query(ProducerCategory).filter(
        ProducerCategory.producer_id == producer.id
    ).delete()
    # MEH-1297: payload order = stored order (position 0 = primary).
    for pos, cid in enumerate(category_ids):
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid, position=pos))


def _apply_delivery_cities(db: Session, producer: Producer, cities: list[str]) -> None:
    db.query(DeliveryArea).filter(DeliveryArea.producer_id == producer.id).delete()
    for city in cities:
        city = (city or "").strip()
        if not city:
            continue
        db.add(DeliveryArea(producer_id=producer.id, city=city))


def _attach_has_owner(db: Session, producers: list[Any]) -> None:
    """MEH-2495 — hydrate `has_owner` for every row in ONE query.

    `users.producer_id` has no unique index (producer_claim.py residual risks),
    so this asks "is there at least one" with DISTINCT rather than joining —
    a join would duplicate rows. Called by every route that returns
    `ProducerAdminOut`; the field defaults to None, so a route that skipped
    this fails closed (no chip, no action) rather than lying, and
    tests/test_meh2495_admin_draft_owner.py lists those routes so a new one
    has to be added there — and hydrated — on purpose.

    MEH-2974 added `owner` (name + email) to the same hydration, deliberately
    HERE and not as a `relationship` on the model. A lazy relationship would be
    read once per row by Pydantic's `from_attributes`, which is precisely the
    per-row SELECT that MEH-2541 removed from `GET /admin/producers`
    (tests/test_meh2541_admin_producers_query_count.py asserts the count for
    one producer equals the count for four, and would red). Selecting three
    columns instead of one keeps this at exactly one query, so both guards
    stay green and `has_owner`'s own semantics are untouched.

    When a row somehow has more than one owning account — possible precisely
    because there is no unique index — `owner` reports the FIRST by id. One
    deterministic answer beats a nondeterministic one; `has_owner` already
    collapsed that case to a bool, and MEH-2494's residual-risk note is where
    the duplicate itself belongs.
    """
    ids = [p.id for p in producers]
    # No DISTINCT: `users.id` is in the select list precisely so the ORDER BY
    # that makes the multi-owner tie-break deterministic is legal (Postgres
    # rejects `SELECT DISTINCT … ORDER BY <col not selected>`), and with the
    # primary key selected every row is already distinct. Still ONE query.
    rows = (
        db.query(User.producer_id, User.id, User.name, User.email)
        .filter(User.producer_id.in_(ids))
        .order_by(User.producer_id, User.id)
        .all()
        if ids
        else []
    )
    owners: dict[str, Any] = {}
    for pid, _uid, name, email in rows:
        owners.setdefault(pid, {"name": name, "email": email})
    for p in producers:
        p.has_owner = p.id in owners
        p.owner = owners.get(p.id)


def _attach_aging(producer: Any) -> None:
    """MEH-2110 — hydrate `business_days_waiting` for an admin list row.

    The server is the single source of truth for aging: one implementation,
    covered by tests/test_admin_queue_sla_aging.py, instead of a date
    calculation duplicated per client and drifting.

    A draft measures from `created_at` because it has no submission to measure
    from. Everything else uses the same COALESCE the queue ordering uses, so
    the badge and the sort can never disagree about which row is oldest.
    `resubmitted_at` comes first (MEH-2869): a resubmission after a rejection
    writes only that stamp, and `submitted_for_review_at` keeps the FIRST
    submission — measuring from it put a business that resubmitted today at the
    top of the queue with weeks of "waiting".

    Called by BOTH admin list routes. `ProducerAdminOut` declares the field, so
    a route that returned rows without calling this would serialise a silent
    `0` on every row — a number that looks measured and is not.
    """
    producer.business_days_waiting = business_days_waiting(
        producer.created_at
        if producer.status == "draft"
        else (
            producer.resubmitted_at
            or producer.submitted_for_review_at
            or producer.created_at
        )
    )


# MEH-1494 chunk B: the annual-review predicate, extracted so the filter reads
# as one named thing in `list_producers` and can be asserted directly.
#
# The window is the TripAdvisor/Michelin pattern the card cites: an editorial
# pick carries a visible clock and is re-examined, rather than being permanent.
#
# `recommended_at IS NULL` is IN the due set on purpose, and it is the case
# that matters most today. Chunk A deliberately did not backfill a date onto
# rows picked before the column existed, because inventing one would fabricate
# a decision date; NULL means "picked before there was a clock — review it now",
# which is exactly how Michelin treats a star that has not been re-examined.
#
# 365 days rather than a calendar year: the difference is a leap day on a
# review cadence measured in months, and `timedelta` costs no dependency. If
# the boundary ever has to be exact, this is the one line to change.
REVIEW_WINDOW_DAYS = 365


def _recommended_review_due_clause() -> ColumnElement[bool]:
    """SQL: the row carries the pick AND its clock is unset or past the window."""
    cutoff = israel_now() - timedelta(days=REVIEW_WINDOW_DAYS)
    return Producer.is_recommended.is_(True) & (
        Producer.recommended_at.is_(None) | (Producer.recommended_at < cutoff)
    )


@router.get("/producers", response_model=list[ProducerAdminOut])
def list_producers(
    status: str | None = Query(
        None,
        pattern="^(draft|pending|approved|rejected|inactive|all)$",
    ),
    search: str | None = None,
    # MEH-1494 chunk B: the annual-review view. Default False so every existing
    # caller — the admin toolbar included — sees exactly the list it saw before.
    recommended_review_due: bool = Query(False),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[ProducerAdminOut] | list[Producer]:
    q = db.query(Producer).options(
        joinedload(Producer.categories),
        joinedload(Producer.products),
        joinedload(Producer.delivery_areas),
        # MEH-2060: needed by attach_badge_fields' pickup_points/offers_pickup
        # derivation below. selectinload (not joinedload) — a 4th collection
        # joinedload here would widen the existing 3-way cartesian.
        selectinload(Producer.locations),
        # MEH-2541: ProducerListOut.active_offer reads this collection; without
        # it every row paid one producer_offers SELECT (Sentry N+1).
        selectinload(Producer.offers),
    )
    # MEH-2100: three-way, and the DEFAULT (no `status` param) is the one that
    # changed. The admin toolbar sends no param for its "כל הסטטוסים" option
    # (use-admin-producers.js omits it when the selection is "all"), so that
    # default IS the review queue the admin actually looks at — and drafts must
    # not be in it. A draft is a business that has not asked to be reviewed;
    # showing it is the queue-noise this ticket exists to remove.
    #
    #   no param      -> everything EXCEPT draft  (the working queue)
    #   ?status=all   -> genuinely everything, drafts included (the escape
    #                    hatch — "all" must not quietly mean "all but one")
    #   ?status=draft -> drafts only (the new "טיוטות" option, visibility only)
    #
    # `?status=pending` used to group two values, pending + pending_whatsapp;
    # the second was removed in MEH-2124 along with the state itself, so the
    # filter is a plain equality now and the branch that special-cased it is
    # gone.
    if status == "all":
        pass  # no status filter at all — the only view that shows drafts
    elif status:
        q = q.filter(Producer.status == status)
    else:
        q = q.filter(Producer.status != "draft")
    if search:
        # F13 (MEH-1188): escape LIKE metacharacters so a user-supplied % / _
        # matches literally instead of acting as a wildcard (same class as F1).
        like = f"%{escape_like(search)}%"
        q = q.filter(
            Producer.name.ilike(like, escape=LIKE_ESCAPE)
            | Producer.city.ilike(like, escape=LIKE_ESCAPE)
        )
    if recommended_review_due:
        q = q.filter(_recommended_review_due_clause())
    # MEH-2110: the review queue is worked oldest-first, because the "עד 3 ימי
    # עסקים" promise starts at submission and a business that has waited longest
    # is the one closest to breaking it. Newest-first (the old default) let an
    # old row sink under fresh arrivals and the promise break silently.
    #
    # WHICH VIEWS SORT ASC, and why it is not just `?status=pending`: the
    # admin's working view is the DEFAULT (no param), which this file's filter
    # above resolves to `status != "draft"` — NOT to the pending filter.
    # The ticket's wording assumed those were the same view; they are not, so
    # sorting only the explicit pending filter would have left the screen the
    # admin actually opens completely unchanged. Explicit approved/rejected/
    # inactive/draft filters keep the existing newest-first order, where recency
    # is the useful axis and there is no SLA to track.
    queue_view = status is None or status == "pending"
    if queue_view:
        # COALESCE, not submitted_for_review_at alone: rows seeded before
        # MEH-2100 (and every draft) have a NULL stamp, and a bare column sort
        # would bunch them all at one end regardless of real age. The latest
        # resubmission comes first (MEH-2869), the same order as _attach_aging.
        order_key = func.coalesce(
            Producer.resubmitted_at,
            Producer.submitted_for_review_at,
            Producer.created_at,
        ).asc()
    else:
        order_key = Producer.created_at.desc()
    results = q.order_by(order_key).all()
    # MEH-2060: this endpoint never called attach_badge_fields before, so
    # pickup_points (and every other computed badge field) silently defaulted
    # to Pydantic's False/0 in this response — a pre-existing gap, not
    # something this change introduces. Calling it here is what makes
    # AdminProducersTable.jsx's pickup badge (:128) agree with every other
    # consumer surface instead of reading a raw, no-longer-authoritative column.
    for p in results:
        attach_badge_fields(p)
        _attach_aging(p)
    _attach_has_owner(db, results)
    return results


@router.post("/producers", response_model=ProducerAdminOut, status_code=201)
def admin_create_producer(
    data: ProducerAdminCreate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProducerAdminOut | Producer:
    """Admin-created producers are auto-approved — unless `as_draft`, which
    prepares an ownerless draft for the owner-claim link (MEH-2322)."""
    slug = data.slug or _slugify(data.name)
    # Reject explicit reserved slugs; auto-generated slugs get suffixed by _ensure_unique_slug.
    if data.slug:
        _guard_supplied_slug(data.slug)
    slug = _ensure_unique_slug(db, slug)

    # MEH-530: same conditional-required guard as the public endpoints —
    # admin form can still persist non-regex license values verbatim
    # (manual-approval flow), but missing-license-for-required-category
    # is still a 422.
    # MEH-2322: skipped for an owner-claim DRAFT only. The license is the
    # owner's to supply after she claims it. A draft cannot be approved at all
    # until she submits it (approve_producer 409s on draft), and approval runs
    # `_assert_approvable` — the MEH-971 license gate, which an admin can
    # override with ?allow_without_license=true after checking the license
    # out-of-band. Same exposure, and same override, as the public register
    # path's `license_pending`; this branch adds no new route to "live".
    if not data.as_draft:
        ensure_license_for_categories(
            db, data.category_ids, data.producer_license_number
        )

    producer = Producer(
        name=data.name,
        contact_name=data.contact_name,
        description=data.description,
        short_description=data.short_description,
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
        slug=slug,
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
    # check cannot. Same distinction `_sync_active_offer` (producer_me.py)
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


# MEH-2072: how far ahead the licence reminder looks. One constant, not a query
# param — mirroring EXPIRY_REMINDER_WINDOW_DAYS in admin_kashrut.py:31 and for
# the same reason recorded there: a caller-chosen window lets a mistyped value
# sweep in every business on file, and the ticket scopes this to 30 days.
LICENSE_EXPIRY_REMINDER_WINDOW_DAYS = 30


@router.get("/license-expiry-reminders", response_model=LicenseExpiryReminderOut)
@limiter.limit("60/minute")
def license_expiry_reminders(
    request: Request,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> LicenseExpiryReminderOut:
    """MEH-2072: approved businesses whose licence expires within 30 days.

    Read-only. Nothing is sent, nothing is hidden, nothing is un-verified — v1
    policy is capture + remind, and the admin pulls this list herself. That is
    why this is a GET with no `dry_run` flag, unlike its kashrut sibling
    (admin_kashrut.py:154) which POSTs because it dispatches WhatsApp. Push is a
    future ticket.

    Selection, and every clause is load-bearing:

    * `license_expires_at IS NOT NULL` — NULL means "not captured yet", never
      "no expiry". Without this clause every producer predating MEH-2072 would
      appear in the reminder list forever, which is the failure that would get
      the whole feature switched off.
    * `>= israel_today()` — an already-lapsed licence is deliberately EXCLUDED.
      This mirrors the kashrut endpoint's reasoning: the list exists to catch a
      licence before it lapses. A lapsed one is a different problem needing a
      different action (that is the future enforcement decision), and letting it
      sit here would grow an unactionable backlog that buries the live rows.
    * `<= horizon` — the 30-day window.
    * `status == "approved"` — a pending business is already in the review
      queue, where the admin sees the licence anyway.

    Israel's calendar day, not UTC's: `license_expires_at` is a DATE column, and
    `israel_today()` is what makes the comparison calendar-day against
    calendar-day with no zone arithmetic (see the migration docstring).

    `60/minute`, matching the read-only `list_kashrut_requests`
    (admin_kashrut.py:36) rather than the `10/hour` its expiry-reminder sibling
    carries — that one is throttled hard because it DISPATCHES WhatsApp, and a
    read has no outbound side effect to ration.

    Note this is the first `@limiter.limit` in this module: `admin.py` currently
    has none at all. That is a pre-existing gap, not a local convention to copy
    — `backend/app/routers/CLAUDE.md` states the per-route limiter stack is
    mandatory here, so the new route follows the documented rule rather than the
    surrounding silence. Retro-fitting the rest of the module is out of scope.
    """
    today = israel_today()
    horizon = today + timedelta(days=LICENSE_EXPIRY_REMINDER_WINDOW_DAYS)
    producers = (
        db.query(Producer)
        .filter(
            Producer.license_expires_at.isnot(None),
            Producer.license_expires_at >= today,
            Producer.license_expires_at <= horizon,
            Producer.status == "approved",
        )
        .order_by(Producer.license_expires_at.asc())
        .all()
    )

    rows = [
        LicenseExpiryReminderRow(
            producer_id=producer.id,
            name=producer.name,
            # mask_phone handles the missing-phone case; unlike the kashrut
            # endpoint there is no `phone IS NOT NULL` filter, because a
            # business with no phone on file still needs its licence chased —
            # the admin just reaches it another way. Filtering it out would hide
            # the row entirely, which is the opposite of what this list is for.
            phone_masked=mask_phone(producer.phone),  # type: ignore[arg-type]
            expires_at=producer.license_expires_at,
            # Computed here, not per client: same reasoning as
            # business_days_waiting on ProducerAdminOut — the number the admin
            # reads and the order the rows arrive in must come from one clock.
            days_remaining=(producer.license_expires_at - today).days,
            producer_license_number=producer.producer_license_number,
        )
        for producer in producers
    ]

    return LicenseExpiryReminderOut(
        window_days=LICENSE_EXPIRY_REMINDER_WINDOW_DAYS,
        total=len(rows),
        rows=rows,
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


@router.put("/producers/{producer_id}", response_model=ProducerAdminOut)
def admin_update_producer(
    producer_id: UUID,
    # MEH-1287 chunk B: the ADMIN shape — ProducerUpdate plus the editor-only
    # fields. The owner PUT (producer_me.py) keeps ProducerUpdate, which is what
    # keeps `in_season_until` off the owner's schema entirely rather than merely
    # filtered out of it.
    data: ProducerAdminUpdate,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProducerAdminOut | Producer:
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

    # MEH-2707: the owner path's MEH-999 grandfather rule, shared — only a
    # NEWLY-ADDED licensed category, or blanking a held license, is refused.
    # This used to re-check the FULL effective category set (MEH-530), so any
    # edit to an unlicensed business in a licensed category 422'd — the admin
    # could not even fix its description. Going live is still gated by
    # approve_producer → _assert_approvable (MEH-971), unchanged.
    enforce_license_gate_on_update(db, producer, payload, category_ids)

    # Keep slug unique if changed; reject reserved slugs.
    if "slug" in payload and payload["slug"]:
        _guard_supplied_slug(payload["slug"])
        candidate = _slugify(payload["slug"])
        payload["slug"] = _ensure_unique_slug(db, candidate, exclude_id=producer.id)  # type: ignore[arg-type]

    # MEH-2528: read before the setattr loop below overwrites `producer.slug`.
    _retire_replaced_slug(db, producer, payload)
    # MEH-2852: same reason — a slug change moves the page, so the old URL
    # (now gone) is pinged beside the new one.
    urls_before = indexnow.producer_urls(producer)

    # MEH-375: snapshot gallery BEFORE bulk setattr so we can diff and
    # destroy URLs the admin dropped AFTER db.commit succeeds. Order
    # matters — destroying before commit would orphan-leak in reverse
    # (assets gone, DB still references them) on a commit raise.
    old_images = list(producer.images or [])

    # MEH-1494 chunk B: the editorial clock, stamped BEFORE the setattr loop
    # below — that loop is what turns `producer.is_recommended` into the new
    # value, so the transition has to be read while it is still the old one.
    _apply_recommended_pick(producer, payload)

    _guard_availability_change(producer, payload)  # MEH-2758
    old_phone: str | None = producer.phone  # type: ignore[assignment]  # grill B8

    for field, value in payload.items():
        setattr(producer, field, value)

    # Grill B8: an admin-typed number is not one the owner verified (MEH-745).
    reset_verification_if_phone_changed(db, producer, payload, old_phone)

    if category_ids is not None:
        _apply_categories(db, producer, category_ids)
    if delivery_area_cities is not None:
        _apply_delivery_cities(db, producer, delivery_area_cities)

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

    # MEH-375: post-commit cleanup. Helper handles set diff + dedup +
    # fail-open per-URL destroy.
    if "images" in payload:
        from app.cloudinary_utils import destroy_removed_images

        destroy_removed_images(
            old_images,
            producer.images or [],  # type: ignore[arg-type]
            context="admin.admin_update_producer images",
        )

    if indexnow.is_public_owner(producer):  # MEH-2852
        indexnow.schedule(
            background_tasks, urls_before + indexnow.producer_urls(producer)
        )

    attach_badge_fields(producer)
    _attach_has_owner(db, [producer])
    return producer


# MEH-769 (HOT-002): the toggle is purely the visibility switch for an
# already-decided business — approved ⇄ inactive only. Any other source
# status (draft / pending / rejected) must go through the real
# approve_producer flow, which fires the MEH-509 side-effects (approval
# email, producer_approved_v1 WhatsApp, admin WhatsApp). Before this guard
# the bare `else` branch silently force-approved a REJECTED producer onto
# the public map, skipping every validation and notification.
_TOGGLEABLE_STATUSES = {"approved", "inactive"}


@router.post("/producers/{producer_id}/toggle-status", response_model=None)
def toggle_producer_status(
    producer_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Toggle approved <-> inactive (hides from public listings).

    Refuses any other source status with 409 — use the approve/reject flow.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-769: block the rejected/pending → approved force-flip. Final user-
    # facing Hebrew lives in the frontend message key
    # (admin.producers.toggle.invalid_transition); this detail is the API
    # contract / fallback.
    if producer.status not in _TOGGLEABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="לא ניתן לשנות סטטוס במצב הנוכחי — יש לאשר או לדחות את העסק דרך מסלול האישור.",
        )
    was_approved = producer.status == "approved"
    if not was_approved:
        # MEH-2945 (Sapir 11/11: block): un-pausing puts the page back on the
        # site, so it passes the same content gates as approval — photo,
        # licence, verified WhatsApp. Without this, a business edited (or whose
        # licence lapsed) while paused came back live with content no gate saw.
        # Only this direction: hiding a page is never gated. No overrides here
        # on purpose — an admin who means to publish past a gate uses the
        # approve flow, which takes the explicit overrides and logs them.
        # MEH-769's "no side-effects" rule is untouched: this adds a check, not
        # the approval email/WhatsApp.
        _assert_approvable(db, producer, ApprovalOverrides(), user.id)  # type: ignore[arg-type]
    producer.status = "inactive" if was_approved else "approved"  # type: ignore[assignment]
    if was_approved:
        # MEH-2974: suspending a live page REVOKES any outstanding owner
        # invite on it.
        #
        # Without this, `inactive` means two different things that the row
        # cannot tell apart — "hidden while the admin finishes building it"
        # and "taken down for cause" — and owner-invite acceptance publishes
        # the first. So an owner sitting on a week-old link could accept after
        # a suspension and put the page back on the site herself: an
        # unauthenticated endpoint reversing a moderation decision, with the
        # group buys this same function just cancelled left cancelled. Found
        # by the fresh reviewer on PR #4356.
        #
        # Killing the token rather than teaching the accept to distinguish the
        # two, because the row carries no bit to distinguish them with, and
        # because this is the direction that ADDS a constraint (workflow rule
        # 32): the admin's own panel already tells her to hide the page BEFORE
        # creating the link («שימי לב, הדף כבר באוויר…»), so the sanctioned
        # order is unaffected and only the out-of-order case loses its link —
        # one click to re-mint.
        #
        # An ACCEPTED invite is left alone: `owner_invite_accepted_at` is the
        # record that it happened, and the business has a real owner now.
        if producer.owner_invite_token_hash and not producer.owner_invite_accepted_at:
            producer.owner_invite_token_hash = None  # type: ignore[assignment]
            producer.owner_invite_code_hash = None  # type: ignore[assignment]
            producer.owner_invite_code_expires_at = None  # type: ignore[assignment]
            producer.owner_invite_code_attempts = None  # type: ignore[assignment]
        # MEH-2498: suspending takes the business off the site, so its live
        # group buys go with it — cancelled in the same commit, participants
        # mailed. Folded into the block above rather than left as a second
        # `if was_approved:` immediately after it: two consecutive identical
        # conditions read as though one of them guards something else.
        cancel_live_group_buys(db, producer, background_tasks)
    db.commit()
    # MEH-2852: hidden or back on the site — either way the page changed.
    indexnow.schedule(background_tasks, indexnow.producer_urls(producer))
    return {"detail": "Status toggled", "status": producer.status}


@router.delete("/producers/{producer_id}", response_model=None)
def admin_delete_producer(
    producer_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-375 + MEH-510: capture every Cloudinary URL owned by this
    # producer BEFORE db.delete — the cascade detaches the relationship
    # and producer.images / Product.image_url / story_card_url become
    # unreachable after commit. Destroy runs AFTER commit so a
    # constraint / deadlock failure doesn't leave Cloudinary and DB
    # out of sync.
    #
    # MEH-510: story_card_url IS captured here. The reserved namespace
    # (mehamakor/producers/*) is protected by destroy_image's reject
    # list to keep the cleanup script from sweeping live story-cards,
    # but the producer-delete path is the one legitimate caller that
    # should free the slot — pass `bypass_reserved=True` to opt out.
    old_image_urls = list(producer.images or [])
    products = db.query(Product).filter(Product.producer_id == producer.id).all()
    old_product_urls = [p.image_url for p in products if p.image_url]
    old_story_card_url = producer.story_card_url
    # MEH-1335: owner photo lives at mehamakor/owner/owner_{producer_id} —
    # NOT in RESERVED_PUBLIC_ID_PREFIXES (only mehamakor/producers/ is), so
    # its destroy below needs no bypass. Same orphan class as story_card:
    # overwrite=True on upload prevents duplicates, not delete-orphans.
    old_owner_photo_url = producer.owner_photo_url
    # MEH-2852: the page goes with the row — its URL is read before the delete.
    removed_urls = (
        indexnow.producer_urls(producer) if indexnow.is_public_owner(producer) else []
    )

    # MEH-2503: a live group buy's participants are told before the cascade
    # removes it — same delisted email as a suspension (MEH-2498). Runs before
    # the unlink below: it reads User.producer_id to skip the owner herself.
    cancel_live_group_buys(db, producer, background_tasks)

    # MEH-747: unlink any user pointing at this producer BEFORE db.delete.
    # User.producer_id has no ondelete (models.py), so deleting the producer
    # while a self-registered owner still references it violates
    # users_producer_id_fkey → 500. Mirrors the auth.py::delete_account fix.
    # is_producer is also cleared: the producer is permanently gone, so the
    # "durable flag" no longer reflects reality, and leaving it True would
    # lock the owner out of re-registering (409 at auth.py — MEH-669 family).
    # role is reset to "consumer" for the same consistency reason:
    # require_producer (auth.py:268-273) gates on role ALONE, so a leftover
    # role="producer" with producer_id=NULL is an orphan that passes the dep
    # then 404s on every /producers/me* handler (producer_me.py:75-76).
    # Resetting role keeps the (role, producer_id) pair consistent — mirrors
    # the atomic set in the register flow (auth.py:511-514).
    # Admin-created producers have no linked user → update is a no-op.
    db.query(User).filter(User.producer_id == producer.id).update(
        {"producer_id": None, "is_producer": False, "role": "consumer"},
        synchronize_session=False,
    )
    db.flush()

    # MEH-2528: the deleted business's URL stays reserved — hard delete frees
    # the UNIQUE slot, and without the tombstone the next business with this
    # name would inherit every link to this one.
    retired_slugs.retire_slug(db, producer, "deleted")

    # MEH-816: phone_otp_tokens cascade via the DB FK (ondelete=CASCADE) plus
    # passive_deletes=True on the Producer.otp_tokens backref (MEH-773 Chunk B),
    # so no explicit pre-delete is needed. DO NOT re-add one — passive_deletes
    # already pre-empts the NotNullViolation the old MEH-755 bulk-delete guarded.
    db.delete(producer)
    db.commit()
    indexnow.schedule(background_tasks, removed_urls)  # MEH-2852

    # Post-commit orphan cleanup, fail-open per destroy_image contract.
    from app.cloudinary_utils import destroy_image

    for url in old_image_urls:
        destroy_image(url, context="admin.admin_delete_producer images")
    for url in old_product_urls:
        destroy_image(url, context="admin.admin_delete_producer product_image")  # type: ignore[arg-type]
    # MEH-510: bypass_reserved=True — the producer is gone, the slot is now an orphan.
    destroy_image(
        old_story_card_url,  # type: ignore[arg-type]
        bypass_reserved=True,
        context="admin.admin_delete_producer story_card",
    )
    # MEH-1335: owner photo — non-reserved namespace, default reject list OK.
    destroy_image(
        old_owner_photo_url,  # type: ignore[arg-type]
        context="admin.admin_delete_producer owner_photo",
    )

    return {"detail": "Producer deleted"}


@router.get("/producers/{producer_id}", response_model=ProducerAdminOut)
@limiter.limit("60/minute")
def admin_get_producer(
    request: Request,
    producer_id: UUID,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> ProducerAdminOut | Producer:
    """MEH-2072: the single-producer admin read. There was none before, and the
    admin EDIT PAGE was loading the PUBLIC serializer instead.

    ## The bug this closes, measured rather than reasoned

    `app/[locale]/admin/producers/[id]/edit/page.js` fetched `GET /producers/{id}`
    -> `ProducerDetailOut`. That shape carries no admin-only field, by design.
    So `ProducerForm` hydrated every one of them as `""` (its `initial.X ?? ""`
    idiom), and because the form POSTs its whole state back, saving ANY edit
    wrote those blanks over the stored values:

        producer_license_number  '1234567'  ->  ''
        address                  'הרצל 1'   ->  None

    Silent, on every admin save, including a save that only changed the name.
    `producer_license_number` is the regulatory field the whole "licensed
    businesses only" promise rests on, so this was live data loss on the one
    column the promise depends on.

    Two things made it invisible. The form's own comment asserted that the page
    called `GET /admin/producers/{id}` "which exposes the raw
    producer_license_number" — describing this route, which did not exist and
    returned **405**. And the failure has no error surface: the PUT succeeds,
    the page redirects, and the value is simply gone.

    ## Why a new route rather than widening the public one

    Widening `ProducerDetailOut` would publish licence numbers and street
    addresses to every visitor — the exact inversion of the MEH-530 privacy
    precedent. The admin needs a different SHAPE, not more public data.

    ## Route ordering is load-bearing

    Declared AFTER `/producers/pending` (:977) and `/producers/rejection-presets`
    (:1132). FastAPI matches in declaration order, so registering this above
    either of them would swallow both literals into `{producer_id}` and answer
    them with a UUID-parse 422. Do not move it up.

    Mirrors the list endpoint's post-query enrichment exactly — `attach_badge_fields`
    then `_attach_aging` — because a single-row read that skipped them would
    serialise a silent `0` for `business_days_waiting` and default badges, which
    is the "looks measured and is not" failure `_attach_aging`'s own docstring
    warns about.
    """
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
            # selectinload, matching the list endpoint (:448) — a 4th collection
            # joinedload would widen the existing 3-way cartesian. Needed by
            # attach_badge_fields' pickup_points/offers_pickup derivation.
            selectinload(Producer.locations),
        )
        .filter(Producer.id == producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    attach_badge_fields(producer)
    _attach_aging(producer)
    _attach_has_owner(db, [producer])
    return producer


# MEH-1406: admin home-products moderation endpoints removed from the live
# surface (was: GET /home-products/hidden, POST .../restore, DELETE .../{id},
# GET /home-products/flagged, POST .../approve, POST .../remove). The
# consumer home-cook feature was retired per brand LOCK (licensed
# businesses only), so its admin moderation queue is unmounted too. The
# HomeProduct model/schemas/tables are retained (no Alembic) — the /admin/stats
# counts below still read them; only the writable/queue endpoints are gone.


# MEH-587: admin Recipe endpoints removed (chunk 0/4) — see
# backend/alembic/versions/20260515_1430_d7e3c9a82f5b_meh_587_remove_zombie_recipes.py.


# --- MEH-53: Instagram story card ---


@router.post("/producers/{producer_id}/story-card", response_model=None)
def upload_story_card(
    producer_id: UUID,
    body: StoryCardUploadRequest,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Accept base64 JPEG canvas export, upload to Cloudinary, persist URL."""
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # Strip the data-URI prefix to get raw base64
    data_uri = body.image_data
    if "," in data_uri:
        data_uri = data_uri.split(",", 1)[1]

    import base64

    try:
        raw = base64.b64decode(data_uri)
    except Exception:
        raise HTTPException(status_code=400, detail="נתוני תמונה לא תקינים")

    if not settings.cloudinary_cloud_name:
        # Dev fallback
        return {"url": f"/placeholder-image.png?id={producer_id}", "saved": False}

    try:
        import cloudinary
        import cloudinary.uploader

        cloudinary.config(
            cloud_name=settings.cloudinary_cloud_name,
            api_key=settings.cloudinary_api_key,
            api_secret=settings.cloudinary_api_secret,
        )
        result = cloudinary.uploader.upload(
            raw,
            folder=f"mehamakor/producers/{producer_id}",
            public_id="story-card",
            resource_type="image",
            overwrite=True,
            format="jpg",
        )
        url = result["secure_url"]
        producer.story_card_url = url
        db.commit()
        return {"url": url, "saved": True}
    except Exception:
        # MEH-2375: Cloudinary's error text stays in the log, never in the response.
        logger.exception("story-card upload failed for producer %s", producer_id)
        raise HTTPException(status_code=500, detail="העלאת התמונה נכשלה")


# --- Stats ---
@router.get("/stats", response_model=None)
def get_stats(
    user: User = Depends(require_admin), db: Session = Depends(get_db)
) -> dict[str, Any]:
    return {
        # MEH-2465 (review #3723): businesses only, matching /admin/dashboard.
        "total_producers": db.query(Producer)
        .filter(Producer.kind == "producer")
        .count(),
        "pending_producers": db.query(Producer)
        .filter(Producer.status == "pending")
        .count(),
        "approved_producers": db.query(Producer)
        .filter(is_business())  # MEH-2459
        .count(),
        "total_users": db.query(User).count(),
        "total_home_products": db.query(HomeProduct)
        .filter(HomeProduct.is_active.is_(True))
        .count(),
        "hidden_home_products": db.query(HomeProduct)
        .filter(HomeProduct.is_hidden.is_(True))
        .count(),
    }


_DATA_GOV_URL = (
    "https://data.gov.il/api/3/action/datastore_search"
    "?resource_id=d4901968-dad3-4845-a9b0-a57d027f11ab&limit=1500"
)


# MEH-2241: this handler used to carry an inline copy of the parser in
# `scripts/seed_cities.py` — same guessed column names, same silent outcome.
# On Railway staging that script reported `Received 1272 records`, inserted
# nothing and exited 0, because the resource publishes `שם_ישוב` (one yod)
# while both parsers read `שם_יישוב` (two yods). PR #3288 fixed the script by
# discovering the column from the response; this route now calls the same
# function rather than holding a second copy of the bug. Two owners for one
# parse is the drift `.claude/rules/workflow.md` Smell #1 names, and here it
# was not hypothetical — fixing one would have left the other broken.
#
# The rationale lives in a comment, not the docstring: FastAPI publishes a
# route's docstring as the endpoint `description` in `backend/openapi.json`,
# which is a committed artifact that `frontend/lib/generated/` is derived
# from. Internal history does not belong in the API contract, and putting it
# there drags two generated files into every such diff.
@router.post("/seed-cities", status_code=200, response_model=None)
def seed_cities(
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Idempotent: fetch Israeli localities from data.gov.il and upsert into cities table."""
    # Imported here, not at module scope: `scripts.seed_cities` calls
    # `logging.basicConfig` when imported (it is written to be run as a
    # script), and the API process must not inherit that at boot merely
    # because this route exists.
    from scripts.seed_cities import LocalityParseError, parse_localities

    try:
        resp = httpx.get(_DATA_GOV_URL, timeout=30)
        resp.raise_for_status()
    except httpx.HTTPError:
        # MEH-2375: the transport error stays in the log, never in the response.
        logger.exception("seed-cities: data.gov.il fetch failed")
        raise HTTPException(
            status_code=502, detail="לא הצלחנו להביא את רשימת היישובים מ-data.gov.il"
        )

    try:
        cities = parse_localities(resp.json())
    except LocalityParseError as exc:
        # The message names the keys the records DID carry — the one piece of
        # evidence nobody could get from the sandbox. Surfacing it beats a 200
        # that says "seeded 0" and explains nothing. Excluded from MEH-2375 on
        # purpose: the text is ours (scripts/seed_cities.py), not a library's.
        raise HTTPException(
            status_code=502,
            detail=f"הרשומות התקבלו אך לא נמצאה בהן עמודת שם יישוב: {exc}",
        )

    inserted = 0
    for city in cities:
        result = db.execute(
            text(
                "INSERT INTO cities (name_he, lat, lng) VALUES (:name_he, :lat, :lng)"
                " ON CONFLICT (name_he) DO NOTHING"
            ),
            city,
        )
        inserted += cast(CursorResult[Any], result).rowcount
    db.commit()
    return {"seeded": inserted}
