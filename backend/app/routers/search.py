"""Smart-search endpoint for the hero autocomplete + /search results page (MEH-13).

Returns grouped matches across producers, producer-products, cities, and
categories — capped and rate-limited so the frontend can fire on every
keystroke without abuse.

No full-text index yet — plain ILIKE is fine at this scale (~hundreds of
producers). If this grows past ~10k rows we'd swap to pg_trgm GIN.

MEH-460 Pkg 3: Pydantic schemas live in app.schemas.schemas per ADR-006 R1.

MEH-1664: matching is per-token, not one literal substring — the shared
tokenisation + variant rules live in the helper imported below, and all four
sub-queries here share those semantics with /producers?q=.
"""

from typing import Any

import structlog

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.services.producer_listing import is_business  # MEH-2459
from app.models import Category, DeliveryArea, Producer, Product
from app.rate_limit import limiter
from app.schemas.schemas import CategoryHit, ProducerHit, ProductHit, SearchOut
from app.utils.hebrew_search import layout_alternative, token_patterns, tokenize
from app.utils.sql import LIKE_ESCAPE

logger = structlog.get_logger(__name__)

# MEH-3257 (Sapir 14/11): GET /search/trending and its in-memory cache
# were removed — one IP could steer «חיפושים פופולריים». search_queries rows
# are still written (producer_listing._log_search) for later analysis.
# DO NOT bring back a public "popular searches" list without a per-source cap.

router = APIRouter(tags=["search"])


def _empty() -> SearchOut:
    return SearchOut()


# MEH-252 / MEH-1664 — Hebrew matching now runs per token, and the prefix
# strip lives in the shared helper imported above, so both search paths agree.
#
# MEH-252 originally applied the strip to single-word queries only, on the
# reasoning that "stripping every word's first letter is too aggressive and
# over-matches". That is superseded: the over-match it feared came from OR-ing
# a widened query, whereas the design here ANDs across tokens — every token
# must independently hit some field of the row — so widening one token's
# variant set cannot pull in a row that fails another token. That is what lets
# the strip (and the ה/ת stem) apply to every word of a multi-word query.
#
# MEH-252's other claim was that ILIKE "already handles the singular→plural
# case". True in one direction only: "גבינה" is a substring of "גבינות", so
# singular→plural works — but plural→singular never did, and neither did
# smichut ("גבינת" vs "גבינה"). The ה/ת stem covers smichut in both
# directions; plural→singular stays uncovered by design (see the helper's
# module docstring).


def _token_conditions(tokens: list[str], columns: list[Any]) -> list[Any]:
    """One condition per token: OR over (variant x column). AND-ed by .filter().

    Every pattern is escape_like-escaped by token_patterns; escape=LIKE_ESCAPE
    here is the other half of that contract (MEH-1176).
    """
    return [
        or_(
            *[
                column.ilike(pattern, escape=LIKE_ESCAPE)
                for pattern in token_patterns(token)
                for column in columns
            ]
        )
        for token in tokens
    ]


@router.get("/search", response_model=SearchOut)
@limiter.limit("60/minute")
def smart_search(
    request: Request,
    q: str = Query("", max_length=200),
    limit: int = Query(8, ge=1, le=20),
    # MEH-3415: «לחפש בכל זאת» — the client asks for the query exactly as
    # typed, with no keyboard-layout re-read.
    as_typed: bool = Query(False),
    db: Session = Depends(get_db),
) -> SearchOut:
    q_clean = (q or "").strip()
    if not q_clean:
        return _empty()
    result = _search_once(db, q_clean, limit)
    if _is_empty(result) and not as_typed:
        # MEH-3415 — nothing for the query as typed: re-read it on the other
        # keyboard layout ("sca" -> "דבש") and try once more. Only on a miss,
        # so a real word with results is never rewritten; corrected_query tells
        # the client which word the results are for.
        alternative = layout_alternative(q_clean)
        if alternative:
            corrected = _search_once(db, alternative, limit)
            if not _is_empty(corrected):
                corrected.corrected_query = alternative
                return corrected
    return result


