from datetime import datetime
from urllib.parse import urlparse
from uuid import UUID

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.auth import (
    get_current_user_lenient,
    get_current_user_optional,
    require_verified_email,
)
from app.database import get_db
from app.models import (
    Category,
    ContactClick,
    KashrutBadgeRequest,
    Producer,
    ProducerWhatsAppClick,
    Report,
    User,
)
from app.rate_limit import limiter
from app.routers.producer_follows import router as producer_follows_router

# MEH-460 Pkg 5 (FINAL): ContactClickIn relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import (
    CategoryOut,
    ContactClickIn,
    DELIVERY_DAYS,
    KashrutCertRef,
    ProducerCityOut,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
    ProducerRandomOut,
)
from app.services.analytics import ViewContext, hash_ip, track_producer_view
from app.services.license_validation import ensure_license_for_categories
from app.services.producer_listing import build_producers_query
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_count,
    create_producer_with_relations,
    get_producer_or_404,
)

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["producers"])

# Compose the follow / unfollow / follow-status / my-following sub-router.
# FastAPI mounts these endpoints transitively when router_registry.py
# registers `producers.router` — no separate registration needed.
router.include_router(producer_follows_router)


# MEH-1833: the shared CDN policy for the two PUBLIC catalog GETs. 60s at the
# edge with a 5-minute stale-while-revalidate window — a catalog edit shows up
# within a minute, and the revalidation happens off the critical path.
# `public` is load-bearing and is exactly why this must never be applied to an
# endpoint that reads auth/user state: a shared cache may serve one user's
# response to another. Mirrors the mechanics of the no-store block in
# get_kashrut_cert below, with the policy inverted.
_PUBLIC_CATALOG_CACHE = "public, s-maxage=60, stale-while-revalidate=300"


