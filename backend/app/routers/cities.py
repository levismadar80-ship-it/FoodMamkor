"""MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table.
MEH-1343 Chunk A: ONE canonical source — the cities TABLE, seeded with the
~1,270 official data.gov.il localities (scripts/seed_cities.py, or
POST /admin/seed-cities from the admin panel; idempotent). The table is
unioned with live producer/delivery cities; the static ISRAEL_CITIES list
(app/data/cities.py, MEH-1349) remains ONLY as the unseeded-env fallback.

Rate-limited 60/min (anonymous). Returns up to 20 cities matching the query
string (prefix match, case-insensitive), exact match first then alphabetical.
MEH-2456: one entry per city — spelling variants collapse on city_key and the
answer uses the static list's spelling when one shares the key.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.data.cities import ISRAEL_CITIES, STATIC_SPELLING_BY_KEY, city_key
from app.database import get_db
from app.services.producer_listing import is_business  # MEH-2459
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
        is_business(),  # MEH-2459
        Producer.city.isnot(None),
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

    # MEH-2456: one entry per city, not per spelling. The seeded table spells
    # Tel Aviv «תל אביב - יפו» while the static list, the site's chips and
    # existing businesses spell it «תל אביב-יפו»; an exact-string set returned
    # both, and a business that picked the table spelling under "אזורי משלוח"
    # was then missed by the exact-match delivery filter. Dedupe on city_key
    # and answer in the static spelling whenever one shares the key.
    seen: set[str] = set()
    merged = []
    for raw in table_cities + live_cities + static_cities:
        name = raw.strip()
        key = city_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(STATIC_SPELLING_BY_KEY.get(key, name))
    merged.sort()
    if clean in merged:
        merged.remove(clean)
        merged.insert(0, clean)
    return merged[:MAX_RESULTS]
