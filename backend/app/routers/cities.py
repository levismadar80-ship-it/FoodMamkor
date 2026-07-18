"""MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table.
MEH-1349: unions the static canonical list (app/data/cities.py) with DB rows so
the endpoint is never empty on a fresh DB (the cities table has no seeder).

Rate-limited 60/min (anonymous). Returns up to 20 cities matching the query
string (prefix match, case-insensitive), exact match first then alphabetical.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.data.cities import ISRAEL_CITIES
from app.database import get_db
from app.models.models import City
from app.rate_limit import limiter

router = APIRouter(tags=["cities"])

MAX_RESULTS = 20


@router.get("/cities")
@limiter.limit("60/minute")
def list_cities(
    request: Request,
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    """Autocomplete against the canonical static list ∪ the cities table.

    MEH-1349: the cities table is empty on a fresh DB (no seed path), which
    made delivery-city selection impossible. The static ISRAEL_CITIES list is
    the guaranteed baseline; DB rows extend it (dedup by exact name).
    Returns up to 20 names — exact match first, then Hebrew-alphabetical.
    """
    clean = (q or "").strip()

    base = db.query(City.name_he)
    if clean:
        base = base.filter(City.name_he.ilike(f"{clean}%"))
    db_cities = [row[0] for row in base.order_by(City.name_he).limit(MAX_RESULTS).all()]

    static_cities = (
        [c for c in ISRAEL_CITIES if c.startswith(clean)] if clean else list(ISRAEL_CITIES)
    )

    seen = set()
    merged = []
    for name in db_cities + static_cities:
        name = name.strip()
        if name and name not in seen:
            seen.add(name)
            merged.append(name)
    merged.sort()
    if clean in merged:
        merged.remove(clean)
        merged.insert(0, clean)
    return merged[:MAX_RESULTS]