@router.get("/producers", response_model=list[ProducerListOut])
@limiter.limit("120/minute")
def list_producers(
    request: Request,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float | None = None,
    # MEH-1282: geo-only opt-in for MEH-213's has_physical_location filter.
    # Default False → geo results include delivery-only producers (the home
    # "קרוב אליי" flow). Set true for map-pin semantics (physical location only).
    # No effect outside geo mode.
    require_physical: bool = False,
    # MEH-1465: OR over multiple categories — repeatable ?category=1&category=2.
    # A single ?category=5 still parses (→ [5]), so existing deep-links are
    # unchanged. The service filters via EXISTS on the whole list.
    category: list[int] | None = Query(None),
    delivery_city: str | None = None,
    # MEH-1487: region fallback — OR over several delivery cities
    # (?delivery_cities=a&delivery_cities=b). Same per-city condition as
    # delivery_city (delivery_areas ∪ nationwide-minus-excluded). Used by the
    # home empty-result "בתי עסק שמגיעים לאזור" section. delivery_city (single)
    # takes precedence when both are sent.
    delivery_cities: list[str] | None = Query(None),
    # MEH-1645: single canonical Hebrew day (schemas.DELIVERY_DAYS). Explicit
    # delivery_areas rows only — nationwide + day-less rows are excluded (v1
    # semantics; see producer_listing._delivery_day_condition). Validated
    # below with the router's manual-422 pattern (cf. sort).
    delivery_day: str | None = None,
    has_delivery: bool | None = None,
    verified: bool | None = None,
    # MEH-1259: the public ?organic query param is removed — self-declared
    # organic is no longer a filter (חוק תוצרת אורגנית 2005). See producer_listing.py.
    kosher: bool | None = None,
    # MEH-1881: opt-in "accepting orders right NOW" filter, evaluated against the
    # declared `order_window` in Asia/Jerusalem. Deliberately NOT `opening_hours`
    # — that is when the shop is staffed; this is when the owner said she takes
    # orders, and the conversion event here is a WhatsApp message, not a visit.
    # Absent → the listing is untouched, so no business is ever hidden by a
    # filter nobody asked for.
    open_for_orders_now: bool | None = None,
    # Producer city filter (producer's own city, not delivery area).
    city: str | None = None,
    is_available_today: bool | None = None,
    # MEH-291 — durable 4-value enum filter. Phase 3 frontend will switch
    # to this; the legacy is_available_today filter above stays during the
    # 7-day overlap. Default listing behavior unchanged in Phase 2.
    availability_state: str | None = None,
    grass_fed: bool | None = None,
    gluten_free: bool | None = None,
    vegan: bool | None = None,
    vegetarian: bool | None = None,  # MEH-1438 — matches is_vegetarian OR is_vegan
    lactose_free: bool | None = None,
    # MEH-1934 — EXISTS over products.is_no_added_sugar / is_low_carb, same
    # mechanic as the four axes above (_DIETARY_FILTERS in producer_listing).
    no_added_sugar: bool | None = None,
    low_carb: bool | None = None,
    # MEH-1483: sort axis for non-geo results. "newest" (default) or "rating".
    # Validated below — an unknown value 422s rather than silently defaulting.
    sort: str | None = None,
    # MEH-13 — free-text search over name + description, used by /search
    # results page. Aliased as `q` in the URL to match CLAUDE.md's
    # documented API shape, but named `search_q` internally so it doesn't
    # shadow the `q` SQLAlchemy-query-builder local below.
    search_q: str | None = Query(None, alias="q", max_length=200),
    # MEH-23 — offset-based pagination. Backwards-compatible: existing
    # callers that don't pass these get the first 100 rows (prior
    # behavior was "everything" which is fine at current scale but
    # unbounded). Total row count is exposed via X-Total-Count header
    # so the frontend can render "X מתוך Y" and numbered pagination.
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    # MEH-102 — exclude a single producer by UUID (used by similar-producers widget).
    exclude: UUID | None = None,
    response: Response = None,
    db: Session = Depends(get_db),
):
    # MEH-1483: validate the sort axis explicitly (the router's manual-422
    # pattern, cf. record_contact_click). None/"newest" = default created_at
    # DESC; "rating" = avg_rating DESC nulls-last. An unknown value 422s rather
    # than silently falling back to newest.
    if sort is not None and sort not in ("newest", "rating"):
        raise HTTPException(status_code=422, detail="ערך מיון לא חוקי")
    # MEH-1645: whitelist the day param against the canonical vocabulary —
    # same list DeliveryAreaCreate validates on the write path (MEH-1644).
    if delivery_day is not None and delivery_day not in DELIVERY_DAYS:
        raise HTTPException(
            status_code=422,
            detail="יום משלוח לא מוכר — יש לבחור יום בעברית (ראשון עד שבת)",
        )
    results, total_count = build_producers_query(
        db,
        lat=lat,
        lng=lng,
        radius_km=radius_km,
        require_physical=require_physical,
        category=category,
        delivery_city=delivery_city,
        delivery_cities=delivery_cities,
        delivery_day=delivery_day,
        has_delivery=has_delivery,
        verified=verified,
        kosher=kosher,
        open_for_orders_now=open_for_orders_now,  # MEH-1881
        city=city,
        is_available_today=is_available_today,
        # MEH-291 — opt-in 4-value enum filter; default listing behavior
        # unchanged in Phase 2 (Q4b — default-hide-on_vacation ships in
        # Phase 3 alongside frontend).
        availability_state=availability_state,
        grass_fed=grass_fed,
        gluten_free=gluten_free,
        vegan=vegan,
        vegetarian=vegetarian,  # MEH-1438
        lactose_free=lactose_free,
        no_added_sugar=no_added_sugar,  # MEH-1934
        low_carb=low_carb,  # MEH-1934
        sort=sort,
        search_q=search_q,
        limit=limit,
        offset=offset,
        exclude=exclude,
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(total_count)
        # MEH-1833: public catalog listing — safe to cache at the edge. Set on
        # the same guarded branch as X-Total-Count because `response` is an
        # optional injected param here (defaults to None in direct-call tests).
        response.headers["Cache-Control"] = _PUBLIC_CATALOG_CACHE
    return results


@router.get("/producers/count")
@limiter.limit("60/minute")
def producers_count(request: Request, db: Session = Depends(get_db)):
    """MEH-159 — lightweight total count for keeping pagination fresh client-side."""
    count = (
        db.query(func.count(Producer.id)).filter(Producer.status == "approved").scalar()
        or 0
    )
    return {"count": count}


@router.get("/producers/cities", response_model=list[ProducerCityOut])
@limiter.limit("60/minute")
def producers_cities(request: Request, db: Session = Depends(get_db)):
    """MEH-970 — per-city approved-producer counts for the /map region control.

    GROUP BY city over approved producers only. NULL / blank cities are
    omitted so a chip never lands on an empty map (empty-region guard). Counts
    are computed live from the DB — never hardcoded (over-claim guard MEH-519).
    Ordered by count desc, then city name. Returns ``[{"city": str, "count": int}]``.
    The /map frontend buckets these into regions client-side (MEH-970 chunk 2).
    """
    rows = (
        db.query(Producer.city, func.count(Producer.id).label("count"))
        .filter(
            Producer.status == "approved",
            Producer.city.isnot(None),
            func.trim(Producer.city) != "",
        )
        .group_by(Producer.city)
        .order_by(func.count(Producer.id).desc(), Producer.city)
        .all()
    )
    return [{"city": city, "count": count} for city, count in rows]


@router.get("/producers/random", response_model=ProducerRandomOut)
@limiter.limit("60/minute")
def random_producer(request: Request, db: Session = Depends(get_db)):
    """MEH-1288 — one random approved producer for the homepage "הפתיעו אותי"
    button. Returns only {id, slug} (enough for the client to navigate). 404
    when the catalog is empty — the button is render-gated on the approved
    count client-side, so 404 is only reachable via a race / direct call.

    DECLARED BEFORE ``/producers/{producer_id}`` on purpose: FastAPI matches in
    declaration order, and "random" would otherwise 422 against the UUID path
    param. Mirrors the ordering of /count, /cities, /by-slug above.
    """
    row = (
        db.query(Producer.id, Producer.slug)
        .filter(Producer.status == "approved")
        .order_by(func.random())
        .limit(1)
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="אין בתי עסק זמינים")
    return ProducerRandomOut(id=row.id, slug=row.slug)


@router.get("/producers/by-slug/{slug}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer_by_slug(slug: str, request: Request, db: Session = Depends(get_db)):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
            # MEH-1402 — locations[] for ProducerDetailOut (separate SELECT,
            # so it doesn't widen the 3-way collection joinedload cartesian).
            selectinload(Producer.locations),
            # MEH-1823: active_offer reads this collection — eager-load it here
            # or the property fires one query per producer on every list page.
            selectinload(Producer.offers),
        )
        .filter(Producer.slug == slug, Producer.status == "approved")
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    attach_badge_fields(producer)
    attach_favorites_count(producer, db)
    report_count = (
        db.query(func.count(Report.id))
        .filter(Report.producer_id == producer.id)
        .scalar()
        or 0
    )
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    # MEH-1672: badge codes only — the proxy owns the bytes and the URL.
    result.kashrut_certs = [
        KashrutCertRef(badge_code=c.badge_code)
        for c in _servable_kashrut_certs(db, producer)
    ]
    return result


@router.get("/producers/{producer_id}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer(
    producer_id: UUID,
    request: Request,
    from_: str | None = Query(None, alias="from"),
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
):
    producer = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            joinedload(Producer.products),
            joinedload(Producer.delivery_areas),
            # MEH-1402 — locations[] for ProducerDetailOut (separate SELECT,
            # so it doesn't widen the 3-way collection joinedload cartesian).
            selectinload(Producer.locations),
            # MEH-1823: active_offer reads this collection — eager-load it here
            # or the property fires one query per producer on every list page.
            selectinload(Producer.offers),
        )
        .filter(Producer.id == producer_id)
        .first()
    )
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-254 — pending/rejected producers are not consented-to-public. Only
    # the owner and admins may fetch them by UUID; everyone else sees 404 so
    # the UUID can't be used to enumerate queue state.
    if producer.status != "approved":
        is_admin = getattr(viewer, "role", None) == "admin"
        is_owner = viewer is not None and viewer.producer_id == producer.id
        if not (is_admin or is_owner):
            raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    # MEH-18 — compute badge fields from the already-loaded relationships.
    attach_badge_fields(producer)
    # MEH-106: social proof count.
    attach_favorites_count(producer, db)

    # Compute report_count from DB
    report_count = (
        db.query(func.count(Report.id))
        .filter(Report.producer_id == producer_id)
        .scalar()
        or 0
    )
    result = ProducerDetailOut.model_validate(producer)
    result.report_count = report_count
    # MEH-1672: badge codes only — the proxy owns the bytes and the URL.
    result.kashrut_certs = [
        KashrutCertRef(badge_code=c.badge_code)
        for c in _servable_kashrut_certs(db, producer)
    ]

    # feature/producer-analytics: track the view. Best-effort; swallows
    # all exceptions so tracking glitches can never break the response.
    # Bot UAs are filtered inside track_producer_view.
    client_ip = request.client.host if request.client else None
    track_producer_view(
        db,
        producer_id=producer_id,
        ctx=ViewContext(
            viewer_ip=client_ip,
            user_agent=request.headers.get("user-agent"),
            viewer_user=viewer,
            referrer=from_,
        ),
    )

    return result


