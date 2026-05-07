"""
Producer listing query builder.

Lifted verbatim from `list_producers` in
backend/app/routers/producers.py during the MEH-438 refactor. The
public function `build_producers_query` builds two parallel SQLAlchemy
queries (full SELECT and count), applies filters, runs the cross-field
search (MEH-99), the exclude filter (MEH-102), logs the search,
executes the paginated query, dedupes geo results, and returns the
rows + total count for the X-Total-Count header.

API contract is byte-identical to the prior inline implementation —
order of operations, search-query commit timing, geo dedup logic, and
the badge / favorites attachment all preserved.
"""

# Private helpers below exist to chunk build_producers_query into PL-compliant
# functions. Single-use by design — not for reuse. The ruff PL ignore that
# previously covered this complexity in producers.py cannot be migrated here
# because pyproject.toml is protected by MEH-442 protect-lint-config hook.

from typing import Any

import structlog
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    Product,
    SearchQuery,
)
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_counts,
    haversine_km,
)

logger = structlog.get_logger(__name__)

# (key in filters dict, attribute on Producer model) — covers the simple
# `if v is not None: q = q.filter(Producer.<attr> == v)` pattern. The
# remaining filter pairs (kosher, category, delivery_city, has_delivery,
# city, dietary) need bespoke logic and stay inline below.
_SIMPLE_FILTERS: list[tuple[str, str]] = [
    ("verified", "is_verified"),
    ("organic", "organic_certified"),
    ("is_available_today", "is_available_today"),
    # MEH-291 — opt-in 4-value enum filter. Default listing behavior unchanged
    # in Phase 2 (Q4b — default-hide-on_vacation ships in Phase 3 with frontend).
    ("availability_state", "availability_state"),
    ("grass_fed", "grass_fed"),
]

# MEH-293 — dietary flags moved to products. Public filter signature is
# unchanged (`?vegan=true` etc.); the SQL switches from
# `Producer.vegan == TRUE` to an EXISTS subquery on Product.is_vegan, so a
# producer matches when at least one of their products carries the flag.
_DIETARY_FILTERS: list[tuple[str, str]] = [
    ("gluten_free", "is_gluten_free"),
    ("vegan", "is_vegan"),
    ("lactose_free", "is_lactose_free"),
]


def _build_base_queries(
    db: Session, *, geo: tuple[float, float, float] | None, sort: str | None
):
    """Initial q + count_q.

    `geo=(lat, lng, radius_km)` activates the geo search path (Haversine
    distance, MEH-213 physical-location filter, ORDER BY distance ASC);
    `geo=None` is the standard listing path (sort by created_at DESC or
    rating per the `sort` arg).

    Build two parallel queries:
      q       — full SELECT (Producer + eager-loaded relationships, plus
                distance_expr in geo mode; carries joinedload options and
                ORDER BY distance_km).
      count_q — bare `SELECT COUNT(DISTINCT producer.id)`; NO joinedload,
                NO order_by, NO extra SELECT entities.
    Earlier this function did `q.with_entities(func.count(...))`, which
    dragged joinedload + order_by artifacts into the count SQL and made
    Postgres reject the query with a 500 on every geo search. Keep the
    two queries separate and apply each filter/join to BOTH so the total
    count stays consistent with the page slice.
    """
    if geo is not None:
        lat, lng, radius_km = geo
        distance_expr = haversine_km(lat, lng).label("distance_km")
        q = (
            db.query(Producer, distance_expr)
            .options(
                joinedload(Producer.categories),
                # MEH-18 — batch-load the two collections the badge system counts.
                selectinload(Producer.products),
                selectinload(Producer.delivery_areas),
            )
            .filter(Producer.status == "approved")
            # MEH-213: map pins only for producers with a physical location.
            # Delivery-only producers have no address to pin on the map.
            .filter(Producer.has_physical_location.is_(True))
            # Haversine is undefined for NULL coords — exclude them before
            # applying the distance filter.
            .filter(Producer.lat.isnot(None), Producer.lng.isnot(None))
            .filter(distance_expr <= radius_km)
            .order_by(distance_expr.asc())
        )
        count_q = (
            db.query(func.count(Producer.id.distinct()))
            .select_from(Producer)
            .filter(Producer.status == "approved")
            .filter(Producer.has_physical_location.is_(True))
            .filter(Producer.lat.isnot(None), Producer.lng.isnot(None))
            .filter(haversine_km(lat, lng) <= radius_km)
        )
        return q, count_q

    order = (
        (Producer.avg_rating.desc(), Producer.reviews_count.desc())
        if sort == "rating"
        else (Producer.created_at.desc(),)
    )
    q = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            selectinload(Producer.products),
            selectinload(Producer.delivery_areas),
        )
        .filter(Producer.status == "approved")
        .order_by(*order)
    )
    count_q = (
        db.query(func.count(Producer.id.distinct()))
        .select_from(Producer)
        .filter(Producer.status == "approved")
    )
    return q, count_q


