from typing import Any
from uuid import UUID

import httpx  # noqa: F401 — tests patch producers_module.httpx.stream (MEH-3559)
import structlog
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    get_current_user_lenient,
    get_current_user_optional,
    require_verified_email,
)
from app.database import get_db
from app.models import (
    Category,
    DeliveryWaitlistEntry,
    Producer,
    User,
)
from app.rate_limit import limiter

# MEH-460 Pkg 5 (FINAL): ContactClickIn relocated to app.schemas.schemas per ADR-006 R1.
from app.schemas.schemas import (
    CategoryOut,
    ContactClickIn,
    DeliveryWaitlistIn,
    DeliveryWaitlistOut,
    DeliveryWaitlistHostConfirmIn,
    DeliveryWaitlistUnsubscribeIn,
    ProducerCreate,
    ProducerDetailOut,
    ProducerListOut,
    ProducerRandomOut,
    ProducerViewIn,
    WhatsAppClickIn,
)
from app.services import delivery_waitlist  # MEH-2618
from app.services.analytics import (
    EventContext,
    is_internal_viewer,
    record_analytics_event,
)
from app.services.farmer_declaration import farmer_declaration_stamp  # MEH-3137
from app.services.license_validation import ensure_license_for_categories
from app.services.producer_listing import (
    build_producers_query,
    is_business,
    is_business_row,
)
from app.services.producer_queries import (
    create_producer_with_relations,
    get_producer_or_404,
)
from app.services.kashrut_cert_proxy import (  # MEH-3559
    MAX_CERT_BYTES as _MAX_CERT_BYTES,  # noqa: F401 — read by tests
    servable_kashrut_certs as _servable_kashrut_certs,  # noqa: F401 — re-exported
    stream_kashrut_cert,
)
from app.services.producer_catalog import (  # MEH-3559
    catalog_count,
    random_catalog_producer,
    validate_listing_filters,
    validate_listing_sort,
)
from app.services.producer_detail import (  # MEH-3559
    detail_payload,
    producer_by_id_for_viewer,
    producer_by_slug_or_raise,
)
from app.utils.clock import utc_now
from app.utils.pii import round_coord

logger = structlog.get_logger(__name__)
router = APIRouter(tags=["producers"])


