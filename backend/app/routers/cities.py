"""MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table.
MEH-1343 Chunk A: ONE canonical source — the cities TABLE, seeded with the
~1,270 official data.gov.il localities (scripts/seed_cities.py, or
POST /admin/seed-cities from the admin panel; idempotent). The table is
unioned with live producer/delivery cities; the static ISRAEL_CITIES list
(app/data/cities.py, MEH-1349) remains ONLY as the unseeded-env fallback.

Rate-limited 60/min (anonymous). Returns up to 20 cities matching the query
string (prefix match, case-insensitive), exact match first then alphabetical.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.data.cities import ISRAEL_CITIES
from app.database import get_db
from app.models import DeliveryArea, Producer
from app.models.models import City
from app.rate_limit import limiter

router = APIRouter(tags=["cities"])

MAX_RESULTS = 20


def _live_business_cities(db: Session, clean: str) -> list[str]:
    """Cities actually in use by approved producers + delivery areas.

    MEH-1343: these may legitimately hold names outside the official dataset
    (pre-normalization free text) — surfacing them keeps existing filters and
    delivery selections round-trippable until the Chunk B normalization lands.
    """
    prod = db.query(Producer.city).filter(
        Producer.status == "approved", Producer.city.isnot(None)
    )
    deliv = db.query(DeliveryArea.city).filter(DeliveryArea.city.isnot(None))
    if clean:
        prod = prod.filter(Producer.city.ilike(f"{clean}%"))
        deliv = deliv.filter(DeliveryArea.city.ilike(f"{clean}%"))
    rows = (
        prod.distinct().limit(MAX_RESULTS).all()
        + deliv.distinct().limit(MAX_RESULTS).all()
    )
    return [row[0] for row in rows]


@router.get("/cities")
@limiter.limit("60/minute")
def list_cities(
    request: Request,
    q: str | None = Query(None, max_length=100),
    db: Session = Depends(get_db),
):
    """Autocomplete: cities table (canonical) ∪ live business cities,
    with the static list as the unseeded-env fallback (MEH-1349).

    "Seeded" == any row exists: the only writers of the cities table are the
    full-dataset seeders (scripts/seed_cities.py / POST /admin/seed-cities),
    so a non-empty table means the official dataset is present.
    """
    clean = (q or "").strip()

    base = db.query(City.name_he)
    if clean:
        base = base.filter(City.name_he.ilike(f"{clean}%"))
    table_cities = [
        row[0] for row in base.order_by(City.name_he).limit(MAX_RESULTS).all()
    ]

    live_cities = _live_business_cities(db, clean)

    seeded = db.query(City.id).limit(1).first() is not None
    if seeded:
        static_cities: list[str] = []
    elif clean:
        static_cities = [c for c in ISRAEL_CITIES if c.startswith(clean)]
    else:
        static_cities = list(ISRAEL_CITIES)

    seen = set()
    merged = []
    for name in table_cities + live_cities + static_cities:
        name = name.strip()
        if name and name not in seen:
            seen.add(name)
            merged.append(name)
    merged.sort()
    if clean in merged:
        merged.remove(clean)
        merged.insert(0, clean)
    return merged[:MAX_RESULTS]