def _apply_scalar_filters(q, count_q, **filters: Any):  # noqa: C901  # 14 boolean filter pairs by design — _SIMPLE_FILTERS / _DIETARY_FILTERS dispatch tables + 5 structurally distinct query branches (kosher / category / delivery / city). Refactor would fragment coherent listing logic.
    """Apply the 14 boolean/scalar filter pairs to both queries."""
    # Simple equality filters — driven from _SIMPLE_FILTERS so each new
    # boolean column needs only an extra row, not a new branch.
    for key, attr in _SIMPLE_FILTERS:
        val = filters.get(key)
        if val is None:
            continue
        col = getattr(Producer, attr)
        q = q.filter(col == val)
        count_q = count_q.filter(col == val)

    # MEH-293 — dietary flag filter via EXISTS subquery on products.
    # `?vegan=true` matches producers with at least one is_vegan=TRUE product;
    # `?vegan=false` matches producers with no such product. The 7-day
    # overlap migration backfilled `products.is_vegan = producers.vegan` so
    # the matched set is identical on day 1 (modulo producers who had the
    # flag set but zero products — they correctly drop out per MEH-293).
    for key, prod_attr in _DIETARY_FILTERS:
        val = filters.get(key)
        if val is None:
            continue
        prod_col = getattr(Product, prod_attr)
        cond = Producer.products.any(prod_col.is_(True))
        q = q.filter(cond if val else ~cond)
        count_q = count_q.filter(cond if val else ~cond)

    # MEH-291 Phase 3 — default-hide on_vacation. When the caller does NOT
    # explicitly filter by availability_state, exclude vacation producers from
    # the default listing (still reachable via direct slug / favorites / an
    # explicit ?availability_state=on_vacation). User-visible behavior shift
    # bundled with the Phase 3 frontend per Q2a.
    if filters.get("availability_state") is None:
        q = q.filter(Producer.availability_state != "on_vacation")
        count_q = count_q.filter(Producer.availability_state != "on_vacation")

    kosher = filters.get("kosher")
    if kosher is not None:
        if kosher:
            q = q.filter(Producer.kosher.isnot(None), Producer.kosher != "")
            count_q = count_q.filter(Producer.kosher.isnot(None), Producer.kosher != "")
        else:
            q = q.filter((Producer.kosher.is_(None)) | (Producer.kosher == ""))
            count_q = count_q.filter(
                (Producer.kosher.is_(None)) | (Producer.kosher == "")
            )

    category = filters.get("category")
    if category is not None:
        q = q.join(ProducerCategory).filter(ProducerCategory.category_id == category)
        count_q = count_q.join(ProducerCategory).filter(
            ProducerCategory.category_id == category
        )

    delivery_city = filters.get("delivery_city")
    has_delivery = filters.get("has_delivery")
    if delivery_city:
        q = q.join(DeliveryArea).filter(
            func.lower(DeliveryArea.city) == delivery_city.lower()
        )
        count_q = count_q.join(DeliveryArea).filter(
            func.lower(DeliveryArea.city) == delivery_city.lower()
        )
    elif has_delivery:
        q = q.filter(Producer.delivery_areas.any())
        count_q = count_q.filter(Producer.delivery_areas.any())

    city = filters.get("city")
    if city:
        q = q.filter(func.lower(Producer.city) == city.lower())
        count_q = count_q.filter(func.lower(Producer.city) == city.lower())

    return q, count_q


