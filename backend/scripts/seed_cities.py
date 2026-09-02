"""MEH-213: One-time idempotent seed of the cities table from data.gov.il.

Run from the backend directory:
    python scripts/seed_cities.py

The script is idempotent — running it multiple times is safe.
Existing rows (matched by name_he UNIQUE) are skipped via ON CONFLICT DO NOTHING.

Data source:
    https://data.gov.il/api/3/action/datastore_search
    resource_id: d4901968-dad3-4845-a9b0-a57d027f11ab (Israeli localities)

MEH-2241 chunk 0 — the parser used to read the locality name from
``שם_יישוב`` / ``SHEM_YISHUV`` only, and when neither key existed it skipped
every record and logged a WARNING. On Railway staging (02/09, 12:34Z) that
produced ``Received 1272 records`` followed by ``No cities fetched — nothing to
insert`` — 0 rows, exit 0, and nothing in the log saying which keys the
records actually carried. Two changes:

1. The name column is DISCOVERED from the response — first from
   ``result.fields`` (the CKAN datastore publishes its own schema), then from
   the record keys — by a pattern that accepts the published spelling
   ``שם_ישוב`` (one yod), the old ``שם_יישוב``, and the Latin
   ``SHEM_YISHUV``, while rejecting ``שם_ישוב_לועזי`` (the Latin-script name).
2. Receiving records and parsing none of them is now an ERROR that names the
   keys seen, not a warning. A seed that inserts nothing must not exit 0.

The parser lives in :func:`parse_localities` so a test can drive it with a
captured response and no network (tests/test_meh2241_seed_cities_parser.py).
"""

import os
import sys

# Make `backend/` importable as package root when run directly.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import logging  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)
import re  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)

import httpx  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)
from sqlalchemy import text  # noqa: E402  # imports must follow sys.path.insert (script run-from-backend shim)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("seed_cities")

DATA_GOV_URL = (
    "https://data.gov.il/api/3/action/datastore_search"
    "?resource_id=d4901968-dad3-4845-a9b0-a57d027f11ab&limit=1500"
)

# The locality-name column, in every spelling it has been seen or documented
# under. Anchored on both ends so ``שם_ישוב_לועזי`` (Latin-script name) never
# matches: it shares the prefix and would otherwise win on a record that
# carries both.
#   שם_ישוב   — the resource's published field id (one yod)
#   שם_יישוב  — the spelling this script read before MEH-2241 (two yods)
#   SHEM_YISHUV — the Latin transliteration some data.gov.il mirrors use
_NAME_FIELD_RE = re.compile(r"^(?:שם_?י{1,2}שוב|shem_yishuv)$", re.IGNORECASE)

# Coordinates: the localities resource carries none, so these stay None for
# every row today. Kept tolerant in case a future resource/mirror adds them.
_LAT_KEYS = ("lat", "Y")
_LNG_KEYS = ("lon", "lng", "X")


class LocalityParseError(RuntimeError):
    """Records arrived but no locality name could be read from them."""


def _first(rec: dict, keys: tuple[str, ...]):
    for k in keys:
        if rec.get(k) not in (None, ""):
            return rec[k]
    return None


def _discover_name_key(fields: list, records: list[dict]) -> str | None:
    """Return the record key holding the Hebrew locality name, or None.

    Prefers the schema CKAN publishes in ``result.fields``; falls back to the
    keys of the first record (some mirrors omit ``fields``). ``records`` must
    be non-empty — :func:`parse_localities` returns before calling this on an
    empty list, and a caller with no records has nothing to discover a key in.

    Whatever names the column, the value returned is a key that actually
    exists on the records: a ``fields`` id is only trusted once it (or its
    stripped form) is found on the first record, so a schema entry the
    records do not carry falls through to the record-key scan instead of
    producing a key that reads every value as empty. (CI reviewer, PR #3288.)
    """
    record_keys = records[0].keys()
    candidates = [f.get("id") for f in fields if isinstance(f, dict)]
    candidates += list(record_keys)
    for key in candidates:
        if not isinstance(key, str) or not _NAME_FIELD_RE.match(key.strip()):
            continue
        for resolved in (key, key.strip()):
            if resolved in record_keys:
                return resolved
    return None


def parse_localities(payload: dict) -> list[dict]:
    """Turn a datastore_search response into ``[{name_he, lat, lng}, …]``.

    Raises :class:`LocalityParseError` when records were received but none
    yielded a name — the MEH-2241 failure — with the record keys in the
    message so the fix is one log line away. An empty ``records`` list is
    not an error here (the caller decides what "nothing came back" means).
    """
    result = payload.get("result") or {}
    records = result.get("records") or []
    if not records:
        return []

    keys_seen = sorted({str(k) for rec in records[:5] for k in rec.keys()})
    name_key = _discover_name_key(result.get("fields") or [], records)
    if name_key is None:
        raise LocalityParseError(
            f"{len(records)} records received but none carries a locality-name "
            f"column matching {_NAME_FIELD_RE.pattern!r}; keys seen: {keys_seen}"
        )

    cities: list[dict] = []
    for rec in records:
        # The dataset pads names to a fixed width with trailing spaces;
        # collapse any internal runs too so the UNIQUE name_he matches what a
        # person types.
        name = " ".join(str(rec.get(name_key) or "").split())
        if not name:
            continue
        try:
            lat = float(_first(rec, _LAT_KEYS) or 0) or None
            lng = float(_first(rec, _LNG_KEYS) or 0) or None
        except (TypeError, ValueError):
            lat = lng = None
        cities.append({"name_he": name, "lat": lat, "lng": lng})

    if not cities:
        raise LocalityParseError(
            f"{len(records)} records received, name column {name_key!r} found, "
            f"but every value was empty; keys seen: {keys_seen}"
        )
    return cities


def _fetch_payload() -> dict:
    log.info("Fetching city list from data.gov.il …")
    resp = httpx.get(DATA_GOV_URL, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _fetch_cities() -> list[dict]:
    """Fetch from data.gov.il and return list of {name_he, lat, lng} dicts."""
    payload = _fetch_payload()
    records = (payload.get("result") or {}).get("records") or []
    log.info("Received %d records", len(records))
    cities = parse_localities(payload)
    log.info("Parsed %d / %d records", len(cities), len(records))
    return cities


def seed() -> int:
    """Insert every parsed locality; return the number of rows inserted."""
    from app.database import engine

    cities = _fetch_cities()
    if not cities:
        log.warning("No cities fetched — nothing to insert")
        return 0

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
    return inserted


if __name__ == "__main__":
    seed()