@router.post("/producers/{producer_id}/whatsapp-click")
@limiter.limit("10/minute")  # SECURITY FIX #2 — cap anonymous write abuse
def record_whatsapp_click(
    request: Request,
    producer_id: UUID,
    db: Session = Depends(get_db),
    # MEH-1627: lenient, NOT get_current_user_optional. The frontend fires
    # this via navigator.sendBeacon as the tab hands off to wa.me — there is
    # no response handler, so a 401 could not be refreshed-and-retried and
    # the click would simply be lost. An expired token degrades to an
    # unattributed click; losing attribution beats losing the click.
    current_user: User | None = Depends(get_current_user_lenient),
):
    """Log a WhatsApp CTA click for the producer dashboard.

    Auth optional — JWT is accepted when present so the click can be
    attributed to a registered user. Frontend fires this via
    `navigator.sendBeacon` immediately before opening `wa.me` —
    fire-and-forget, doesn't block the window. Rate-limited 10/minute
    per IP to bound abuse. Unknown producer IDs return 404.
    """
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    db.add(
        ProducerWhatsAppClick(
            producer_id=producer_id,
            user_id=current_user.id if current_user else None,
        )
    )
    db.commit()
    return {"detail": "logged"}


_VALID_CONTACT_METHODS = frozenset({"phone", "instagram", "website", "email"})


