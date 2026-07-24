"""MEH-1508 chunk 1 — business-level dietary scope columns on producers

Adds four NOT NULL VARCHAR columns so a business can later state that its ENTIRE
offering is vegan/vegetarian (scope = 'some' vs 'all'), and whether its
production site handles gluten/lactose ('shared' vs 'dedicated'):

    vegan_scope             unknown | some | all
    vegetarian_scope        unknown | some | all
    gluten_free_facility    unknown | shared | dedicated
    lactose_free_facility   unknown | shared | dedicated

SCHEMA ONLY (chunk 1 of 3). No router, no Pydantic schema, no filter logic, no
UI touches this in this revision — chunks 2 (form + admin) and 3 (data-gated
chip/badge) follow after Sapir merges this. VARCHAR + app-level validation (no
Postgres enum type), matching how `availability_state` is handled.

Default: every row -> 'unknown' (NOT 'some'). The columns are NOT NULL with a DB
server_default='unknown' (server_default makes ADD COLUMN NOT NULL safe on the
existing rows; NOT NULL then forbids a fourth state outside the spec), plus an
explicit COALESCE UPDATE. 'unknown' is the honest default — we do not know a
business's whole-catalog scope until it is asked in chunk 2 — and it guarantees
ZERO change to any current filter result (no filter reads these columns yet).

down_revision = a9f2c7d41b6e (MEH-1490 producer_google_place_id) — the single
head on staging at authoring time. No table added, so EXPECTED_TABLES in the CI
drift gate stays unchanged.

Create Date: 2026-07-23 10:00:00+00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "d51508a7c9e2"
down_revision: Union[str, None] = "a9f2c7d41b6e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The four new columns; each existing row is backfilled to 'unknown'.
_NEW_COLUMNS = (
    "vegan_scope",
    "vegetarian_scope",
    "gluten_free_facility",
    "lactose_free_facility",
)


def upgrade() -> None:
    # Add NOT NULL WITH server_default='unknown' (mirroring the MEH-293 precedent
    # nullable=False + server_default). The server_default makes ADD COLUMN NOT
    # NULL safe on existing rows (Postgres backfills them to 'unknown' atomically
    # at ADD COLUMN time), and NOT NULL closes the last path to a fourth state
    # outside the unknown|some|all / unknown|shared|dedicated spec before chunk 2
    # adds the write paths (dashboard form + admin field).
    for name in _NEW_COLUMNS:
        op.add_column(
            "producers",
            sa.Column(
                name,
                sa.String(length=20),
                nullable=False,
                server_default=sa.text("'unknown'"),
            ),
        )

    # Belt-and-suspenders backfill to the honest 'unknown'. The server_default
    # above already populates existing rows, so this is now idempotent (COALESCE)
    # and defensive — kept explicit so the intended value is unmistakable. Pre-
    # launch table (~13 producers, MEH-1437), so a single UPDATE is safe; no
    # batched loop-with-LIMIT needed (ADR-007's loop is for large backfills).
    op.execute(
        """
        UPDATE producers
        SET vegan_scope           = COALESCE(vegan_scope, 'unknown'),
            vegetarian_scope      = COALESCE(vegetarian_scope, 'unknown'),
            gluten_free_facility  = COALESCE(gluten_free_facility, 'unknown'),
            lactose_free_facility = COALESCE(lactose_free_facility, 'unknown')
        """
    )


def downgrade() -> None:
    for name in reversed(_NEW_COLUMNS):
        op.drop_column("producers", name)
