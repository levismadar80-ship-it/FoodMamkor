"""
Module:   count_hours_gap
Purpose:  READ-ONLY count of the `opening_hours` dual-write gap (MEH-1938):
          producers whose legacy `producers.opening_hours` column holds a value
          while their PRIMARY `producer_locations` row has none. The number is
          the precondition for the contract step — removing the read fallback
          in `frontend/lib/hours.js` (LEGACY(2026-11-30, MEH-1938)) is safe
          only when it reads 0 on every environment.
Touches:  Reads DB tables producers (id, name, opening_hours) and
          producer_locations (producer_id, is_primary, opening_hours).
          NO WRITES — SELECT only. Never UPDATE, INSERT or DELETE. Prints the
          count and the offending ids; a human decides what to do with them.
Does NOT: backfill anything — a repair is an Alembic data revision, the shape
          7c1e2a9f4b3d used for lat/lng, not a maintenance script. Does NOT
          count producers with NO primary row at all; that is the lat/lng gap
          7c1e2a9f4b3d's GAP_COUNT_SQL owns, and a business with hours but no
          coordinates legitimately has no row to carry them (MEH-213).
Related:  backend/alembic/versions/20260902_0900_7c1e2a9f4b3d_meh2056_backfill_primary_locations.py:81-88
          (GAP_COUNT_SQL — the pattern this mirrors for the hours axis) ·
          backend/app/services/producer_queries.py::upsert_primary_branch_location
          (`mirror_hours`, the write-through that stops the gap growing) ·
          backend/scripts/check_no_demo_data.py (the read-only script shape).
History:  MEH-1938 (creation — hours write-through chunk).

Run (Sapir, Git Bash, against the target environment):
    railway run python backend/scripts/count_hours_gap.py
Local / machine-readable:
    python backend/scripts/count_hours_gap.py            # human table
    python backend/scripts/count_hours_gap.py --json     # JSON

Exit 0 = gap is 0 (contract-step precondition met on this DB).
Exit 1 = at least one producer still has hours only on the legacy column.
"""

import argparse
import json
import os
import sys
from urllib.parse import urlparse

import sqlalchemy as sa

# Make `backend/` importable as package root when run directly (script shim).
# REUSES: backend/scripts/check_no_demo_data.py:39-44 — same shim, same imports.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from app.database import SessionLocal, engine  # noqa: E402  # imports follow sys.path.insert

# The gap, as ONE query string — the same discipline as 7c1e2a9f4b3d's
# GAP_COUNT_SQL: the number this prints and the number Sapir reads in the
# Railway Query tab must be answers to the same question. "Empty" on the row
# side means NULL or whitespace-only, because the dashboard editor can save
# an empty string where the backfill would have written NULL; "has hours" on
# the business side is the same test inverted, so a legacy '' is not counted
# as a value the row is missing.
#
# `is_primary = true` on purpose, not "any row with hours": the public page
# reads the PRIMARY row's hours (MEH-2142), so hours on a pickup point do not
# retire the fallback for that business.
# Mirrors the frontend's row selection, not a looser one: hours.js
# resolveStoreHours() picks `locations.find(is_primary)` and, when there is
# NO primary row at all, falls straight through to producer.opening_hours. So
# the gap is "column has hours AND (no primary row OR primary row has none)".
# An inner JOIN (the first version of this query) silently dropped the
# no-primary-row class — delivery-only businesses (MEH-213) and businesses
# whose only rows are pickup/market_stand — and reported 0 while the fallback
# was still the only thing rendering their hours (review of #3524, defect 2).
# Whitespace: Postgres btrim() strips ASCII spaces; JS trim() also strips
# newlines/NBSP, so a row holding only "\n" reads as empty to the frontend but
# as "has hours" here. E'[ \t\n\r]' keeps the two in step for the common cases.
GAP_SQL = """
    SELECT p.id, p.name,
           (l.id IS NULL) AS no_primary_row
    FROM producers p
    LEFT JOIN producer_locations l
      ON l.producer_id = p.id AND l.is_primary = true
    WHERE p.opening_hours IS NOT NULL
      AND btrim(p.opening_hours, E' \t\n\r') <> ''
      AND (l.id IS NULL
           OR l.opening_hours IS NULL
           OR btrim(l.opening_hours, E' \t\n\r') = '')
    ORDER BY p.id
"""


def _db_host() -> str:
    """Best-effort hostname of the configured DB, for the report header."""
    return (
        urlparse(str(engine.url).replace("postgresql+psycopg2", "postgresql")).hostname
        or "?"
    ).lower()


def count_gap(db) -> dict:
    """Run the read-only query. Returns a structured result dict.

    One SELECT — no statement mutates state. The count is derived from the
    returned rows (`len`), never stated separately, so it cannot disagree
    with the id list printed under it.
    """
    rows = db.execute(sa.text(GAP_SQL)).all()
    gap = [
        {"id": str(row.id), "name": row.name, "no_primary_row": bool(row.no_primary_row)}
        for row in rows
    ]
    return {
        "db_host": _db_host(),
        "gap_count": len(gap),
        "clean": len(gap) == 0,
        "producers": gap,
    }


def _print_table(result: dict) -> None:
    """Human-readable report."""
    print(
        f"=== opening_hours dual-write gap (MEH-1938) — DB host: {result['db_host']} ==="
    )
    print(
        "producers with hours on the legacy column whose PRIMARY location row "
        f"has none: {result['gap_count']}"
    )
    if result["producers"]:
        for p in result["producers"]:
            why = "no primary row" if p["no_primary_row"] else "primary row has no hours"
            print(f"  {p['id']}  {p['name']}  — {why}")
    else:
        print("  (none)")
    print()

    if result["clean"]:
        print(
            "RESULT: 0 — every primary row already carries its business's hours; "
            "the hours.js fallback removal is safe against THIS database (exit 0)"
        )
    else:
        print(
            f"RESULT: {result['gap_count']} producer(s) still depend on the legacy "
            "read fallback — do not remove it until this reads 0 here; the script "
            "never writes (exit 1)"
        )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Read-only count of producers whose opening_hours live only "
        "on the legacy producers column (exit 1 if any). Never writes."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable JSON instead of the human table",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        result = count_gap(db)
    finally:
        db.close()

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        _print_table(result)

    sys.exit(0 if result["clean"] else 1)


if __name__ == "__main__":
    main()
