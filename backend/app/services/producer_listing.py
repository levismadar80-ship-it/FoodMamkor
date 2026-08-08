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

from datetime import datetime
from typing import Any

import structlog
from sqlalchemy import and_, cast, func, or_
from sqlalchemy.dialects.postgresql import JSONPATH
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models import (
    Category,
    DeliveryArea,
    Producer,
    ProducerCategory,
    ProducerLocation,
    Product,
    SearchQuery,
)
from app.services.producer_queries import (
    attach_badge_fields,
    attach_favorites_counts,
    haversine_min_km,
)
from app.utils.clock import israel_now
from app.utils.hebrew_search import token_patterns, tokenize
from app.utils.sql import LIKE_ESCAPE, escape_like

logger = structlog.get_logger(__name__)

# (key in filters dict, attribute on Producer model) — covers the simple
# `if v is not None: q = q.filter(Producer.<attr> == v)` pattern. The
# remaining filter pairs (kosher, category, delivery_city, has_delivery,
# city, dietary) need bespoke logic and stay inline below.
_SIMPLE_FILTERS: list[tuple[str, str]] = [
    # MEH-766: `verified` moved to a bespoke verified_at block below (was
    # ("verified", "is_verified")) — the ?verified filter now matches
    # document-verified producers, not the legacy admin-manual boolean.
    # MEH-1259 (P0 legal — חוק תוצרת אורגנית 2005): the public ?organic filter
    # is REMOVED. It matched the self-declared organic_certified boolean, letting
    # consumers surface unverified "organic" producers — same risk family as the
    # MEH-986 free-text kosher filter. Re-add only behind an admin-verified flow
    # (post-launch, Option B). The column stays (owner/admin managed).
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
    # MEH-1934: single-column axes, so they belong in this table rather than
    # beside the vegetarian special case below (which is a two-column OR).
    ("no_added_sugar", "is_no_added_sugar"),
    ("low_carb", "is_low_carb"),
]