def _is_empty(result: SearchOut) -> bool:
    return not (
        result.producers or result.products or result.cities or result.categories
    )


def _search_once(db: Session, q_clean: str, limit: int) -> SearchOut:
    """The four grouped sub-queries for one cleaned query string."""
    # MEH-1664 — tokenise once; every sub-query below AND-s the same per-token
    # conditions over its own column set. q_clean stays the raw cleaned query
    # so the relevance boosts keep comparing against what the user typed.
    tokens = tokenize(q_clean)

    # -------- Producers (approved only, name + description + tagline) --------
    # MEH-2478: short_description (the card tagline) is searched too, same as
    # the /producers?q= path (producer_listing._token_search_filter).
    producer_rows = (
        db.query(Producer)
        .filter(is_business())  # MEH-2459
        .filter(
            *_token_conditions(
                tokens,
                [Producer.name, Producer.description, Producer.short_description],
            )
        )
        # Exact-name match first, then alphabetically. SQLite doesn't
        # support nullslast everywhere, so we use a simple CASE.
        .order_by((Producer.name != q_clean), Producer.name.asc())
        .limit(limit)
        .all()
    )
    producers = [
        ProducerHit(
            id=p.id,
            name=p.name,
            slug=p.slug,
            city=p.city,
            avg_rating=float(p.avg_rating or 0),
            reviews_count=int(p.reviews_count or 0),
            image=(p.images[0] if p.images else None),
        )
        for p in producer_rows
    ]

    # -------- Products (producer catalog) --------
    product_rows = (
        db.query(Product)
        .options(joinedload(Product.producer))
        .join(Producer, Producer.id == Product.producer_id)
        .filter(is_business())  # MEH-2459
        .filter(Product.is_draft.is_(False))  # MEH-2312: drafts are not public
        .filter(*_token_conditions(tokens, [Product.name, Product.description]))
        .order_by((Product.name != q_clean), Product.name.asc())
        .limit(limit)
        .all()
    )
    products = [
        ProductHit(
            id=prod.id,
            name=prod.name,
            description=prod.description,
            producer_id=prod.producer_id,
            producer_name=prod.producer.name if prod.producer else "",
            producer_slug=prod.producer.slug if prod.producer else None,
        )
        for prod in product_rows
    ]

    # -------- Cities (distinct over approved producers + delivery areas) --------
    city_rows = (
        db.query(Producer.city)
        .filter(is_business())  # MEH-2459
        .filter(*_token_conditions(tokens, [Producer.city]))
        .distinct()
        .limit(limit)
        .all()
    )
    delivery_city_rows = (
        db.query(DeliveryArea.city)
        .filter(*_token_conditions(tokens, [DeliveryArea.city]))
        .distinct()
        .limit(limit)
        .all()
    )
    cities_set = {row[0] for row in city_rows if row[0]} | {
        row[0] for row in delivery_city_rows if row[0]
    }
    cities = sorted(cities_set)[:limit]

    # -------- Categories --------
    category_rows = (
        db.query(Category)
        .filter(*_token_conditions(tokens, [Category.name]))
        .order_by(Category.name.asc())
        .limit(limit)
        .all()
    )
    # MEH-2139: `slug` is passed EXPLICITLY. `CategoryOut` gets it for free —
    # it is a `response_model` populated from the ORM object — but this hit is
    # hand-built with keyword arguments, so a field omitted here serializes as
    # `null` forever and nothing fails. That is the exact divergence the
    # docstring on `CategoryHit` warns about, and this line is where it happened
    # (found by the CI reviewer on PR #3052; `test_search_category_hit_carries_slug`
    # is the guard that makes it fail loudly next time).
    categories = [
        CategoryHit(id=c.id, name=c.name, slug=c.slug, emoji=c.emoji)
        for c in category_rows
    ]

    return SearchOut(
        producers=producers,
        products=products,
        cities=cities,
        categories=categories,
    )
