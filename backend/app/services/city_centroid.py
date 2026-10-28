"""
Module:   city_centroid
Purpose:  Answer "where is this town?" from the seeded `cities` table, so a
          business that gave only a town (no street address) still gets a
          usable, approximate map point — server-side, with no third-party
          call. This is what makes the registration promise «אין כתובת
          מדויקת? היישוב מספיק» actually true.
Touches:  reads `cities` (name_he, lat, lng). No writes, no I/O beyond the DB.
Does NOT: geocode a street address, call Google or Nominatim, or decide
          precision semantics — callers stamp `location_precision=
          "approximate"` themselves (producer_queries.create_primary_branch_
          location, producer_me.py locations endpoints). The submission gate
          (services/submission_gate.py) is untouched: it keeps demanding real
          coordinates, and this module is how a town-only business obtains them.
Related:  backend/app/data/cities.py:144 (city_key — the one comparison form,
          MEH-2456); backend/app/routers/cities.py (same table, read side);
          backend/scripts/seed_cities.py (where lat/lng come from).
History:  MEH-2480 (creation) — 28/10/2026 the Google Places key answered 403
          on every lookup, no business could obtain coordinates, and
          «שליחה לבדיקה» stayed locked for everyone. One provider must never be
          the only way to pass a required step.
"""

from __future__ import annotations

import math

from sqlalchemy.orm import Session

from app.data.cities import city_key
from app.models import City

Centroid = tuple[float, float]


def _usable(value) -> bool:
    # bool is excluded on purpose: isinstance(True, int) is True in Python, so
    # a stray boolean would read as latitude 1. Mirrors submission_gate.
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    return not math.isnan(value)


def _as_centroid(row: City | None) -> Centroid | None:
    if row is None or not (_usable(row.lat) and _usable(row.lng)):
        return None
    return float(row.lat), float(row.lng)


def city_centroid(db: Session, name: str | None) -> Centroid | None:
    """`(lat, lng)` of the town's seeded centre, or None.

    Exact `name_he` match first — the registration CitySearch hands us the
    table's own spelling, so this is the common path and costs one indexed
    lookup. Then a normalised match through `city_key`, so «תל אביב - יפו» and
    «תל אביב-יפו» (the MEH-2456 pair) resolve to the same row. None when the
    town is unknown, blank, or seeded without coordinates — the caller then
    behaves exactly as before this module existed (no location row).

    Never raises on bad input: this sits inside registration, and a lookup
    failure must not take the signup down with it.
    """
    clean = (name or "").strip()
    if not clean:
        return None

    exact = db.query(City).filter(City.name_he == clean).first()
    found = _as_centroid(exact)
    if found:
        return found

    key = city_key(clean)
    if not key:
        return None
    # The table is ~1.3K rows; a full scan here is cheaper than a functional
    # index for a path that only runs when the exact match missed.
    for row in db.query(City).filter(City.lat.isnot(None)).all():
        if city_key(row.name_he) == key:
            return _as_centroid(row)
    return None
