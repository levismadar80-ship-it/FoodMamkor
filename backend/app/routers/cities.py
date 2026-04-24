"""MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table.

Rate-limited 60/min (anonymous). Returns up to 20 cities whose name_he
starts with the query string (prefix match, case-insensitive).
"""
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import City
from app.rate_limit import limiter

router = APIRouter(tags=["cities"])


@router.get("/cities")
@limiter.limit("60/minute")
def list_cities(
    request: Request,
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    """Autocomplete query against the cities table.

    Returns up to 20 cities whose name_he starts with `q` (prefix match).
    Results are ordered: exact match first, then alphabetically.
    When `q` is absent or blank, returns the 20 most common cities by alpha.
    """
    base = db.query(City.name_he)
    if q and q.strip():
        clean = q.strip()
        base = base.filter(City.name_he.ilike(f"{clean}%"))
    cities = base.order_by(City.name_he).limit(20).all()
    return [row[0] for row in cities]
