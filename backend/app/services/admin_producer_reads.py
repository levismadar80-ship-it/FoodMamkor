"""
Module:   admin_producer_reads
Purpose:  What the admin business screens READ: the business list with its
          queue order and per-row enrichment, one business, the licence-expiry
          list and the /admin/stats counters.
Touches:  producers, users, home_products (read only).
Does NOT: write anything, or register routes — routers/admin.py keeps every
          route, its admin dependency and its docstring (the openapi
          description). Admin writes stay in routers/admin.py.
Related:  backend/app/routers/admin.py (list_producers, admin_get_producer,
          license_expiry_reminders, get_stats) · backend/app/routers/admin_decisions.py
          (the pending list reuses attach_aging + attach_has_owner).
History:  MEH-3562 (moved here verbatim from routers/admin.py, no behaviour
          change); earlier history is in the inline anchors.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import HomeProduct, Producer, User
from app.schemas.schemas import LicenseExpiryReminderOut, LicenseExpiryReminderRow
from app.services.admin_draft_missing import attach_draft_missing  # MEH-3409
from app.services.page_freshness import stale_clause
from app.services.producer_duplicates import attach_duplicate_signals  # MEH-3408
from app.services.producer_listing import is_business  # MEH-2459
from app.services.producer_queries import attach_badge_fields
from app.utils.clock import business_days_waiting, israel_now
from app.utils.pii import mask_phone
from app.utils.sql import LIKE_ESCAPE, escape_like


def attach_has_owner(db: Session, producers: list[Any]) -> None:
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
    for pid, uid, name, email in rows:
        # MEH-3256 (D9): the id rides along so «ניתוק בעלים» can say WHICH
        # owner the admin saw (expected_owner_user_id).
        owners.setdefault(pid, {"id": uid, "name": name, "email": email})
    for p in producers:
        p.has_owner = p.id in owners
        p.owner = owners.get(p.id)


def attach_aging(producer: Any) -> None:
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


def recommended_review_due_clause() -> ColumnElement[bool]:
    """SQL: the row carries the pick AND its clock is unset or past the window."""
    cutoff = israel_now() - timedelta(days=REVIEW_WINDOW_DAYS)
    return Producer.is_recommended.is_(True) & (
        Producer.recommended_at.is_(None) | (Producer.recommended_at < cutoff)
    )


def admin_producer_list(
    db: Session,
    *,
    status: str | None,
    search: str | None,
    recommended_review_due: bool,
    freshness_stale: bool,
) -> list[Producer]:
    """GET /admin/producers: filter, queue order, then per-row enrichment."""
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
        q = q.filter(recommended_review_due_clause())
    if freshness_stale:
        q = q.filter(stale_clause())
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
        attach_aging(p)
    attach_has_owner(db, results)
    # MEH-3409: what a claimed draft still lacks (after has_owner, which it reads).
    attach_draft_missing(db, results)
    # MEH-3408: «כפילות?» compares against every status, not the loaded page.
    attach_duplicate_signals(db, results)
    return results


def admin_producer_or_404(db: Session, producer_id: UUID) -> Producer:
    """GET /admin/producers/{id}: the row with the list's enrichment, or 404."""
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
    attach_aging(producer)
    attach_has_owner(db, [producer])
    return producer


# MEH-2072: how far ahead the licence reminder looks. One constant, not a query
# param — mirroring EXPIRY_REMINDER_WINDOW_DAYS in admin_kashrut.py:31 and for
# the same reason recorded there: a caller-chosen window lets a mistyped value
# sweep in every business on file, and the ticket scopes this to 30 days.
LICENSE_EXPIRY_REMINDER_WINDOW_DAYS = 30


def license_expiry_reminders_for(db: Session, today: date) -> LicenseExpiryReminderOut:
    """GET /admin/license-expiry-reminders; `today` is the Israel date."""
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


def admin_stats(db: Session) -> dict[str, Any]:
    """GET /admin/stats counters."""
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
