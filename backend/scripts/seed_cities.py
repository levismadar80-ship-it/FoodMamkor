"""MEH-213: One-time idempotent seed of the cities table from data.gov.il.

Run from the backend directory:
    python scripts/seed_cities.py

The script is idempotent — running it multiple times is safe.
Existing rows (matched by name_he UNIQUE) are skipped via ON CONFLICT DO NOTHING.

Data source:
    https://data.gov.il/api/3/action/datastore_search
    resource_id: d4901968-dad3-4845-a9b0-a57d027f11ab (Israeli localities)
"""

import os
import sys

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import logging  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)

import httpx  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)
from sqlalchemy import text  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_cities")

DATA_GOV_URL = (
    "https://data.gov.il/api/3/action/datastore_search"
    "?resource_id=d4901968-dad3-4845-a9b0-a57d027f11ab&limit=1500"
)


def _fetch_cities() -> list[dict]:
    """Fetch from data.gov.il and return list of {name_he, lat, lng} dicts."""
    log.info("Fetching city list from data.gov.il …")
    resp = httpx.get(DATA_GOV_URL, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    records = data.get("result", {}).get("records", [])
    log.info("Received %d records", len(records))

    cities = []
    for rec in records:
        name = (rec.get("שם_יישוב") or rec.get("SHEM_YISHUV") or "").strip()
        if not name:
            continue
        try:
            lat = float(rec.get("lat") or rec.get("Y") or 0) or None
            lng = float(rec.get("lon") or rec.get("X") or 0) or None
        except (TypeError, ValueError):
            lat = lng = None
        cities.append({"name_he": name, "lat": lat, "lng": lng})

    return cities


def seed():
    from app.database import engine

    cities = _fetch_cities()
    if not cities:
        log.warning("No cities fetched — nothing to insert")
        return

    inserted = 0
    with engine.connect() as conn:
        for c in cities:
            result = conn.execute(
                text(
                    """
                    INSERT INTO cities (name_he, lat, lng)
                    VALUES (:name_he, :lat, :lng)
                    ON CONFLICT (name_he) DO NOTHING
                    """
                ),
                {"name_he": c["name_he"], "lat": c["lat"], "lng": c["lng"]},
            )
            inserted += result.rowcount
        conn.commit()

    log.info("Done — inserted %d / %d cities (skipped existing)", inserted, len(cities))


if __name__ == "__main__":
    seed()
