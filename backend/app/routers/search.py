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

import time

import structlog

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, DeliveryArea, Producer, Product
from app.rate_limit import limiter
from app.schemas.schemas import CategoryHit, ProducerHit, ProductHit, SearchOut
from app.utils.hebrew_search import token_patterns, tokenize
from app.utils.sql import LIKE_ESCAPE

logger = structlog.get_logger(__name__)

# In-memory cache for trending queries — single entry, 1-hour TTL.
_trending_cache: dict = {"data": None, "ts": 0.0}
_TRENDING_TTL = 3600.0

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


def _token_conditions(tokens: list[str], columns: list) -> list:
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
    db: Session = Depends(get_db),
):
    q_clean = (q or "").strip()
    if not q_clean:
        return _empty()
    # MEH-1664 — tokenise once; every sub-query below AND-s the same per-token
    # conditions over its own column set. q_clean stays the raw cleaned query
    # so the relevance boosts keep comparing against what the user typed.
    tokens = tokenize(q_clean)

    # -------- Producers (approved only, name + description) --------
    producer_rows = (
        db.query(Producer)
        .filter(Producer.status == "approved")
        .filter(*_token_conditions(tokens, [Producer.name, Producer.description]))
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
        .filter(Producer.status == "approved")
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
        .filter(Producer.status == "approved")
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
    categories = [
        CategoryHit(id=c.id, name=c.name, emoji=c.emoji) for c in category_rows
    ]

    return SearchOut(
        producers=producers,
        products=products,
        cities=cities,
        categories=categories,
    )


@router.get("/search/trending", response_model=list[str])
def trending_searches(db: Session = Depends(get_db)):
    """Return top 5 queries that returned results, cached 1 hour."""
    now = time.monotonic()
    if (
        _trending_cache["data"] is not None
        and now - _trending_cache["ts"] < _TRENDING_TTL
    ):
        return _trending_cache["data"]

    try:
        rows = db.execute(
            text(
                """
                SELECT query
                FROM search_queries
                WHERE results_count > 0
                GROUP BY query
                ORDER BY COUNT(*) DESC
                LIMIT 5
                """
            )
        ).fetchall()
        result = [row[0] for row in rows]
    except Exception:
        logger.warning(
            "[search] trending cache DB query failed — returning empty", exc_info=True
        )
        result = []

    _trending_cache["data"] = result
    _trending_cache["ts"] = now
    return result