@router.post("/producers/{producer_id}/contact-click", status_code=204)
@limiter.limit("10/minute")
def record_contact_click(
    request: Request,
    producer_id: UUID,
    data: ContactClickIn,
    db: Session = Depends(get_db),
    # MEH-1627: lenient — same keepalive/sendBeacon rationale as
    # whatsapp-click above. Fire-and-forget telemetry cannot retry.
    current_user: User | None = Depends(get_current_user_lenient),
):
    """Log a contact-method click for the producer dashboard.

    Accepts method ∈ {phone, instagram, website, email}. Auth optional —
    JWT when present attributes the click to a registered user. IP is
    SHA-256 hashed (reuses hash_ip from services/analytics). Rate-limited
    10/minute per IP consistent with whatsapp-click.
    """
    if data.method not in _VALID_CONTACT_METHODS:
        raise HTTPException(status_code=422, detail="method לא חוקי")
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    client_ip = request.client.host if request.client else None
    db.add(
        ContactClick(
            producer_id=producer_id,
            user_id=current_user.id if current_user else None,
            method=data.method,
            ip_hash=hash_ip(client_ip),
        )
    )
    db.commit()


@router.post("/producers", response_model=ProducerDetailOut, status_code=201)
def create_producer(
    data: ProducerCreate,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
):
    """Create a pending producer row.

    SECURITY: this endpoint was historically public, which meant anyone
    could create pending producers with no audit trail. It's now
    authenticated — any logged-in user can create, but anonymous callers
    get 401. The public "become a producer" signup flow lives at
    POST /auth/register/producer (see routers/auth.py) and is unaffected.
    """
    # MEH-530: 422s when a license-required category is selected without
    # a `producer_license_number`. Format check is intentionally absent
    # (frontend warning only — manual-approval flow stays open).
    ensure_license_for_categories(db, data.category_ids, data.producer_license_number)
    return create_producer_with_relations(db, data)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(response: Response, db: Session = Depends(get_db)):
    # MEH-1833: the category list is the most static public payload we serve —
    # same edge policy as /producers. No auth or user state is read here.
    response.headers["Cache-Control"] = _PUBLIC_CATALOG_CACHE
    return db.query(Category).order_by(Category.id).all()


