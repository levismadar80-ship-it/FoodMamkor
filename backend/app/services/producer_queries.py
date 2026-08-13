"""
Producer query helpers — pure ORM utilities used by the producers router.

Lifted from backend/app/routers/producers.py during the MEH-438 refactor.
These helpers carry no FastAPI surface and can be imported by any router
or background job that needs to hydrate or count Producer rows.
"""

from datetime import datetime
from uuid import UUID

import structlog
from fastapi import HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.orm import Session

from app.models import (
    DeliveryArea,
    Favorite,
    Producer,
    ProducerCategory,
    ProducerLocation,
)
from app.schemas.schemas import DeliveryAreaCreate, ProducerCreate

logger = structlog.get_logger(__name__)

# Earth radius in km — used by the Haversine formula. Accurate enough for
# city-scale directory queries (well under 0.5% error vs. WGS-84 ellipsoid).
EARTH_RADIUS_KM = 6371.0


def _haversine_expr(lat: float, lng: float, target_lat, target_lng):
    """Core Haversine formula (km) between a fixed (lat, lng) and a pair of
    target lat/lng column expressions. Parameterized on the target columns so
    the same trig can measure to `Producer.lat/lng` (single-point) or to
    `ProducerLocation.lat/lng` (per-location) — MEH-1402.

    The inner sum can land a hair above 1.0 due to float rounding, which
    would make acos() raise "input is out of range". func.least(1.0, ...)
    clamps it.
    """
    cos_delta = func.cos(func.radians(lat)) * func.cos(
        func.radians(target_lat)
    ) * func.cos(func.radians(target_lng) - func.radians(lng)) + func.sin(
        func.radians(lat)
    ) * func.sin(func.radians(target_lat))
    return EARTH_RADIUS_KM * func.acos(func.least(1.0, cos_delta))


def haversine_km(lat: float, lng: float):
    """
    Haversine distance (in km) between the caller's (lat, lng) and each
    producer's single `Producer.lat/lng` point. Returns a SQLAlchemy
    expression usable in SELECT, WHERE, and ORDER BY clauses. Runs entirely
    in Postgres — no PostGIS required, just standard trig functions.

    Retained as the single-point primitive; the multi-location geo path uses
    `haversine_min_km` (MEH-1402).
    """
    return _haversine_expr(lat, lng, Producer.lat, Producer.lng)


def haversine_min_km(lat: float, lng: float):
    """MEH-1402 (MEH-1388 chunk 2): NEAREST-point distance (km) from the
    caller's (lat, lng) to a producer, measured across ALL of that producer's
    `producer_locations` rows — the minimum wins (radius/sort want the closest
    branch or pickup point, not the primary).

    Implemented as a correlated scalar subquery (`MIN(...)` over the producer's
    location rows), NOT a JOIN in the main query — a JOIN would fan a producer
    out to one row per location and reopen the `_build_base_queries` double-
    count trap (producer_listing.py:104-110). Locations with a NULL lat OR lng
    are excluded from the MIN (no crash, just not a candidate point).

    Expand-Contract overlap (ADR-007): a producer with no usable location row
    yet — e.g. a brand-new signup created after chunk 1's backfill and before
    the chunk-4 write path — falls back via COALESCE to its own
    `Producer.lat/lng` mirror, so it never silently drops off the map/near
    feed during the overlap. Once chunk 4 dual-writes a primary location on
    create, the fallback becomes dead weight and can be dropped in Contract.
    A producer with neither a location nor a Producer point yields NULL, which
    fails `<= radius` and is correctly excluded.

    # DO NOT drop the CASE guard on the own-point fallback — Postgres LEAST()
    #        IGNORES NULL args, so func.least(1.0, cos_delta) returns 1.0 (not
    #        NULL) when Producer.lat/lng are NULL, making acos(1.0)=0 → a
    #        coordinate-less producer would falsely match at distance 0. The
    #        pre-MEH-1402 code guarded this with an explicit
    #        `Producer.lat IS NOT NULL` filter in _build_base_queries; the CASE
    #        below re-establishes the same guard inside the coalesced expr so
    #        NULL correctly propagates to `<= radius` (MEH-1402).
    """
    nearest_location_km = (
        select(
            func.min(
                _haversine_expr(lat, lng, ProducerLocation.lat, ProducerLocation.lng)
            )
        )
        .where(
            ProducerLocation.producer_id == Producer.id,
            ProducerLocation.lat.isnot(None),
            ProducerLocation.lng.isnot(None),
        )
        .correlate(Producer)
        .scalar_subquery()
    )
    own_point_km = case(
        (
            and_(Producer.lat.isnot(None), Producer.lng.isnot(None)),
            _haversine_expr(lat, lng, Producer.lat, Producer.lng),
        ),
        else_=None,
    )
    return func.coalesce(nearest_location_km, own_point_km)


