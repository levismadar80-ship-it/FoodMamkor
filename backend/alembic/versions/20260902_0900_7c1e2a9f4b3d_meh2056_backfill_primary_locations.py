"""MEH-1938 chunk 2 (MEH-2056): one primary `branch` row on producer_locations
for every producer that has coordinates and NO location row at all.

Data-only migration — no DDL, no new table (EXPECTED_TABLES unchanged), no
column change. It closes the gap that a9f4c2e7b1d3's backfill could not see:
that revision ran once, at table creation, and every producer created SINCE
by a write path that does not go through `create_primary_branch_location`
has coordinates in `producers.lat/lng` and nothing in `producer_locations`.

Measured 02/09 (Sapir, Railway Query tab): staging 13 such producers,
production 0 (no businesses yet). The 13 are two seed writers — the boot
seed (`backend/seed_data.py`, recreates its five fixtures after any
`--reset`, because `seed_demo_producers.py` names those five in
TEST_NAME_PATTERNS) and the demo seed (`backend/scripts/seed_demo_producers.py`,
eight archetype rows). Both writers are fixed in the SAME PR as this
revision so the next seed run cannot recreate the drift; this revision
repairs what they already wrote. Per-row created_at attribution was NOT
measured — the structural count (8 + 5 = 13) is the evidence, not the rows.

Why this matters for chunk 5 (MEH-1938): the Contract step removes the
`Producer.lat/lng` fallbacks (`haversine_min_km`'s COALESCE, `producerPoints()`,
`submission_gate`). After that, a producer with coordinates and no location
row is INVISIBLE to the map, to "near me" and to the submit gate. This
revision must therefore be applied — and the gap query read back as 0 — on
every environment BEFORE that chunk merges. That ordering is enforced by
Sapir re-running the count, not by code.

Two rulings (Sapir, 01/09) that shape the SQL:

1. The predicate is `NOT EXISTS (any producer_locations row)`, NOT "no row
   with usable coordinates". A coordinate-less row can already be the
   producer's `is_primary` one (the admin path mirrors a clear onto the row
   and KEEPS it — producer_queries.py `upsert_primary_branch_location`);
   inserting a second primary beside it would break the single-primary
   invariant the CRUD enforces. On the measured data the two predicates
   count the same 13 rows, so nothing is lost by choosing the safe one.
2. `opening_hours` and `phone` are mirrored onto the new row, exactly as
   a9f4c2e7b1d3 did. B3 (MEH-2142) made store hours a per-location fact
   with a read fallback to the business column behind
   LEGACY(2026-10-01, MEH-1938); a primary row created WITHOUT hours would
   keep that fallback load-bearing for these businesses and block its
   contract step.

The column list is lifted from a9f4c2e7b1d3 verbatim so the two backfills
produce byte-identical row shapes. `gen_random_uuid()` is Postgres 13+ core
and already ran in that revision on every environment (MEH-1938 Q5).

Idempotent by construction: a second `upgrade()` finds zero gap rows and
inserts nothing. The before/after counts are logged so they land in the
migration's own output (CI's `alembic upgrade head`, Railway's boot log);
`after` must read 0 — a non-zero value means the INSERT missed rows and is
logged at WARNING rather than aborting boot (a boot that fails on a
bookkeeping mismatch would take the whole API down for a data gap the
fallbacks still cover until chunk 5).

Revision ID: 7c1e2a9f4b3d
Revises: b3f7a1c46e92
Create Date: 2026-09-02 09:00:00
"""

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7c1e2a9f4b3d"
down_revision: str | None = "b3f7a1c46e92"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# REUSES: backend/alembic/versions/20260813_1512_97669fe803f5_meh1855_backfill_price_range.py:36-41
# — logging.info() through the alembic logger, not print(), so the counts
# reach whatever captures Railway's boot log.
logger = logging.getLogger("alembic.runtime.migration")

# The gap: coordinates on the business, no location row of any kind. This is
# the exact query Sapir runs by hand before and after (MEH-1938 P0), kept as
# one string so the number in the boot log and the number in the Railway
# console can never be answers to two different questions.
GAP_COUNT_SQL = """
    SELECT COUNT(*)
    FROM producers p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM producer_locations l WHERE l.producer_id = p.id
      )
"""

# Column list and value shape: a9f4c2e7b1d3:109-116, verbatim. `label` stays
# NULL — the same-city-needs-label rule (producer_me.py) applies to a SECOND
# row in the same town, and this row is by definition the producer's only one.
BACKFILL_SQL = """
    INSERT INTO producer_locations
        (id, producer_id, kind, label, city, address, lat, lng,
         opening_hours, phone, is_primary, location_precision,
         created_at, updated_at)
    SELECT
        gen_random_uuid(), p.id, 'branch', NULL, p.city, p.address,
        p.lat, p.lng, p.opening_hours, p.phone, true, 'exact',
        now(), now()
    FROM producers p
    WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM producer_locations l WHERE l.producer_id = p.id
      )
"""

# DO NOT give this revision the Phase 0 draft's DELETE-based downgrade
# ("a sole `branch` primary whose lat/lng still equal the producer's"). That
# predicate describes EVERY row a9f4c2e7b1d3 backfilled, not just the ones
# this revision adds — the two backfills produce the same row shape on
# purpose — so a downgrade would remove the original backfill for most
# producers on the way past. A precise revert needs to know which rows this
# run wrote, and that is not tracked. Same conclusion, same wording, as
# 97669fe803f5 (MEH-1855): documented no-op, not a silent pass.


def upgrade() -> None:
    conn = op.get_bind()

    before = conn.execute(sa.text(GAP_COUNT_SQL)).scalar_one()
    logger.info(
        "[MEH-2056] producers with coordinates and no location row, before: %s",
        before,
    )

    result = conn.execute(sa.text(BACKFILL_SQL))
    logger.info("[MEH-2056] backfilled primary branch rows: %s", result.rowcount)

    after = conn.execute(sa.text(GAP_COUNT_SQL)).scalar_one()
    if after == 0:
        logger.info("[MEH-2056] gap after backfill: 0 — chunk 5 precondition met here")
    else:
        # DO NOT raise here — see the module docstring. A non-zero `after` is
        # a finding to read in the boot log, not a reason to refuse to boot.
        logger.warning(
            "[MEH-2056] gap after backfill: %s (expected 0) — the INSERT "
            "missed rows; re-run the MEH-1938 P0 query before chunk 5",
            after,
        )


def downgrade() -> None:
    # REUSES: 20260813_1512_97669fe803f5_meh1855_backfill_price_range.py:96-108
    logger.info(
        "[MEH-2056] downgrade is a documented no-op — this revision only adds "
        "producer_locations rows that are indistinguishable from a9f4c2e7b1d3's "
        "backfill, so there is no revert that removes exactly its own writes. "
        "producers.lat/lng are untouched in both directions."
    )