def _apply_search_filter(
    db: Session, q, count_q, search_q: str | None, *, geo_search: bool
):
    """MEH-99 cross-field search: name · description · city · category names · product names.

    Adds relevance ordering in non-geo mode (exact-match first, then
    prefix, then rating, then created_at) — geo mode keeps distance ASC.
    """
    if not (search_q and search_q.strip()):
        return q, count_q

    clean = search_q.strip()
    like = f"%{clean}%"

    has_category = (
        db.query(ProducerCategory)
        .join(Category, Category.id == ProducerCategory.category_id)
        .filter(
            ProducerCategory.producer_id == Producer.id,
            Category.name.ilike(like),
        )
        .exists()
    )
    has_product = (
        db.query(Product)
        .filter(
            Product.producer_id == Producer.id,
            Product.name.ilike(like),
        )
        .exists()
    )
    search_filter = (
        Producer.name.ilike(like)
        | Producer.description.ilike(like)
        | Producer.city.ilike(like)
        | has_category
        | has_product
    )
    q = q.filter(search_filter)
    count_q = count_q.filter(search_filter)

    if not geo_search:
        q = q.order_by(False).order_by(
            (func.lower(Producer.name) == clean.lower()).desc(),
            Producer.name.ilike(f"{clean}%").desc(),
            Producer.avg_rating.desc(),
            Producer.created_at.desc(),
        )

    return q, count_q


def _log_search(db: Session, search_q: str | None, total_count: int) -> None:
    """MEH-99 — log every search (zero AND non-zero) so trending has signal.

    Zero-result rows are used for discovery; non-zero rows drive
    /search/trending. MEH-267: ORM insert (not raw SQL) so id +
    searched_at come from Python-side model defaults — alembic baseline
    has no server_default on these columns.

    Side-effect only — exceptions are swallowed so a SearchQuery write
    failure can never break the listing response.
    """
    if not (search_q and search_q.strip()):
        return
    try:
        db.add(SearchQuery(query=search_q.strip()[:200], results_count=total_count))
        db.commit()
    except Exception:
        db.rollback()
        logger.warning("[producers] search_queries INSERT failed", exc_info=True)


def _finalize_results(q, db: Session, *, geo_search: bool, limit: int, offset: int):
    """Paginate, geo-dedup, attach badges + favorites. Returns the row list."""
    if geo_search:
        # A multi-entity query combined with joinedload on a collection
        # relationship (categories) can emit duplicate rows — the legacy
        # Query identity-map dedupe only applies to single-entity queries.
        # De-dupe by producer id while preserving the distance-ASC order.
        seen: set = set()
        results: list = []
        # Slice at the SQL layer: offset first, then limit.
        for producer, distance_km in q.offset(offset).limit(limit).all():
            if producer.id in seen:
                continue
            seen.add(producer.id)
            # Attach computed distance so Pydantic's from_attributes picks
            # it up in ProducerListOut.
            producer.distance_km = round(float(distance_km), 2)
            attach_badge_fields(producer)
            results.append(producer)
        attach_favorites_counts(results, db)
        return results

    rows = q.offset(offset).limit(limit).all()
    for p in rows:
        attach_badge_fields(p)
    attach_favorites_counts(rows, db)
    return rows


def build_producers_query(db: Session, **filters: Any) -> tuple[list[Producer], int]:
    """Run the producers list query.

    Returns (results, total_count). Caller is responsible for setting
    the X-Total-Count response header — the service stays HTTP-agnostic.

    Expected keys in **filters: lat, lng, radius_km, category,
    delivery_city, has_delivery, verified, organic, kosher, city,
    is_available_today, grass_fed, gluten_free, vegan, lactose_free,
    sort, search_q, limit, offset, exclude.
    """
    lat = filters.get("lat")
    lng = filters.get("lng")
    radius_km = filters.get("radius_km")
    sort = filters.get("sort")
    search_q = filters.get("search_q")
    limit = filters.get("limit", 100)
    offset = filters.get("offset", 0)
    exclude = filters.get("exclude")

    geo = (
        (lat, lng, radius_km)
        if (lat is not None and lng is not None and radius_km is not None)
        else None
    )
    geo_search = geo is not None

    q, count_q = _build_base_queries(db, geo=geo, sort=sort)
    q, count_q = _apply_scalar_filters(q, count_q, **filters)
    q, count_q = _apply_search_filter(db, q, count_q, search_q, geo_search=geo_search)

    # MEH-102 — exclude a specific producer (used by similar-producers widget).
    if exclude is not None:
        q = q.filter(Producer.id != exclude)
        count_q = count_q.filter(Producer.id != exclude)

    # MEH-23 — total BEFORE applying limit/offset so the frontend can render
    # "X מתוך Y" and numbered pagination.
    total_count = count_q.scalar() or 0
    _log_search(db, search_q, total_count)
    results = _finalize_results(
        q, db, geo_search=geo_search, limit=limit, offset=offset
    )
    return results, total_count