def attach_badge_fields(producer):
    """MEH-18 — hydrate the computed fields the badge system consumes.
    Safe to call on already-loaded ORM instances. Assumes the products
    and delivery_areas collections are already loaded (via selectinload
    in list queries, joinedload in detail queries).

    MEH-293: also aggregates per-product dietary flags into
    `has_{gluten_free,vegan,lactose_free}_products` so the public listing
    output reflects the moved flags without an extra query (products are
    already loaded for products_count).
    """
    try:
        products = list(producer.products or [])
        producer.products_count = len(products)
    except Exception:
        logger.debug(
            "[producers] products lazy-load failed, defaulting to 0",
            producer_id=str(producer.id),
            exc_info=True,
        )
        products = []
        producer.products_count = 0
    # MEH-530: public-facing boolean signal — true when the producer has
    # supplied any non-blank license value. The raw number is never
    # populated onto ProducerListOut/ProducerDetailOut; admin/owner routes
    # use ProducerAdminOut which serialises the column directly.
    raw_license = getattr(producer, "producer_license_number", None)
    producer.has_producer_license = bool(raw_license and raw_license.strip())
    producer.has_gluten_free_products = any(
        getattr(p, "is_gluten_free", False) for p in products
    )
    producer.has_vegan_products = any(getattr(p, "is_vegan", False) for p in products)
    # MEH-1438: a vegan product is vegetarian by definition, so count is_vegan
    # too — mirrors the ?vegetarian filter's `is_vegetarian OR is_vegan`.
    producer.has_vegetarian_products = any(
        getattr(p, "is_vegetarian", False) or getattr(p, "is_vegan", False)
        for p in products
    )
    producer.has_lactose_free_products = any(
        getattr(p, "is_lactose_free", False) for p in products
    )
    # MEH-1934: plain single-flag aggregations. Deliberately NOT OR-ed with any
    # other axis the way has_vegetarian_products folds in is_vegan — no existing
    # flag implies "no added sugar" or "low carb".
    producer.has_no_added_sugar_products = any(
        getattr(p, "is_no_added_sugar", False) for p in products
    )
    producer.has_low_carb_products = any(
        getattr(p, "is_low_carb", False) for p in products
    )
    try:
        producer.delivery_count = len(producer.delivery_areas or [])
    except Exception:
        logger.debug(
            "[producers] delivery_areas lazy-load failed, defaulting to 0",
            producer_id=str(producer.id),
            exc_info=True,
        )
        producer.delivery_count = 0
    # MEH-2046: `delivers` / `offers_pickup` — the two fulfillment booleans the
    # consumer surfaces read (schemas.py ProducerListOut). Each mirrors ONE
    # listing predicate and must not drift from it:
    #   delivers      ↔ producer_listing._has_delivery_condition()
    #   offers_pickup ↔ producer_listing._pickup_condition() with no city
    # The mirror is two forms of one rule (SQL for the filter, Python for the
    # payload) because this module cannot import producer_listing — that module
    # imports THIS one. What holds them together is not this comment: it is
    # test_fulfillment_flags_match_filter_membership, which seeds the shape
    # matrix and asserts, per shape, that the serialized boolean equals actual
    # membership in the filtered result set. Change a predicate without changing
    # its mirror and that test reds.
    # Both are UNSCOPED (no city) — they describe the business, not the query.
    try:
        producer.delivers = bool(producer.offers_delivery) and (
            producer.delivery_count > 0 or bool(producer.delivery_nationwide)
        )
    except Exception:
        logger.debug(
            "[producers] delivers computation failed, defaulting to False",
            producer_id=str(producer.id),
            exc_info=True,
        )
        producer.delivers = False
    try:
        producer.offers_pickup = any(
            getattr(loc, "kind", None) in ("pickup", "market_stand")
            for loc in (producer.locations or [])
        )
    except Exception:
        logger.debug(
            "[producers] locations lazy-load failed, offers_pickup defaulting to False",
            producer_id=str(producer.id),
            exc_info=True,
        )
        producer.offers_pickup = False
    if producer.created_at:
        delta = datetime.utcnow() - producer.created_at
        producer.days_since_created = max(0, delta.days)
    else:
        producer.days_since_created = None
    return producer