# MEH-1833: the shared CDN policy for the two PUBLIC catalog GETs.
# `public` is load-bearing and is exactly why this must never be applied to an
# endpoint that reads auth/user state: a shared cache may serve one user's
# response to another. Mirrors the mechanics of the no-store block in
# get_kashrut_cert below, with the policy inverted.
#
# MEH-1876: this header is only ONE of two stacked layers, and the window a
# reader actually experiences is the SUM. The previous comment here claimed "a
# catalog edit shows up within a minute" — true of this line in isolation, and
# false of the system. Measured on staging 03/08: a removed offer stayed
# publicly visible for ~6 minutes, because the old values composed as
#     Next revalidate 60  +  s-maxage 60  +  stale-while-revalidate 300  ≈ 420s
# Next serves its cached copy for `revalidate`, and each refetch may itself be
# handed a response the edge has already held for `s-maxage + swr`.
#
# The values below are chosen so that sum is bounded, not so each line reads
# well alone:  30 (Next) + 30 (s-maxage) + 30 (swr) = 90s worst case.
# The swr window is kept non-zero deliberately — it is what keeps revalidation
# off the critical path — but it is now the same order as the freshness window
# instead of 5x it.
#
# SCOPE — deliberately partial (orchestrator ruling 09/08, option B). The 90s
# figure is true for `/producers` ONLY. `/map` reads the same two endpoints but
# stacks its own `revalidate: 3600` (frontend/app/[locale]/map/page.js:54), so a
# removed offer can remain visible there for up to ~1 hour. That is a knowing
# trade: /map is a browse surface, and pulling it to 90s would re-fetch a
# ~100-producer payload up to 60x more often for a lower-stakes staleness. Do
# not read the 90s as site-wide.
_PUBLIC_CATALOG_CACHE = "public, s-maxage=30, stale-while-revalidate=30"


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
    # MEH-2036: OR over several days — repeatable ?delivery_days=שישי&delivery_days=רביעי.
    # Same whitelist + same same-row EXISTS as the singular above, just an IN on
    # the day column. Takes PRECEDENCE over delivery_day when both are sent (the
    # singular is now only a back-compat deep-link); the service de-duplicates
    # and caps the list at the seven canonical days.
    # REUSES: delivery_cities:113 (repeatable list param) + category:106.
    delivery_days: list[str] | None = Query(None),
    has_delivery: bool | None = None,
    # MEH-2046: "offers self-pickup". The param keeps the column's name because
    # that is the user-facing axis, but the predicate reads pickup /
    # market_stand rows on producer_locations, NOT the near-dead
    # Producer.pickup_points column — see _pickup_condition for why.
    # OR-ed with the delivery axes (a service group), never a rung on their
    # precedence ladder.
    pickup_points: bool | None = None,
    # MEH-2598: "buy on site" — a physical store with stated opening hours. A
    # third PEER of the service group (OR-ed with delivery and pickup), the
    # filter twin of the map card's «קנייה במקום» tag.
    on_site: bool | None = None,
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
    # MEH-2790: OR over several cities — ?cities=a&cities=b. A region is 7 to
    # 18 towns and `city` takes one, so the category x region landing pages
    # need the list form. Per-city semantics are `_located_in_city_condition`
    # (the business IS there: its own city or any of its location rows), the
    # same reading near_city uses. Capped at 40 like delivery_cities (MEH-1487)
    # — over the cap this 422s below rather than truncating silently, because a
    # truncated region would quietly under-count a landing page's gate.
    cities: list[str] | None = Query(None),
    # MEH-2602: the map's «סננו לפי עיר» — businesses located in the city
    # (own city or any location row) OR delivering to it, located ones first.
    # delivery_city keeps its strict "delivers to" meaning for the other callers.
    near_city: str | None = None,
    # MEH-291 — durable 4-value enum filter, the only availability filter.
    # MEH-2272 removed the one-release legacy boolean alias that MEH-2271
    # mapped onto it. FastAPI ignores an undeclared query parameter, so a
    # stale caller still sending it gets a 200 and an UNFILTERED listing —
    # not a 422 (pinned in tests/test_api.py::TestAvailabilityState).
    availability_state: str | None = None,
    grass_fed: bool | None = None,
    gluten_free: bool | None = None,
    vegan: bool | None = None,
    vegetarian: bool | None = None,  # MEH-1438 — matches is_vegetarian OR is_vegan
    # MEH-1508 chunk 3ב — the 100% axes. Distinct from `vegan` above, which is
    # "at least one matching product OR the declaration" (chunk 3א): these two
    # are the DECLARATION ALONE, so «100% טבעוני» can be filtered on separately
    # from «מתאים לטבעונים». A business with one vegan cookie satisfies `vegan`
    # and must not satisfy `vegan_all`.
    vegan_all: bool | None = None,
    vegetarian_all: bool | None = None,
    lactose_free: bool | None = None,
    # MEH-1934 — EXISTS over products.is_no_added_sugar / is_low_carb, same
    # mechanic as the four axes above (_DIETARY_FILTERS in producer_listing).
    no_added_sugar: bool | None = None,
    low_carb: bool | None = None,
    # MEH-1287 chunk B — the seasonal homepage module reads this. TRUE selects
    # businesses an editor marked in season with an unexpired date; FALSE is the
    # exact complement (unmarked OR expired). Editorial, not owner-declared:
    # `in_season_until` is deliberately absent from ProducerUpdate (chunk A
    # guard), so a business cannot put itself here.
    in_season: bool | None = None,
    # MEH-1483: sort axis for non-geo results. "newest" (default) or "rating".
    # MEH-1829: "distance" — nearest-location Haversine ASC, NULL coords LAST,
    # NO radius filter (sorting never hides a row). Needs lat+lng, no radius_km;
    # with radius_km the request is the geo path and the axis is ignored.
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
    response: Response = None,  # type: ignore[assignment]  # FastAPI injects it; widening the annotation would change param parsing
    db: Session = Depends(get_db),
) -> list[ProducerListOut] | list[Producer]:
    # MEH-3219 (B17): never use a visitor's exact point — ~1 km is enough.
    lat, lng = round_coord(lat), round_coord(lng)
    # MEH-3559: the manual 422s (sort, distance needs lat+lng, the cities
    # cap, the day whitelist) live in services/producer_catalog.py.
    validate_listing_sort(sort=sort, lat=lat, lng=lng)
    validate_listing_filters(
        cities=cities, delivery_day=delivery_day, delivery_days=delivery_days
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
        delivery_days=delivery_days,  # MEH-2036
        has_delivery=has_delivery,
        pickup_points=pickup_points,  # MEH-2046
        on_site=on_site,  # MEH-2598
        verified=verified,
        kosher=kosher,
        open_for_orders_now=open_for_orders_now,  # MEH-1881
        city=city,
        cities=cities,  # MEH-2790
        near_city=near_city,  # MEH-2602
        # MEH-291 — opt-in 4-value enum filter; default listing behavior
        # unchanged in Phase 2 (Q4b — default-hide-on_vacation ships in
        # Phase 3 alongside frontend).
        availability_state=availability_state,
        grass_fed=grass_fed,
        gluten_free=gluten_free,
        vegan=vegan,
        vegetarian=vegetarian,  # MEH-1438
        vegan_all=vegan_all,  # MEH-1508 chunk 3ב
        vegetarian_all=vegetarian_all,
        lactose_free=lactose_free,
        no_added_sugar=no_added_sugar,  # MEH-1934
        low_carb=low_carb,  # MEH-1934
        in_season=in_season,  # MEH-1287 chunk B
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


@router.get("/producers/count", response_model=None)
@limiter.limit("60/minute")
def producers_count(request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """MEH-159 — lightweight total count for keeping pagination fresh client-side.

    MEH-1986: applies the catalog's default-hide rule, so this number and the
    ``X-Total-Count`` header of ``GET /producers`` are the same number. They
    feed the same "X מתוך Y" counter (``ProducersClient.jsx:378``), and before
    this they disagreed by every producer on vacation.
    """
    count = catalog_count(db)  # MEH-3559
    return {"count": count}


@router.get("/producers/random", response_model=ProducerRandomOut)
@limiter.limit("60/minute")
def random_producer(
    request: Request, db: Session = Depends(get_db)
) -> ProducerRandomOut:
    """MEH-1288 — one random approved producer for the homepage "הפתיעו אותי"
    button. Returns only {id, slug} (enough for the client to navigate). 404
    when the catalog is empty — the button is render-gated on the approved
    count client-side, so 404 is only reachable via a race / direct call.

    DECLARED BEFORE ``/producers/{producer_id}`` on purpose: FastAPI matches in
    declaration order, and "random" would otherwise 422 against the UUID path
    param. Mirrors the ordering of /count, /cities, /by-slug above.

    MEH-1986: draws from the same set the catalog shows. "Surprise me" landing
    on a business the catalog deliberately hides is the one case where the
    default-hide is not merely inconsistent but actively wrong — the button
    promises a business the visitor could have found by browsing.
    """
    return random_catalog_producer(db)  # MEH-3559


@router.get("/producers/by-slug/{slug}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer_by_slug(
    slug: str, request: Request, db: Session = Depends(get_db)
) -> ProducerDetailOut:
    # MEH-3559: the lookup (410 deleted / 404 moved / 404) and the payload
    # live in services/producer_detail.py.
    producer = producer_by_slug_or_raise(db, slug)
    return detail_payload(db, producer)


@router.get("/producers/{producer_id}", response_model=ProducerDetailOut)
@limiter.limit("120/minute")
def get_producer(
    producer_id: UUID,
    request: Request,
    viewer: User | None = Depends(get_current_user_optional),
    db: Session = Depends(get_db),
) -> ProducerDetailOut:
    # MEH-3559: the lookup, the owner/admin carve-out for a non-public row
    # (MEH-254 / MEH-2459 / MEH-2952) and the payload live in
    # services/producer_detail.py.
    producer = producer_by_id_for_viewer(db, producer_id, viewer)
    result = detail_payload(db, producer)

    # MEH-2159: this GET no longer records a view. Counting inside a read
    # made the row depend on WHICH endpoint happened to be called rather
    # than on "someone opened the page", which produced three bugs at once:
    # the /{slug} route recorded nothing (it calls get_producer_by_slug,
    # which never tracked), the /producer/{uuid} route recorded twice (SSR
    # plus client), and the SSR row carried no Authorization header — so
    # is_internal_viewer saw viewer=None and the owner's own visit counted
    # despite MEH-2156. The browser now reports the event explicitly via
    # POST /producers/{id}/view, the same shape contact-click already uses.
    return result


@router.post("/producers/{producer_id}/view", status_code=204)
@limiter.limit("60/minute")
def record_producer_view(
    request: Request,
    producer_id: UUID,
    data: ProducerViewIn,
    db: Session = Depends(get_db),
    # MEH-2159: lenient, for the same reason as contact-click below — a
    # keepalive beacon fired during navigation cannot retry, so an expired
    # token must degrade to "anonymous view" and never to a 401 the page
    # has already navigated away from.
    current_user: User | None = Depends(get_current_user_lenient),
) -> None:
    """Record one page view for the producer dashboard.

    The browser reports this explicitly instead of it being a side effect of
    GET /producers/{id}. Auth optional; the owner's and admins' own views are
    skipped inside record_analytics_event. Rate-limited 60/minute per IP —
    higher than the click endpoints because one is expected per page load.
    """
    # Existence check first, so a bogus id 404s rather than silently
    # recording nothing — same ordering as the two click endpoints.
    producer = get_producer_or_404(db, producer_id)

    # MEH-2159 + MEH-254: mirror the pending/rejected gate that guards
    # GET /producers/{id} (producers.py:407-412). Without it this endpoint
    # is an enumeration oracle for the moderation queue: the GET 404s a
    # non-approved producer to a stranger, so answering 204 here would let
    # anyone tell a real-but-unapproved UUID (204) from a nonexistent one
    # (404) — the exact disclosure MEH-254 closed. Measured before the fix:
    # pending -> GET=404 / POST=204 / 1 row written by the stranger.
    #
    # It also stops a stranger writing rows onto a pending business's
    # counter, which is the number MEH-2156 exists to make trustworthy.
    #
    # DO NOT fork the condition — it must agree with the GET's gate, which
    # is what makes "any view of a non-approved profile is necessarily the
    # owner or an admin" true. is_internal_viewer is that same shape,
    # extracted (services/analytics.py).
    # MEH-2459: `or kind != "producer"` mirrors the GET's gate above — an
    # organizer is 404 to strangers there, so it is 404 here too.
    # MEH-2952: the same is_business_row as the GET, test rows included.
    if not is_business_row(producer) and not is_internal_viewer(
        current_user, producer_id
    ):
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")

    record_analytics_event(
        db,
        event="page_view",
        producer_id=producer_id,
        ctx=EventContext(request=request, viewer=current_user, referrer=data.referrer),
    )


@router.post("/producers/{producer_id}/whatsapp-click", response_model=None)
@limiter.limit("10/minute")  # SECURITY FIX #2 — cap anonymous write abuse
def record_whatsapp_click(
    request: Request,
    producer_id: UUID,
    # MEH-1677: OPTIONAL body carrying the coverage-request city. It must stay
    # optional: the anonymous path uses navigator.sendBeacon, which cannot set
    # Content-Type: application/json, so a required body would 422 every
    # anonymous WhatsApp click on the site. Only CoverageRequestCta sends one.
    data: WhatsAppClickIn | None = None,
    db: Session = Depends(get_db),
    # MEH-1627: lenient, NOT get_current_user_optional. The frontend fires
    # this via navigator.sendBeacon as the tab hands off to wa.me — there is
    # no response handler, so a 401 could not be refreshed-and-retried and
    # the click would simply be lost. An expired token degrades to an
    # unattributed click; losing attribution beats losing the click.
    current_user: User | None = Depends(get_current_user_lenient),
) -> dict[str, Any]:
    """Log a WhatsApp CTA click for the producer dashboard.

    Auth optional — JWT is accepted when present so the click can be
    attributed to a registered user. Frontend fires this via
    `navigator.sendBeacon` immediately before opening `wa.me` —
    fire-and-forget, doesn't block the window. Rate-limited 10/minute
    per IP to bound abuse. Unknown producer IDs return 404.
    """
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    # MEH-2156: the owner's own clicks (and any admin's) are not audience, so
    # they are not logged. The check gates the WRITE and not the return, so
    # there is exactly one exit and the two paths cannot drift apart — an
    # early `return {"detail": "logged"}` would duplicate the body literal,
    # and this endpoint's guarantee is that an owner's response is
    # indistinguishable from a visitor's. Placed after get_producer_or_404 so
    # a bogus producer_id still 404s for the owner.
    # Rationale in full: the predicate's docstring in services/analytics.py.
    #
    # DO NOT move this explanation into the docstring above — a route
    # handler's docstring IS the `description` field in backend/openapi.json,
    # so editing it is a public-contract change that reds the committed-spec
    # snapshot (tests/test_openapi_contract_snapshot.py).
    # MEH-2160: the owner/admin skip is no longer decided here — it, the bot
    # filter, the trusted-proxy IP and the fail-open write all live in
    # record_analytics_event, which is the only place an analytics row is
    # written. The gate stays OUT of this handler on purpose: a rule expressed
    # at the call site is a rule the next writer has to remember.
    record_analytics_event(
        db,
        event="whatsapp_click",
        producer_id=producer_id,
        ctx=EventContext(
            request=request, viewer=current_user, city=data.city if data else None
        ),
    )
    return {"detail": "logged"}


# MEH-2626: "whatsapp_group" = a tap on the business's WhatsApp updates link
# (contact-card bell + delivery-checker pill). It is a contact click, not a
# WhatsApp CTA click — those stay on /whatsapp-click — so it lands here, and
# the first-review gate (reviews.py, MEH-2204) reads it with no change there.
# MEH-2999: facebook + external_order are primary-CTA channels too (MEH-296)
# and secondary circles on the contact card; they were 422'd here, so those
# clicks were lost and never opened the first-review gate. Every non-WhatsApp
# key in frontend/lib/contact-method.js CONTACT_METHODS must be in this set —
# frontend/__tests__/ContactMethodsBackendContract.test.js reds otherwise.
_VALID_CONTACT_METHODS = frozenset(
    {
        "phone",
        "instagram",
        "website",
        "email",
        "whatsapp_group",
        "facebook",
        "external_order",
    }
)


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
) -> None:
    """Log a contact-method click for the producer dashboard.

    Accepts method ∈ _VALID_CONTACT_METHODS. Auth optional —
    JWT when present attributes the click to a registered user. IP is
    SHA-256 hashed (reuses hash_ip from services/analytics). Rate-limited
    10/minute per IP consistent with whatsapp-click.
    """
    if data.method not in _VALID_CONTACT_METHODS:
        raise HTTPException(status_code=422, detail="סוג הפנייה לא תקין")
    # existence check — full row acceptable at 10/min rate limit
    get_producer_or_404(db, producer_id)
    # MEH-2156: owner/admin clicks are not audience, so they are not logged.
    # Same shape as record_whatsapp_click deliberately — gate the WRITE, not
    # the return. Placed after the 422 and the 404 so validation is identical
    # for the owner, and the 204 she receives is indistinguishable from a
    # visitor's. (Kept out of the docstring — see record_whatsapp_click.)
    # MEH-2160: same as whatsapp-click above — every exclusion rule and the
    # write itself live in record_analytics_event.
    record_analytics_event(
        db,
        event="contact_click",
        producer_id=producer_id,
        ctx=EventContext(request=request, viewer=current_user, method=data.method),
    )


@router.post(
    "/producers/{producer_id}/delivery-waitlist",
    response_model=DeliveryWaitlistOut,
    status_code=201,
)
@limiter.limit("10/minute")  # anonymous write — same cap as whatsapp-click
def join_delivery_waitlist(
    request: Request,
    response: Response,
    background_tasks: BackgroundTasks,
    producer_id: UUID,
    data: DeliveryWaitlistIn,
    db: Session = Depends(get_db),
    # MEH-1627: an ordinary form that can retry, so `_optional` (an expired
    # token is a 401 and the client refreshes), never `_lenient`.
    current_user: User | None = Depends(get_current_user_optional),
) -> DeliveryWaitlistOut:
    """«תודיעו לי כשתגיעו ל{עיר}» — join a business's per-city delivery waitlist.

    No account needed: email + city. Returns 201 `added`, or 200 `exists`
    when this email already waits for this business and city. Known and
    accepted: `exists` and `host_confirm` tell an anonymous caller whether an
    address is on this list / already a host — the same disclosure the
    waitlist made since MEH-2618, kept so the form can be honest about
    whether a mail went out (double-opt-in UX norm). 404 for an
    unknown or not-yet-live business. When the business later adds the
    city to its delivery areas, one email goes out (see
    services/delivery_waitlist). Rate-limited 10/minute per IP.
    """
    # MEH-2618: the public listing filter, not a bare existence check — a
    # pending/rejected business has no public page to send her to, and its
    # trigger would never fire (notify_cities applies the same filter).
    producer = (
        db.query(Producer).filter(Producer.id == producer_id, is_business()).first()
    )
    if producer is None:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    # MEH-2952: a test business or a signed-in test account → no mail.
    test_cause = bool(
        producer.is_test or (current_user is not None and current_user.is_test)
    )
    existing = delivery_waitlist.find_entry(
        db,
        producer.id,  # type: ignore[arg-type]
        city=data.city,
        email=data.email,
    )
    if existing is not None:
        # MEH-2673: a repeat signup that ticks «אשמח לארח» (re)sends the
        # confirmation link; the row turns True only from that link. An
        # unticked repeat changes nothing — never a silent withdrawal.
        host_confirm = None
        if data.wants_to_host:
            if existing.wants_to_host:
                host_confirm = "confirmed"
            else:
                verdict = delivery_waitlist.claim_host_confirm_send(db, existing)
                if verdict == "send":
                    # Captured before the commit: expire_on_commit would
                    # otherwise refresh the row just to read three columns.
                    mail_args = (
                        existing.id,
                        existing.email,
                        existing.city,
                        producer.name,
                    )
                    db.commit()
                    host_confirm = "sent"
                    background_tasks.add_task(
                        delivery_waitlist.send_host_confirmation,
                        *mail_args,  # type: ignore[arg-type]
                        test_cause=test_cause,
                    )
                else:
                    db.rollback()  # releases the advisory lock, nothing to write
                    host_confirm = verdict
        response.status_code = 200
        return DeliveryWaitlistOut(status="exists", host_confirm=host_confirm)
    entry = delivery_waitlist.add_entry(
        db, producer, email=data.email, city=data.city, user=current_user
    )
    new_verdict: delivery_waitlist.HostConfirmVerdict | None = None
    try:
        # The INSERT is flushed here, inside the except below, BEFORE the
        # claim takes the per-address lock — so a double-tap (two first-time
        # POSTs for the same row in flight) trips the unique constraint
        # here, not as an unhandled 500 out of the claim's own statements.
        db.flush()
        if data.wants_to_host:
            # Stamped before the commit so this mail counts toward the
            # per-address cap; the mail itself is queued after the commit.
            new_verdict = delivery_waitlist.claim_host_confirm_send(db, entry)
        mail_args = (entry.id, entry.email, entry.city, producer.name)
        db.commit()
    except IntegrityError:
        # Two identical POSTs in flight (double-tap): both passed find_entry,
        # the second trips uq_delivery_waitlist_city_email. That is the same
        # calm "exists" as the sequential duplicate, not a 500.
        db.rollback()
        response.status_code = 200
        return DeliveryWaitlistOut(status="exists")
    host_confirm = new_verdict
    if new_verdict == "send":
        # MEH-2673: the box alone shares nothing. The row stays
        # wants_to_host=False until the address itself clicks the link —
        # otherwise anyone could hand a stranger's email to a business.
        host_confirm = "sent"
        background_tasks.add_task(
            delivery_waitlist.send_host_confirmation,
            *mail_args,  # type: ignore[arg-type]
            test_cause=test_cause,
        )
    return DeliveryWaitlistOut(status="added", host_confirm=host_confirm)


@router.post("/delivery-waitlist/host-confirm", status_code=200, response_model=None)
@limiter.limit("10/minute")
def confirm_delivery_waitlist_host(
    request: Request,
    data: DeliveryWaitlistHostConfirmIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict[str, Any] | JSONResponse:
    """MEH-2673: «מאשרים, אפשר להעביר» — the signed link from the host
    confirmation email. Turns the entry's wants_to_host on, so the business
    sees this email in its pickup_hosts list. Idempotent. 400 on a token
    that does not verify or an entry that no longer exists (unsubscribed).

    410 on an expired token — and, because the token still names the entry,
    a FRESH link is mailed to the same address right here (under the usual
    cooldown/cap), so the page is never a dead end (the double-opt-in norm:
    an expired link offers a new one). The body carries `resent` so the page
    can say whether to look in the inbox. An expired link never confirms."""
    entry_id, state = delivery_waitlist.inspect_host_confirm_token(data.token)
    entry = db.get(DeliveryWaitlistEntry, entry_id) if entry_id else None
    if entry is None:
        raise HTTPException(status_code=400, detail="הקישור לא תקין או שפג תוקפו")
    if state == "expired" and not entry.wants_to_host:
        # An expired link on an already-confirmed entry falls through to the
        # idempotent 200 below: the consent is on record, no error page.
        resent = False
        if delivery_waitlist.claim_host_confirm_send(db, entry) == "send":
            mail_args = (entry.id, entry.email, entry.city, entry.producer.name)
            db.commit()
            resent = True
            background_tasks.add_task(
                delivery_waitlist.send_host_confirmation,
                *mail_args,  # type: ignore[arg-type]
                test_cause=bool(entry.producer and entry.producer.is_test),
            )
        else:
            db.rollback()  # releases the advisory lock, nothing to write
        return JSONResponse(
            status_code=410,
            content={"detail": "הקישור לא תקין או שפג תוקפו", "resent": resent},
        )
    if not entry.wants_to_host:
        entry.wants_to_host = True  # type: ignore[assignment]
        entry.host_confirmed_at = utc_now()  # type: ignore[assignment]
        db.commit()
    return {"producer_name": entry.producer.name}


@router.post("/delivery-waitlist/unsubscribe", status_code=200, response_model=None)
@limiter.limit("10/minute")
def unsubscribe_delivery_waitlist(
    request: Request,
    data: DeliveryWaitlistUnsubscribeIn,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Remove one delivery-waitlist entry via the signed token from its email.

    Idempotent: an already-removed entry is still 200. 400 on a token that
    does not verify.
    """
    entry_id = delivery_waitlist.decode_unsubscribe_token(data.token)
    if entry_id is None:
        raise HTTPException(status_code=400, detail="קישור ביטול לא תקין")
    entry = db.get(DeliveryWaitlistEntry, entry_id)
    if entry is not None:
        db.delete(entry)
        db.commit()
    return {"detail": "הוסרת מרשימת ההמתנה"}


@router.post("/producers", response_model=ProducerDetailOut, status_code=201)
@limiter.limit("10/hour")  # MEH-3022
def create_producer(
    request: Request,  # required by slowapi (MEH-3022)
    data: ProducerCreate,
    user: User = Depends(require_verified_email),
    db: Session = Depends(get_db),
) -> ProducerDetailOut | Producer:
    """Create a DRAFT producer row.

    SECURITY: this endpoint was historically public, which meant anyone
    could create pending producers with no audit trail. It's now
    authenticated — any logged-in user can create, but anonymous callers
    get 401. The public "become a producer" signup flow lives at
    POST /auth/register/producer (see routers/auth.py) and is unaffected.

    MEH-2100: the row lands in `draft`, so "any logged-in user can create"
    no longer means "any logged-in user can put a row in front of the
    admin". Reaching the review queue now requires
    POST /producers/me/submit-for-review, which is owner-scoped and gated
    on a complete profile. Deepens the audit-trail fix above rather than
    replacing it.
    """
    # MEH-530: 422s when a license-required category is selected without
    # a `producer_license_number`. Format check is intentionally absent
    # (frontend warning only — manual-approval flow stays open).
    ensure_license_for_categories(db, data.category_ids, data.producer_license_number)
    # MEH-3137: same grower gate as registration, after the license 422 —
    # but NOT recorded. This row is an ownerless draft (no owner_id), so
    # whoever calls this route is not the business owner; the stamp stays
    # NULL and the claim / owner invite asks the real owner.
    farmer_declaration_stamp(db, data.category_ids, data.farmer_declaration_accepted)
    return create_producer_with_relations(db, data)


@router.get("/categories", response_model=list[CategoryOut])
@limiter.limit("60/minute")
def list_categories(
    request: Request, response: Response, db: Session = Depends(get_db)
) -> list[CategoryOut] | list[Category]:
    # MEH-1833: the category list is the most static public payload we serve —
    # same edge policy as /producers. No auth or user state is read here.
    response.headers["Cache-Control"] = _PUBLIC_CATALOG_CACHE
    return db.query(Category).order_by(Category.id).all()


# MEH-3559: the cert proxy's rules (host allowlist, size cap, content types,
# servable_kashrut_certs) and its body live in services/kashrut_cert_proxy.py.
# The private names stay importable here: producer_draft_preview.py and tests
# read them from this module.


@router.get("/producers/{producer_id}/kashrut-cert/{badge_code}", response_model=None)
@limiter.limit("30/minute")
def get_kashrut_cert(
    request: Request,
    producer_id: UUID,
    badge_code: str,
    db: Session = Depends(get_db),
) -> dict[str, Any] | Response:
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
    return stream_kashrut_cert(db, producer_id, badge_code)  # MEH-3559
