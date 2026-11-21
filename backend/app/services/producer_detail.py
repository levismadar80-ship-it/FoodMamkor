"""
Module:   producer_detail
Purpose:  Load one public business page (by slug or by id) and build the
          ProducerDetailOut it answers with.
Touches:  producers + its collections (read) · reports (count) ·
          retired_slugs (410 / moved) · kashrut_badge_requests (read).
Does NOT: register routes or rate limits — GET /producers/by-slug/{slug} and
          GET /producers/{id} stay in routers/producers.py. Does not record a
          view — POST /producers/{id}/view does (MEH-2159).
Related:  backend/app/routers/producers.py (the two GET handlers) ·
          backend/app/services/kashrut_cert_proxy.py (servable_kashrut_certs) ·
          backend/app/services/producer_queries.py (attach_* helpers).
History:  MEH-3559 (moved here verbatim from routers/producers.py, no
          behaviour change); earlier history is in the inline anchors.
"""

from __future__ import annotations

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Query, Session, selectinload

from app.models import Producer, Report, User
from app.schemas.schemas import KashrutCertRef, ProducerDetailOut
from app.services import retired_slugs  # MEH-2534
from app.services.kashrut_cert_proxy import servable_kashrut_certs
from app.services.producer_listing import is_business, is_business_row
from app.services.product_order_menu import attach_takes_site_orders
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_count,
    attach_rescue_saving,
)


def _detail_query(db: Session) -> Query[Producer]:
    return db.query(Producer).options(
        # MEH-3385: one SELECT per collection. Three collection
        # joinedloads multiplied categories × products × delivery areas
        # into one result set. Order comes from each relationship's
        # order_by (models.py: categories by position, products by position).
        selectinload(Producer.categories),
        selectinload(Producer.products),
        selectinload(Producer.delivery_areas),
        # MEH-1402 — locations[] for ProducerDetailOut (separate SELECT).
        selectinload(Producer.locations),
        # MEH-1823: active_offer reads this collection — eager-load it here
        # or the property fires one query per producer on every list page.
        selectinload(Producer.offers),
    )


def producer_by_slug_or_raise(db: Session, slug: str) -> Producer:
    """The public business at `slug`; 410 for a deleted one, 404 otherwise."""
    producer = (
        _detail_query(db)
        # MEH-2459 · MEH-2952 chunk 3: a seeded test row is served here — its
        # direct URL is the golden-path run's — and the answer says noindex.
        .filter(Producer.slug == slug, is_business(include_test=True))
        .first()
    )
    if not producer:
        # MEH-2534: the URL of a deleted business answers 410, so the page can
        # say it is no longer listed instead of "not found". The page itself
        # streams 200 + noindex (like the MEH-1045 404 path); 410 is the API's
        # status, not the HTML's. Everything else that misses stays 404.
        if retired_slugs.is_gone(db, slug):
            raise HTTPException(status_code=410, detail="בית העסק כבר לא במהמקור")
        # MEH-3336: a renamed business. Still a 404 to every client that only
        # asks "is it here" — the page edge (middleware.js) reads `slug` and
        # answers the browser with a 301 to the current URL.
        new_slug = retired_slugs.moved_to(db, slug)
        if new_slug:
            raise HTTPException(
                status_code=404,
                detail={
                    "code": "slug_moved",
                    "message": "בית העסק עבר לכתובת חדשה",
                    "slug": new_slug,
                },
            )
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def producer_by_id_for_viewer(
    db: Session, producer_id: UUID, viewer: User | None
) -> Producer:
    """The business with `producer_id`, or 404 — also 404 for a non-public
    row unless the viewer is its owner or an admin."""
    producer = _detail_query(db).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-254 — pending/rejected producers are not consented-to-public. Only
    # the owner and admins may fetch them by UUID; everyone else sees 404 so
    # the UUID can't be used to enumerate queue state.
    # MEH-2459 — an organizer is never a public business either: same
    # owner/admin carve-out, same 404 for everyone else (its public face is
    # /organizers/{slug}, chunk 3).
    # MEH-2952: and a seeded test row (is_test) — same carve-out. Its public
    # face is by-slug (chunk 3, noindex); this UUID route stays closed.
    if not is_business_row(producer):
        is_admin = getattr(viewer, "role", None) == "admin"
        is_owner = viewer is not None and viewer.producer_id == producer.id
        if not (is_admin or is_owner):
            raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def detail_payload(db: Session, producer: Producer) -> ProducerDetailOut:
    """ProducerDetailOut for a loaded producer — the same for both GETs."""
    # MEH-18 — compute badge fields from the already-loaded relationships.
    attach_badge_fields(producer)
    # MEH-106: social proof count.
    attach_favorites_count(producer, db)
    attach_rescue_saving([producer], db)  # MEH-2716

    # Compute report_count from DB
    report_count = (
        db.query(func.count(Report.id))
        .filter(Report.producer_id == producer.id)
        .scalar()
        or 0
    )
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    attach_takes_site_orders(db, result, producer)  # MEH-3216 stage 5b
    # MEH-1672: badge codes only — the proxy owns the bytes and the URL.
    result.kashrut_certs = [
        KashrutCertRef(badge_code=c.badge_code)
        for c in servable_kashrut_certs(db, producer)
    ]
    return result