def attach_favorites_counts(producers, db: Session):
    """MEH-106: batch-load favorites_count for a list of producers (single query)."""
    if not producers:
        return producers
    ids = [p.id for p in producers]
    counts = dict(
        db.query(Favorite.producer_id, func.count(Favorite.user_id))
        .filter(Favorite.producer_id.in_(ids))
        .group_by(Favorite.producer_id)
        .all()
    )
    for p in producers:
        p.favorites_count = counts.get(p.id, 0)
    return producers


def attach_favorites_count(producer, db: Session):
    """MEH-106: load favorites_count for a single producer."""
    producer.favorites_count = (
        db.query(func.count(Favorite.user_id))
        .filter(Favorite.producer_id == producer.id)
        .scalar()
        or 0
    )
    return producer


def get_producer_or_404(db: Session, producer_id: UUID) -> Producer:
    """Fetch a single producer by id or raise the project-standard 404.

    Used by endpoints that need a presence check before performing a
    side-effect (click logging, follow toggle). Returns the full row so
    callers can read whichever fields they need; the cost is one row
    fetch versus a `SELECT 1`-style existence probe.
    """
    producer = db.query(Producer).filter(Producer.id == producer_id).first()
    if not producer:
        raise HTTPException(status_code=404, detail="בית עסק לא נמצא")
    return producer


def persist_registration_delivery_areas(
    db: Session, producer: Producer, areas: list[DeliveryAreaCreate] | None
) -> None:
    """MEH-1921 — write a signup payload's delivery areas AND the declaration.

    Asking to be listed for these cities IS declaring that you deliver, so the
    two are written together and by ONE owner. Every registration path used to
    build the `DeliveryArea` rows inline and never touch `offers_delivery`,
    leaving it at `default=False` (models.py:253) — and MEH-1848 conjoined that
    flag into both delivery predicates (producer_listing.py:243,276), so the row
    the owner had just created was precisely the one the filters exclude. She
    typed her delivery cities in and the site answered "does not deliver".

    The database cannot catch this and says so: models.py:463-466 records that
    the pair "delivery_areas rows + offers_delivery=false" is enforced ONLY in
    the query layer, the CHECK covering just `delivery_nationwide AND NOT
    offers_delivery`.

    This is the same semantics `tests/conftest.py:180-188` already gave the test
    factory under MEH-1848 — "asking this factory for delivery areas means 'a
    business that delivers to these cities', so it must also declare that it
    delivers". The fixture was fixed then; the production write paths were not.

    EDIT paths deliberately do NOT route through here: `producer_me.py:97,145`
    and `admin.py:286` replace areas on an existing business whose owner or an
    admin sets `offers_delivery` explicitly (producer_me.py:387-391), policed by
    `delivery_validation.py:68-74`. Deriving the flag there would silently
    override a deliberate choice — the opposite bug. Derive on CREATE, never on
    EDIT, is the whole rule.

    CLASSIFY BY CALLER, NOT BY CALL SITE. `admin.py`'s `_apply_delivery_cities`
    (:103) is invoked by BOTH the PUT route (:286, edit) and the CREATE route
    (:211) — so reading the helper as "an edit path" hides a create. That is a
    mistake this change actually made and a second reviewer caught: admin-create
    is the fifth create-from-payload site, it produces `status="approved"` rows
    that are live immediately, and it is handled at its own call site (:211)
    rather than here, because `ProducerAdminCreate` carries `offers_delivery`
    and an explicitly-stated `false` must survive. This helper's callers are the
    four paths whose payload CANNOT state the flag.

    Never writes `False`: an empty list means "this payload said nothing about
    delivery", not "this business does not deliver", and the column default
    already covers the former.

    MEH-1947: `delivery_fee` IS persisted now. It was not, and neither did the
    three inline loops this replaced — `DeliveryAreaCreate` carries four fields
    (`city`, `min_order`, `delivery_day`, `delivery_fee`) and three were written
    — so a signup stating a per-area fee lost it silently and the area inherited
    the producer-level rate. That was left open deliberately while the
    reading end was still broken (MEH-1942, Zod stripped the same field before it
    reached the page); fixing one side alone would have moved the bug rather than
    closed it. With #2693 merged the pipe runs to the screen, so the source is
    filled here.

    Passed straight through, NOT coalesced. `0` and `None` are different facts:
    `0` = "delivery to this city is free", `None` = "the owner stated nothing,
    inherit the producer rate". `da.delivery_fee or None` would look equivalent
    and would convert every free city back into an inheriting one — billing for
    a delivery its owner declared free. Both ends are built on that distinction:
    `schemas.py:870-873` states the three values on the field itself, and
    `DeliveryBlock.jsx:320` repeats them for the renderer, which resolves the
    inheritance at `:417-430`.
    """
    wrote_any = False
    for da in areas or []:
        db.add(
            DeliveryArea(
                producer_id=producer.id,
                city=da.city,
                min_order=da.min_order,
                delivery_day=da.delivery_day,
                delivery_fee=da.delivery_fee,
            )
        )
        wrote_any = True
    if wrote_any:
        producer.offers_delivery = True