def _build_base_queries(
    db: Session,
    *,
    geo: tuple[float, float, float] | None,
    sort: str | None,
    require_physical: bool = False,
):
    """Initial q + count_q.

    `geo=(lat, lng, radius_km)` activates the geo search path (Haversine
    distance, ORDER BY distance ASC); `geo=None` is the standard listing
    path (sort by created_at DESC or rating per the `sort` arg).

    `require_physical` (geo mode only): when True, keep MEH-213's
    `has_physical_location IS TRUE` filter — the /map pin semantics, where a
    delivery-only producer has no address to pin. When False (the default,
    MEH-1282), geo mode returns ALL approved producers with non-null coords
    in range, INCLUDING delivery-only ones — the "קרוב אליי" home flow wants
    every nearby business, not just map-pinnable ones. The flag has no effect
    in non-geo mode (the standard listing never filtered on physical location).

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
    count stays consistent with the page slice. The `require_physical`
    filter below is applied to BOTH for exactly this reason — a page query
    that filters where the count doesn't (or vice-versa) reopens that 500.
    """
    if geo is not None:
        lat, lng, radius_km = geo
        # MEH-1402: distance = the NEAREST of the producer's producer_locations
        # rows (COALESCE fallback to Producer.lat/lng during the Expand
        # overlap). It's a correlated scalar subquery — NOT a JOIN — so a
        # 10-location producer stays ONE row and the DISTINCT count below is
        # one-per-business (the _build_base_queries double-count trap).
        distance_expr = haversine_min_km(lat, lng).label("distance_km")
        q = (
            db.query(Producer, distance_expr)
            .options(
                joinedload(Producer.categories),
                # MEH-18 — batch-load the two collections the badge system counts.
                selectinload(Producer.products),
                selectinload(Producer.delivery_areas),
                # MEH-1402 — serialize locations[] on ProducerListOut w/o N+1.
                selectinload(Producer.locations),
                # MEH-1823: active_offer reads this collection — eager-load it here
                # or the property fires one query per producer on every list page.
                selectinload(Producer.offers),
            )
            .filter(Producer.status == "approved")
        )
        count_q = (
            db.query(func.count(Producer.id.distinct()))
            .select_from(Producer)
            .filter(Producer.status == "approved")
        )
        if require_physical:
            # MEH-213 map-pin semantics: pinnable producers only. MEH-1282
            # made this opt-in (default OFF) so the home "קרוב אליי" flow can
            # surface delivery-only producers too. MEH-1402 scoped reversal: a
            # delivery-only producer (has_physical_location=false) that owns a
            # pickup/market_stand location row IS now pinnable (at that point),
            # while a producer with no such row stays hidden — no blanket
            # unhide. Applied to BOTH q and count_q (the 500-bug warning above).
            pinnable = or_(
                Producer.has_physical_location.is_(True),
                Producer.locations.any(
                    ProducerLocation.kind.in_(("pickup", "market_stand"))
                ),
            )
            q = q.filter(pinnable)
            count_q = count_q.filter(pinnable)
        # MEH-1402: the coalesced distance is NULL exactly when a producer has
        # neither a usable location row NOR a Producer.lat/lng point, and
        # `NULL <= radius` is false — so those drop out without an explicit
        # coord-IS-NOT-NULL guard (which would wrongly exclude a producer that
        # has a valid pickup location but no own Producer point).
        q = q.filter(distance_expr <= radius_km).order_by(distance_expr.asc())
        count_q = count_q.filter(haversine_min_km(lat, lng) <= radius_km)
        return q, count_q

    if sort == "rating":
        # MEH-1483: avg_rating DESC, NULLs last, tiebreak reviews_count DESC,
        # then created_at DESC. `avg_rating.is_(None)` is a boolean order key
        # (FALSE < TRUE → non-null first, null last) — the portable nulls-last
        # idiom this codebase already uses instead of .nullslast() (see
        # search.py:85-87, which orders on `(Producer.name != q_clean)`).
        order = (
            Producer.avg_rating.is_(None),
            Producer.avg_rating.desc(),
            Producer.reviews_count.desc(),
            Producer.created_at.desc(),
        )
    else:
        order = (Producer.created_at.desc(),)
    q = (
        db.query(Producer)
        .options(
            joinedload(Producer.categories),
            selectinload(Producer.products),
            selectinload(Producer.delivery_areas),
            # MEH-1402 — locations[] on ProducerListOut (LIST/DETAIL shape parity).
            selectinload(Producer.locations),
            # MEH-1823: active_offer reads this collection — eager-load it here
            # or the property fires one query per producer on every list page.
            selectinload(Producer.offers),
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


# MEH-1487: region-fallback OR-list cap — the largest region in
# frontend/data/regions.js is ~18 cities; 40 is generous headroom while
# still bounding a hostile caller's ?delivery_cities= list.
_MAX_DELIVERY_CITIES = 40


def _delivery_city_condition(city: str):
    """A producer 'delivers to <city>' iff it has a delivery_areas row for
    that city OR delivers nationwide and hasn't excluded it (MEH-1255).

    Shared by the single `delivery_city` filter and the `delivery_cities`
    region-fallback OR-list (MEH-1487) so the two matching paths never drift.

    MEH-1848: scope alone is not a delivery promise. `offers_delivery` is the
    owner's own declaration, and nothing in the schema ties it to the scope
    columns — the only CHECK is `has_physical_location OR offers_delivery`
    (models.py:388), which says nothing about delivery_nationwide or about
    delivery_areas rows. So a business that switched delivery off while stale
    scope rows (or the nationwide flag) remained behind matched this filter and
    was offered to a consumer as a delivering business. The flag is now a
    conjunct on BOTH delivery predicates.
    """
    area_match = Producer.delivery_areas.any(
        func.lower(DeliveryArea.city) == city.lower()
    )
    nationwide_match = and_(
        Producer.delivery_nationwide.is_(True),
        ~Producer.delivery_excluded_cities.any(city),
    )
    # `.is_(True)` and not a bare truthiness check: the column is NOT NULL today
    # (models.py:234) so the two agree, but `.is_(True)` keeps a future NULL
    # from silently matching rather than relying on that staying true.
    return and_(
        Producer.offers_delivery.is_(True),
        or_(area_match, nationwide_match),
    )


def _has_delivery_condition():
    """MEH-1836 — "delivers at all": an explicit delivery_areas row OR the
    nationwide flag.

    The XOR data model (models.py:392 `delivery_nationwide_xor_cities`) means a
    nationwide producer typically holds ZERO delivery_areas rows, so the
    original bare `Producer.delivery_areas.any()` made exactly the businesses
    that deliver *furthest* invisible to the משלוח chip.

    delivery_excluded_cities is deliberately NOT consulted here. This filter
    asks "does this business deliver?", not "does it deliver to city X" — a
    nationwide producer with a non-empty exclusion list still delivers, so it
    still matches. That single conjunct is the whole difference from
    _delivery_city_condition (:204), which IS city-scoped and must honour the
    exclusions. Do not "align" the two.

    Both operands are EXISTS/flag predicates rather than a JOIN, so a producer
    holding a nationwide flag AND area rows still yields exactly one row (the
    CHECK constraint only bars nationwide + the legacy delivery_cities array,
    not delivery_areas rows). # REUSES: _delivery_city_condition:214 —
    nationwide predicate shape.

    MEH-1848: `offers_delivery` is conjoined here too. Note what did NOT change
    — the exclusion asymmetry above still holds. Both predicates now agree on
    "the owner says they deliver"; they still disagree, deliberately, on
    whether delivery_excluded_cities applies.
    """
    return and_(
        Producer.offers_delivery.is_(True),
        or_(
            Producer.delivery_areas.any(),
            Producer.delivery_nationwide.is_(True),
        ),
    )


def _delivery_day_condition(day: str, city: str | None = None):
    """MEH-1645 v1 semantics: only EXPLICIT day rows match — nationwide
    producers and day-less rows ("בתיאום מראש") are excluded from day
    filtering; the integrity of "משלוח ביום X" beats recall.

    With a city, the city AND the day must match on the SAME delivery_areas
    row (one EXISTS). Two separate EXISTS would wrongly match a producer
    whose חיפה row is day-less while its עכו row is on שישי — the day
    promise would be attributed to the wrong city.
    """
    conds = [DeliveryArea.delivery_day == day]
    if city:
        conds.append(func.lower(DeliveryArea.city) == city.lower())
    return Producer.delivery_areas.any(and_(*conds))


def _kosher_condition(kosher: bool):
    """MEH-986 ch3b (P0 legal — חוק איסור הונאה בכשרות): the ?kosher filter is
    verified-only — it matches admin-verified kashrut (kashrut_verified_at,
    stamped by admin_kashrut.py:75), NEVER the free-text Producer.kosher.

    MEH-1260: expiry enforcement — an expired certificate no longer passes
    ?kosher=true (and lands in ?kosher=false, the exact complement). Legacy
    pre-expiry-era rows (NULL expires_at, non-null verified_at) stay valid.
    Naive utcnow matches how admin_kashrut.py:73 writes the timestamps.
    """
    if kosher:
        return and_(
            Producer.kashrut_verified_at.isnot(None),
            or_(
                Producer.kashrut_expires_at.is_(None),
                Producer.kashrut_expires_at > datetime.utcnow(),
            ),
        )
    return or_(
        Producer.kashrut_verified_at.is_(None),
        and_(
            Producer.kashrut_expires_at.isnot(None),
            Producer.kashrut_expires_at <= datetime.utcnow(),
        ),
    )


# MEH-1881: the Israel weekday names `order_window` is keyed by. Index-aligned
# with schemas._ORDER_WINDOW_DAYS and with lib/orderWindow.js ORDER_DAY_KEYS, so
# index 0 means Sunday on every axis in the codebase.
_ORDER_DAY_KEYS = (
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
)

# MEH-1881: "is this business inside a declared ordering range right now?".
#
# `[*]` is what makes this work against BOTH stored shapes. `order_window[day]`
# is a LIST of ranges since MEH-1869, but rows written before that cutover still
# hold a single dict, and `_order_window_validator` only normalises on WRITE —
# so a row never re-saved is still the old shape. In jsonpath's default LAX mode
# `[*]` auto-wraps a non-array, so one expression covers both. That is measured,
# not assumed: against `{"sunday":{"open":"09:00","close":"13:00"}}` this returns
# true at 10:00 and false at 13:00, identically to the list form.
#
# Boundaries are `open <= now < close`: a business is open AT its opening minute
# and closed AT its closing minute. Zero-padded "HH:MM" compares correctly as
# plain text, which is why the value is passed as a string and not parsed.
#
# The time and day are passed as jsonpath VARIABLES, never interpolated into the
# expression — the expression itself is a constant.
_OPEN_NOW_JSONPATH = "$.%s[*] ? (@.open <= $now && @.close > $now)"


def _open_for_orders_now_condition(open_now: bool):
    """MEH-1881: match on the DECLARED ordering window, not on opening_hours.

    The two are different facts (`opening_hours` is when the shop is staffed;
    `order_window` is when the owner said she takes orders) and this product's
    conversion event is a WhatsApp message, not a visit.

    A producer with `order_window IS NULL` has declared nothing, so it can be
    neither open nor closed by this filter. `jsonb_path_exists(NULL, ...)` is
    NULL rather than false, so both branches use `IS TRUE` / `IS NOT TRUE`
    instead of `== True` / `!= True` — with a bare boolean comparison the NULL
    rows would silently vanish from BOTH sides of the filter.
    """
    # `israel_now` is the codebase's canonical Asia/Jerusalem primitive, and
    # going through it rather than building a datetime here is what makes the
    # filter testable: a test freezes it with
    # `monkeypatch.setattr(producer_listing, "israel_now", ...)`, the same
    # idiom test_availability_validation.py uses for `israel_today`.
    now = israel_now()
    # weekday() is Monday=0; order_window is keyed Sunday-first.
    day_key = _ORDER_DAY_KEYS[(now.weekday() + 1) % 7]
    matches = func.jsonb_path_exists(
        Producer.order_window,
        cast(_OPEN_NOW_JSONPATH % day_key, JSONPATH),
        func.jsonb_build_object("now", now.strftime("%H:%M")),
    )
    return matches.is_(True) if open_now else matches.isnot(True)


def _apply_scalar_filters(q, count_q, **filters: Any):  # noqa: C901, PLR0912, PLR0915  # 15 boolean filter pairs by design (MEH-1438 added the vegetarian OR-branch) — _SIMPLE_FILTERS / _DIETARY_FILTERS dispatch tables + structurally distinct query branches (vegetarian / kosher / verified [MEH-766] / category / delivery / city). Refactor would fragment coherent listing logic.
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

    # MEH-1438 — vegetarian axis. A vegan product is vegetarian by definition,
    # so ?vegetarian=true matches a producer with at least one product that is
    # is_vegetarian OR is_vegan (the owner needn't mark both); ?vegetarian=false
    # is the complement (no such product). Kept out of _DIETARY_FILTERS because
    # that table maps a single column — this is a two-column OR condition.
    vegetarian = filters.get("vegetarian")
    if vegetarian is not None:
        veg_cond = Producer.products.any(
            or_(Product.is_vegetarian.is_(True), Product.is_vegan.is_(True))
        )
        q = q.filter(veg_cond if vegetarian else ~veg_cond)
        count_q = count_q.filter(veg_cond if vegetarian else ~veg_cond)

    # MEH-291 Phase 3 — default-hide on_vacation. When the caller does NOT
    # explicitly filter by availability_state, exclude vacation producers from
    # the default listing (still reachable via direct slug / favorites / an
    # explicit ?availability_state=on_vacation). User-visible behavior shift
    # bundled with the Phase 3 frontend per Q2a.
    if filters.get("availability_state") is None:
        q = q.filter(Producer.availability_state != "on_vacation")
        count_q = count_q.filter(Producer.availability_state != "on_vacation")

    # MEH-986 ch3b + MEH-1260: verified-only kosher filter with expiry
    # enforcement — extracted to _kosher_condition (PLR0915 headroom).
    kosher = filters.get("kosher")
    if kosher is not None:
        kosher_cond = _kosher_condition(kosher)
        q = q.filter(kosher_cond)
        count_q = count_q.filter(kosher_cond)

    # MEH-1881: opt-in "open for orders now". Absent → not referenced at all, so
    # the default listing is byte-identical. # REUSES: the kosher block above —
    # presence/absence pattern, filter BOTH q and count_q (a filter applied to
    # only one makes the page and its x-total-count disagree).
    open_for_orders_now = filters.get("open_for_orders_now")
    if open_for_orders_now is not None:
        open_now_cond = _open_for_orders_now_condition(open_for_orders_now)
        q = q.filter(open_now_cond)
        count_q = count_q.filter(open_now_cond)

    # MEH-766: ?verified filters on verified_at (document-verified, MEH-762),
    # NOT the legacy is_verified boolean. # REUSES: kosher block above —
    # presence/absence pattern, filter BOTH q and count_q.
    verified = filters.get("verified")
    if verified is not None:
        if verified:
            q = q.filter(Producer.verified_at.isnot(None))
            count_q = count_q.filter(Producer.verified_at.isnot(None))
        else:
            q = q.filter(Producer.verified_at.is_(None))
            count_q = count_q.filter(Producer.verified_at.is_(None))

    # MEH-1465: category filter is now OR over a list of ids. An EXISTS
    # (Producer.categories.any) replaces the prior JOIN — a producer linked to
    # two of the selected categories would otherwise appear TWICE in the full
    # SELECT (the JOIN fans out one row per matching producer_categories row;
    # count_q was already DISTINCT, so page and count would disagree). EXISTS
    # matches at most once regardless of how many ids overlap. `category` may be
    # a bare int from a legacy single-value call — normalize to a list.
    # REUSES: the dietary EXISTS pattern above (Producer.products.any).
    category = filters.get("category")
    if category:
        category_ids = category if isinstance(category, list) else [category]
        cat_cond = Producer.categories.any(Category.id.in_(category_ids))
        q = q.filter(cat_cond)
        count_q = count_q.filter(cat_cond)

    delivery_city = filters.get("delivery_city")
    delivery_cities = filters.get("delivery_cities")
    has_delivery = filters.get("has_delivery")
    # MEH-1645: single canonical day (router 422s anything else). When a city
    # is present the combined condition REPLACES _delivery_city_condition —
    # v1 deliberately drops the nationwide OR-branch (no explicit day row =
    # no day promise), so the shared MEH-1487 helper is untouched.
    delivery_day = filters.get("delivery_day")
    if delivery_city:
        if delivery_day:
            city_cond = _delivery_day_condition(delivery_day, delivery_city)
        else:
            # MEH-1255: nationwide producers now match any delivery_city EXCEPT
            # their exclusion list ("לכל הארץ חוץ מ:"). EXISTS (.any()) is used
            # so the OR branch isn't swallowed by join semantics; for area-based
            # producers the result set is identical. Extracted to
            # _delivery_city_condition so MEH-1487's OR-list reuses it verbatim.
            city_cond = _delivery_city_condition(delivery_city)
        q = q.filter(city_cond)
        count_q = count_q.filter(city_cond)
    elif delivery_day:
        # Day without a city — every explicit row with that day, any city.
        day_cond = _delivery_day_condition(delivery_day)
        q = q.filter(day_cond)
        count_q = count_q.filter(day_cond)
    elif delivery_cities:
        # MEH-1487: region fallback — OR the SAME per-city condition across
        # the region's cities (nationwide-minus-excluded honoured per city).
        # Cap + empty-strip guard bound a hostile / malformed list.
        cities = [c for c in delivery_cities if c and c.strip()][:_MAX_DELIVERY_CITIES]
        if cities:
            city_cond = or_(*[_delivery_city_condition(c) for c in cities])
            q = q.filter(city_cond)
            count_q = count_q.filter(city_cond)
    elif has_delivery:
        # MEH-1836: was a bare delivery_areas.any(), which nationwide producers
        # can never satisfy — see _has_delivery_condition for why the exclusion
        # list is not consulted on this axis.
        delivery_cond = _has_delivery_condition()
        q = q.filter(delivery_cond)
        count_q = count_q.filter(delivery_cond)

    city = filters.get("city")
    if city:
        q = q.filter(func.lower(Producer.city) == city.lower())
        count_q = count_q.filter(func.lower(Producer.city) == city.lower())

    return q, count_q


def _token_search_filter(db: Session, token: str):
    """MEH-1664 — the match condition for ONE search token.

    OR across the six searchable sources; within each source, OR across the
    token's variants. The caller AND-s one of these per token.

    Every pattern comes from token_patterns (escape_like-escaped); the
    escape=LIKE_ESCAPE below is the other half of that contract (MEH-1176).
    """
    patterns = token_patterns(token)

    def _any(*columns):
        return or_(
            *[
                column.ilike(pattern, escape=LIKE_ESCAPE)
                for pattern in patterns
                for column in columns
            ]
        )

    has_category = (
        db.query(ProducerCategory)
        .join(Category, Category.id == ProducerCategory.category_id)
        .filter(
            ProducerCategory.producer_id == Producer.id,
            _any(Category.name),
        )
        .exists()
    )
    # MEH-1664: description joins name here. /search has always matched a
    # product on either column (search.py products sub-query); this path only
    # matched the name, so a producer whose catalog mentioned the term only in
    # a product description was reachable from /search but not /producers?q=.
    has_product = (
        db.query(Product)
        .filter(
            Product.producer_id == Producer.id,
            _any(Product.name, Product.description),
        )
        .exists()
    )
    # MEH-1488: EXISTS on delivery_areas.city — same pattern as has_category /
    # has_product. Matches a producer that delivers to the searched city even
    # when its own Producer.city differs (the exact-match delivery_city filter
    # in _apply_scalar_filters is a separate, stricter path).
    has_delivery_city = (
        db.query(DeliveryArea)
        .filter(
            DeliveryArea.producer_id == Producer.id,
            _any(DeliveryArea.city),
        )
        .exists()
    )
    return (
        _any(Producer.name, Producer.description, Producer.city)
        | has_category
        | has_product
        | has_delivery_city
    )


def _apply_search_filter(
    db: Session, q, count_q, search_q: str | None, *, geo_search: bool
):
    """MEH-99 cross-field search: name · description · city · category names · product names + descriptions · delivery cities.

    Adds relevance ordering in non-geo mode (exact-match first, then
    prefix, then rating, then created_at) — geo mode keeps distance ASC.

    MEH-1488: the search also matches a business's delivery_areas.city, so
    `q=<city>` surfaces a producer that DELIVERS to that city even when its
    own Producer.city differs (the city the owner typed under "אזורי משלוח").

    MEH-1664: matching is per token, not one literal substring. Each token
    contributes its own OR-over-all-six-sources condition and the tokens are
    AND-ed, so "גבינה עיזים" matches a product named "גבינת עיזים" in either
    word order while "גבינה חיפה" does NOT match a Tel-Aviv cheese business.
    The has_product EXISTS also covers Product.description now, so this path
    and /search agree on what a product match is.
    """
    if not (search_q and search_q.strip()):
        return q, count_q

    clean = search_q.strip()

    for token in tokenize(clean):
        token_filter = _token_search_filter(db, token)
        # Both queries, always — a filter on q that misses count_q reopens the
        # Postgres 500 / count-mismatch trap in _build_base_queries' docstring.
        q = q.filter(token_filter)
        count_q = count_q.filter(token_filter)

    if not geo_search:
        q = q.order_by(False).order_by(
            (func.lower(Producer.name) == clean.lower()).desc(),
            Producer.name.ilike(f"{escape_like(clean)}%", escape=LIKE_ESCAPE).desc(),
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

    Expected keys in **filters: lat, lng, radius_km, require_physical,
    category, delivery_city, delivery_cities, delivery_day (MEH-1645 — one
    canonical Hebrew day; explicit-row matching only), has_delivery, verified, kosher, city,
    is_available_today, grass_fed, gluten_free, vegan, vegetarian, lactose_free,
    no_added_sugar, low_carb (MEH-1934), sort, search_q, limit, offset, exclude.
    (MEH-1259: `organic` removed — the public ?organic filter is gone.)
    (MEH-1282: `require_physical` — geo-only opt-in for the has_physical_location
    filter; default False so delivery-only producers appear in geo results.)
    """
    lat = filters.get("lat")
    lng = filters.get("lng")
    radius_km = filters.get("radius_km")
    require_physical = filters.get("require_physical", False)
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

    q, count_q = _build_base_queries(
        db, geo=geo, sort=sort, require_physical=require_physical
    )
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