# MEH-1672 (adversarial review): the only host the cert proxy will ever
# fetch from. `cert_url` is producer-submitted (KashrutRequestCreate only
# validates an https:// prefix), so the proxy is a server-side fetch of a
# value the requester controls — an explicit host allowlist is the SSRF
# defense, not a nice-to-have.
_ALLOWED_CERT_HOSTS = frozenset({"res.cloudinary.com"})

# MEH-1672 (adversarial review): the proxy streams and caps DURING download,
# not after — httpx.get().content would buffer the whole body first
# regardless of any check on the result. 8 MB gives headroom above the 5 MB
# upload-time cap (upload.py:MAX_FILE_SIZE) for re-encoding, not a promise
# that a 5 MB+ file is legitimate.
_MAX_CERT_BYTES = 8 * 1024 * 1024


# MEH-1672: the ONE rule deciding whether a kashrut certificate may be shown.
# Both call sites use it — the serializer that lists which badges have a cert,
# and the proxy that streams the bytes — so a badge can never be advertised as
# viewable while the proxy refuses it, or vice versa.
def _servable_kashrut_certs(
    db: Session, producer: Producer
) -> list[KashrutBadgeRequest]:
    """Approved requests with a cert, for an approved producer, not yet expired.

    Expiry is checked against `producer.kashrut_expires_at` — the same field
    KashrutBadgeStrip hides the whole strip on (MEH-1260). A legacy NULL
    expiry stays visible, matching that component exactly.
    """
    if producer.status != "approved":
        return []
    expires_at = producer.kashrut_expires_at
    if expires_at is not None and expires_at <= datetime.utcnow():
        return []
    return (
        db.query(KashrutBadgeRequest)
        .filter(
            KashrutBadgeRequest.producer_id == producer.id,
            KashrutBadgeRequest.status == "approved",
            KashrutBadgeRequest.cert_url.isnot(None),
            KashrutBadgeRequest.cert_url != "",
        )
        .all()
    )


