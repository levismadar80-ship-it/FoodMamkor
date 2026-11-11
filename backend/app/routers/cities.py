"""MEH-213: GET /cities — autocomplete endpoint backed by the canonical cities table.
MEH-1343 Chunk A: ONE canonical source — the cities TABLE, seeded with the
~1,270 official data.gov.il localities (scripts/seed_cities.py, or
POST /admin/seed-cities from the admin panel; idempotent). The table is
unioned with live producer/delivery cities; the static ISRAEL_CITIES list
(app/data/cities.py, MEH-1349) remains ONLY as the unseeded-env fallback.

Rate-limited 60/min (anonymous). Returns up to 20 cities matching the query
string (prefix match, case-insensitive), exact match first then alphabetical.
MEH-2456: one entry per city — spelling variants collapse on city_key and the
answer uses the static list's spelling when one shares the key. MEH-2602: the
answer is canonical_city's spelling, which also folds everyday aliases.
MEH-2919: the QUERY is folded too — typing an everyday alias, or a prefix of
one, reaches the official locality («גבעת עדה» → «בנימינה-גבעת עדה»). Until
then the alias table only ever ran on the results, so a name that is not a
prefix of its official form was unreachable.
"""

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.data.cities import (
    ISRAEL_CITIES,
    alias_like_patterns,
    alias_targets,
    canonical_city,
    city_key,
)
from app.database import get_db
from app.services.producer_listing import is_business  # MEH-2459
from app.models import DeliveryArea, Producer
from app.models.models import City
from app.rate_limit import limiter

router = APIRouter(tags=["cities"])

MAX_RESULTS = 20


def _direct_forms(clean: str) -> list[str]:
    """What the person literally typed, in both yod spellings.

    MEH-2602: «קריית» and «קרית» are one spelling apart — the official list
    uses one yod, owners and the static list two — so a typed prefix in either
    form must reach names in both.

    Kept separate from the alias patterns below because the two are not equal
    in standing: a direct form is what she is typing, an alias target is our
    guess about what she meant. `list_cities` ranks on exactly that difference.
    """
    forms = {clean, clean.replace("קריית", "קרית"), clean.replace("קרית", "קריית")}
    return sorted(f for f in forms if f)


def _prefixes(clean: str) -> list[str]:
    """Every LIKE prefix the typed text should match against.

    MEH-2919 (C5): the direct forms, plus the official name of any everyday
    alias the text is a prefix of. An alias is by definition NOT a prefix of the
    name it stands for («גבעת עדה» → «בנימינה-גבעת עדה»), so without this the
    alias table is unreachable from a prefix search — it only ever ran on the
    results. Adding the TARGET (never the alias) keeps one entry per city: the
    merge below dedupes on `city_key`, so the alias string itself can only ever
    appear if a row holds it.
    """
    forms = set(_direct_forms(clean))
    forms.update(alias_like_patterns(clean))
    return sorted(f for f in forms if f)


def _ilike_any(column, clean: str):
    return or_(*[column.ilike(f"{p}%") for p in _prefixes(clean)])


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
        prod = prod.filter(_ilike_any(Producer.city, clean))
        deliv = deliv.filter(_ilike_any(DeliveryArea.city, clean))
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
        base = base.filter(_ilike_any(City.name_he, clean))
    table_cities = [
        row[0] for row in base.order_by(City.name_he).limit(MAX_RESULTS).all()
    ]

    live_cities = _live_business_cities(db, clean)

    seeded = db.query(City.id).limit(1).first() is not None
    if seeded:
        static_cities: list[str] = []
    elif clean:
        # MEH-2919 (C5): aliases are honoured here too, but this path compares
        # LITERALLY (`startswith`, not ILIKE), so it takes `alias_targets` and
        # not the `%` patterns the table query uses. It is NOT full parity and
        # should not be read as such: three of the seven alias targets
        # («בנימינה-גבעת עדה», «פרדס חנה-כרכור», «נוף הגליל») are absent from
        # ISRAEL_CITIES, so they stay unreachable while the table is unseeded,
        # and a `%` in the query is a pattern there and a literal here. This
        # branch only runs before the official dataset is seeded.
        static_prefixes = _direct_forms(clean) + alias_targets(clean)
        static_cities = [
            c for c in ISRAEL_CITIES if any(c.startswith(p) for p in static_prefixes)
        ]
    else:
        static_cities = list(ISRAEL_CITIES)

    # MEH-2456: one entry per city, not per spelling. The seeded table spells
    # Tel Aviv «תל אביב - יפו» while the static list, the site's chips and
    # existing businesses spell it «תל אביב-יפו»; an exact-string set returned
    # both, and a business that picked the table spelling under "אזורי משלוח"
    # was then missed by the exact-match delivery filter. Dedupe on city_key
    # and answer in the static spelling whenever one shares the key.
    # MEH-2602: canonical_city extends that to everyday aliases («בנימינה» →
    # «בנימינה-גבעת עדה», «מודיעין» → «מודיעין-מכבים-רעות»), «קרית»/«קריית»,
    # and the data.gov names whose parentheses arrive flipped.
    seen: set[str] = set()
    merged = []
    for raw in table_cities + live_cities + static_cities:
        name = canonical_city(raw) or ""
        key = city_key(name)
        if not key or key in seen:
            continue
        seen.add(key)
        merged.append(name)
    # MEH-2919 (C5): a direct prefix match outranks an alias-derived one.
    # «בנימינה-גבעת עדה» sorts before every «גבעת…» alphabetically, so a plain
    # sort made it suggestion #1 for the four keystrokes on the way to
    # «גבעתיים» — the opposite of what an autocomplete owes the person typing.
    # Nine of the 22 Hebrew letters inject a target on the first keystroke, and
    # for ג/ר/כ it does not even start with the letter she pressed. The alias
    # stays in the answer; it just stops displacing her own word.
    direct = _direct_forms(clean)
    merged.sort(key=lambda n: (not any(n.startswith(f) for f in direct), n))
    if clean in merged:
        merged.remove(clean)
        merged.insert(0, clean)
    return merged[:MAX_RESULTS]
