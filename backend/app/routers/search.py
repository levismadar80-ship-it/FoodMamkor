"""Smart-search endpoint for the hero autocomplete + /search results page (MEH-13).

Returns grouped matches across producers, producer-products, cities, and
categories — capped and rate-limited so the frontend can fire on every
keystroke without abuse.

No full-text index yet — plain ILIKE is fine at this scale (~hundreds of
producers). If this grows past ~10k rows we'd swap to pg_trgm GIN.
"""
import time
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import or_, text
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models import Category, DeliveryArea, Producer, Product
from app.rate_limit import limiter

# In-memory cache for trending queries — single entry, 1-hour TTL.
_trending_cache: dict = {"data": None, "ts": 0.0}
_TRENDING_TTL = 3600.0

router = APIRouter(tags=["search"])


class ProducerHit(BaseModel):
    id: UUID
    name: str
    slug: str | None = None
    city: str | None = None
    avg_rating: float = 0
    reviews_count: int = 0
    image: str | None = None


class ProductHit(BaseModel):
    id: UUID
    name: str
    description: str | None = None
    producer_id: UUID
    producer_name: str
    producer_slug: str | None = None


class CategoryHit(BaseModel):
    id: int
    name: str
    emoji: str | None = None


class SearchOut(BaseModel):
    producers: list[ProducerHit] = []
    products: list[ProductHit] = []
    cities: list[str] = []
    categories: list[CategoryHit] = []


def _empty() -> SearchOut:
    return SearchOut()


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
    like = f"%{q_clean}%"

    # -------- Producers (approved only, name + description) --------
    producer_rows = (
        db.query(Producer)
        .filter(Producer.status == "approved")
        .filter(
            or_(
                Producer.name.ilike(like),
                Producer.description.ilike(like),
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
        .filter(Producer.status == "approved")
        .filter(
            or_(
                Product.name.ilike(like),
                Product.description.ilike(like),
            )
        )
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
        .filter(Producer.city.ilike(like))
        .distinct()
        .limit(limit)
        .all()
    )
    delivery_city_rows = (
        db.query(DeliveryArea.city)
        .filter(DeliveryArea.city.ilike(like))
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
        .filter(Category.name.ilike(like))
        .order_by(Category.name.asc())
        .limit(limit)
        .all()
    )
    categories = [
        CategoryHit(id=c.id, name=c.name, emoji=c.emoji)
        for c in category_rows
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
        result = []

    _trending_cache["data"] = result
    _trending_cache["ts"] = now
    return result