@router.get("/producers/{producer_id}/kashrut-cert/{badge_code}")
@limiter.limit("30/minute")
def get_kashrut_cert(
    request: Request,
    producer_id: UUID,
    badge_code: str,
    db: Session = Depends(get_db),
):
    """MEH-1672: stream an approved, in-date kashrut certificate photo.

    A proxy, not a redirect: `cert_url` points at a `type=upload` Cloudinary
    asset, which is public forever to anyone holding the address
    (`upload.py:353-360` uploads with no `type=`). Handing that address to
    every visitor would publish a link no expiry could ever revoke. Streaming
    the bytes keeps the address inside the backend, so authorisation is
    re-evaluated on every single request and revocation is immediate.

    Every AUTHORIZATION failure is **404**, never 403: a 403 would confirm
    that a pending/rejected/expired certificate exists for this business,
    which is exactly the queue state MEH-254 keeps unenumerable. That
    boundary is fully evaluated (producer lookup, `_servable_kashrut_certs`,
    host allowlist) before any network call — a 502 can therefore ONLY be
    reached for a badge whose `kashrut_certs` entry is already public via
    the producer's own serializer, so it reveals nothing 404 doesn't already
    cover; it exists to distinguish "no such cert" from "cert exists but
    Cloudinary is transiently unreachable" for operators, not visitors.

    Full-hardening (`type=authenticated` + asset migration) is a separate
    post-launch ticket; this closes the exposure we would otherwise create.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="לא נמצא")

    match = next(
        (
            c
            for c in _servable_kashrut_certs(db, producer)
            if c.badge_code == badge_code
        ),
        None,
    )
    if match is None:
        raise HTTPException(status_code=404, detail="לא נמצא")

    # Adversarial review (MEH-1672): cert_url is written by the producer's own
    # kashrut-request submission and only validated to start with https://,
    # so an explicit host allowlist makes the SSRF defense here explicit
    # rather than resting on operational trust of the upload flow. No
    # redirect-follow either — a redirect off-host would defeat the check.
    if urlparse(match.cert_url).hostname not in _ALLOWED_CERT_HOSTS:
        logger.warning(
            "kashrut cert_url host not allowlisted", producer_id=str(producer_id)
        )
        raise HTTPException(status_code=404, detail="לא נמצא")

    try:
        with httpx.stream(
            "GET", match.cert_url, timeout=10.0, follow_redirects=False
        ) as upstream:
            if upstream.status_code != 200:
                raise HTTPException(status_code=404, detail="לא נמצא")

            content_type = upstream.headers.get(
                "content-type", "application/octet-stream"
            )
            # Only ever serve an image — the upload route sniffs magic bytes,
            # but the column is plain text, so this is the second lock
            # rather than the first.
            if not content_type.startswith("image/"):
                raise HTTPException(status_code=404, detail="לא נמצא")

            # Adversarial review: httpx.get().content buffers the WHOLE body
            # into memory regardless of any post-hoc size check on the
            # result — only streaming and capping DURING the read actually
            # bounds memory. _MAX_CERT_BYTES sits above the 5 MB upload cap
            # (upload.py:MAX_FILE_SIZE) with headroom for re-encoding.
            body = bytearray()
            for chunk in upstream.iter_bytes():
                body.extend(chunk)
                if len(body) > _MAX_CERT_BYTES:
                    logger.warning(
                        "kashrut cert exceeded size cap", producer_id=str(producer_id)
                    )
                    raise HTTPException(
                        status_code=502, detail="לא ניתן לטעון את התעודה כרגע"
                    )
    except HTTPException:
        raise
    except Exception:
        logger.warning("kashrut cert fetch failed", producer_id=str(producer_id))
        raise HTTPException(status_code=502, detail="לא ניתן לטעון את התעודה כרגע")

    return Response(
        content=bytes(body),
        media_type=content_type,
        headers={
            # Adversarial review: max-age=300 contradicted this endpoint's
            # own "revocation is immediate" claim — a browser could still
            # serve a stale image for up to 5 minutes after an admin
            # rejects a badge or it expires. no-store means every open of
            # the modal re-checks _servable_kashrut_certs for real.
            "Cache-Control": "no-store",
        },
    )