def create_primary_branch_location(
    db: Session, producer: Producer
) -> ProducerLocation | None:
    """MEH-1939 (MEH-1938 chunk 1) — the registration half of the dual-write.

    Every path that creates a producer from a signup payload also creates ONE
    `producer_locations` row for it: `kind='branch'`, `is_primary=True`. The
    `Producer.city/lat/lng` columns keep being written exactly as before — this
    is Expand, not replacement, and nothing reads the new row yet.

    Why this exists at all: `haversine_min_km` below already COALESCEs to
    `Producer.lat/lng` and its comment (`:75-95`) says the fallback becomes
    dead weight "once chunk 4 dual-writes a primary location on create".
    MEH-1421 shipped only the dashboard write path, so that create never
    happened and the fallback has been carrying the gap since.

    Returns None — and adds nothing — when either coordinate is missing. That
    is the CONDITION, not an edge case: a location row without coordinates is
    invisible to `producerPoints()` and to the geo query alike, so it would be
    a row that exists only to be skipped, while still counting as "this
    producer has locations" for anything that tests the collection's length.
    A delivery-only business legitimately has no point (MEH-213).

    Does NOT commit. Callers add this to their own open transaction, the same
    way they already do for ProducerCategory and DeliveryArea, so a failure
    anywhere in registration rolls the location back with everything else.

    Takes the flushed `Producer` rather than its five fields: the row this
    writes is a MIRROR of those columns, so reading them off the instance is
    what makes the two physically unable to drift. It also keeps the signature
    at two parameters, which is the arity `PLR0913` / ESLint `max-params` are
    both asking for (`.claude/rules/code-execution.md:53-55`). Callers must
    have flushed — `producer.id` is read here.

    # DO NOT add a backfill for existing producers here — that is chunk 2, and
    # it is an Alembic data migration, not application code.
    """
    if producer.lat is None or producer.lng is None:
        return None

    location = ProducerLocation(
        producer_id=producer.id,
        kind="branch",
        is_primary=True,
        city=producer.city,
        address=producer.address,
        lat=producer.lat,
        lng=producer.lng,
        # Coordinates on a signup payload come from AddressSearch's geocode
        # (MEH-1808), so the point is a real street-level fix. The
        # `approximate` case is a town with no address, which by the guard
        # above produces no row at all.
        location_precision="exact",
    )
    db.add(location)
    return location


def create_producer_with_relations(db: Session, data: ProducerCreate) -> Producer:
    """Create a pending producer row plus its category and delivery-area
    join rows in a single transaction. Returns the refreshed instance.

    Mirrors the pre-refactor body of the POST /producers endpoint
    verbatim: status defaults to 'pending', category_ids and
    delivery_areas are persisted as ProducerCategory / DeliveryArea
    rows, then the producer is committed and refreshed.
    """
    producer = Producer(
        name=data.name,
        description=data.description,
        city=data.city,
        lat=data.lat,
        lng=data.lng,
        phone=data.phone,
        instagram=data.instagram,
        website=data.website,
        # MEH-296 3d: public-create parity for the new channels.
        facebook=data.facebook,
        external_order_form=data.external_order_form,
        # MEH-530: persisted as-is — None when not supplied. Conditional
        # required-vs-optional is gated by the router-level helper before
        # this function is called.
        producer_license_number=data.producer_license_number,
        status="pending",
    )
    db.add(producer)
    db.flush()

    # MEH-1297: payload order = stored order (position 0 = primary).
    for pos, cid in enumerate(data.category_ids):
        db.add(ProducerCategory(producer_id=producer.id, category_id=cid, position=pos))

    # MEH-1921: areas + the offers_delivery declaration, written together.
    persist_registration_delivery_areas(db, producer, data.delivery_areas)

    # MEH-1939: the dual-write. `ProducerCreate` carries no `address` field
    # (schemas.py:1324-1338), so `producer.address` is None here — the row gets
    # city + coordinates only, and `ProducerLocation.address` is nullable.
    create_primary_branch_location(db, producer)

    db.commit()
    db.refresh(producer)
    return producer
