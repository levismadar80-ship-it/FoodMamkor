"""meh1849_nationwide_requires_delivery

Revision ID: d8c3f1a75e29
Revises: b6e1d94a3f27
Create Date: 2026-08-03 12:00:00.000000+00:00

MEH-1849 chunk 2: adds CHECK `producer_nationwide_requires_delivery` to
`producers` — NOT (delivery_nationwide AND NOT offers_delivery).

A business that declares it does not deliver, while carrying the strongest
delivery configuration there is, is a logical contradiction. MEH-1848 already
stops such a row from being SHOWN (producer_listing.py consults
`offers_delivery` in both delivery predicates). This stops it from EXISTING.
The two halves are the read path and the write path of one invariant, and the
read half alone leaves psql, seeds, and importers free to create the row —
after which every OTHER consumer of the column still reads the wrong value.

Shopify's market+zone model is the precedent: a destination is purchasable
only when it is in an active market AND in a shipping zone with rates. Two
conditions, not one. `offers_delivery` is the intent switch (market),
`delivery_nationwide`/`delivery_areas` the configuration (zone).

WHY THE BACKFILL IS UNCONDITIONAL, AND WHY IT MUST NOT BE DELETED AS DEAD CODE
-----------------------------------------------------------------------------
The chunk-1 audit measured ZERO violating rows on staging, so the UPDATE below
is a no-op there and will report 0. It runs anyway, because the environment
that decides this is not the one that was measured:

`Dockerfile` runs `alembic upgrade head` on every Railway boot. If production
holds even one violating row at deploy time, a bare `create_check_constraint`
raises and takes down the BOOT — not CI, not a PR check, but the running
service, at the moment of deploy. The backfill is the difference between a
migration that is safe to deploy against an unmeasured database and one that
is safe only against the database somebody happened to look at.

Direction of the repair: `offers_delivery = true`, never
`delivery_nationwide = false`. `delivery_nationwide = true` is the more
specific and more deliberate declaration — an owner had to configure nationwide
scope — whereas `offers_delivery = false` is this column's DEFAULT, so a
conflicting pair is far more likely an un-updated default than a retracted
delivery offer. Repairing toward the default would silently delete a real
capability; repairing away from it makes an existing capability consistent.

downgrade() drops the constraint ONLY. It deliberately does not reverse the
backfill: the backfilled value is CORRECT — the business does deliver — and
un-setting `offers_delivery` would restore exactly the contradiction this
revision exists to remove. A downgrade should undo the constraint, not
re-introduce bad data. (It is also not reversible in principle: after the
UPDATE, a repaired row is indistinguishable from a row that was always
consistent, so there is nothing to target.)

LIMITATION — a CHECK cannot span tables. The sibling contradiction, "rows in
`delivery_areas` while `offers_delivery = false`", lives across two tables and
is therefore NOT expressible here; it is enforced only in the query layer by
MEH-1848's `_delivery_city_condition`. A direct INSERT can still create that
pair. Closing it would need a trigger or a derived column, both explicitly out
of scope for this ticket.

Expand-only per ADR-007 — adds a constraint, changes no column type and drops
nothing. EXPECTED_TABLES unchanged, and this is verified rather than assumed:
the drift gate (the `EXPECTED_TABLES=39` step in the PR-checks workflow) runs
`SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND
table_type='BASE TABLE' AND table_name <> 'alembic_version'`. It counts BASE
TABLEs; a CHECK constraint is not one and cannot move that number. Measured
after this revision on a real Postgres: 39.

# DO NOT relax this to a bare `create_check_constraint` by deleting the UPDATE
#        because "staging measured 0" — staging is not production, and the
#        failure lands on the Railway boot, not on CI. Alembic is the sole
#        schema authority since MEH-267; do not add this to _migrate_columns.
"""
from typing import Sequence, Union

import logging

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d8c3f1a75e29"
# MEH-1849: chains onto the current head b6e1d94a3f27 (MEH-1823
# producer_offers). Head derived by AST-parsing the version files, not by
# regex — a regex also matches `down_revision` written inside a docstring and
# mis-reports the graph (the trap that fired on MEH-1823).
down_revision: Union[str, None] = "b6e1d94a3f27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

CONSTRAINT_NAME = "producer_nationwide_requires_delivery"
# NOT (A AND NOT B). Both columns are NOT NULL today, so there is no
# three-valued-logic edge; written in this form rather than the equivalent
# `NOT delivery_nationwide OR offers_delivery` because it reads as the
# prohibition it is — "you may not be nationwide without offering delivery".
CONSTRAINT_SQL = "NOT (delivery_nationwide AND NOT offers_delivery)"


def upgrade() -> None:
    # Defensive backfill FIRST — see the docstring for why this is not dead
    # code even though the staging count is 0.
    result = op.get_bind().execute(
        sa.text(
            "UPDATE producers SET offers_delivery = true "
            "WHERE delivery_nationwide = true AND offers_delivery = false"
        )
    )
    logger.info(
        "MEH-1849: repaired %s producer row(s) with "
        "delivery_nationwide=true, offers_delivery=false",
        result.rowcount,
    )

    op.create_check_constraint(CONSTRAINT_NAME, "producers", CONSTRAINT_SQL)


def downgrade() -> None:
    # Constraint only. The backfill is NOT reversed — see the docstring.
    op.drop_constraint(CONSTRAINT_NAME, "producers", type_="check")
