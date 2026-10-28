"""meh2459_producer_kind

Revision ID: f1a2b3c4d5e6
Revises: e5b2d8f4a913
Create Date: 2026-10-28 00:10:00.000000+00:00

MEH-2459 chunk 1: adds `producers.kind VARCHAR(20) NOT NULL DEFAULT 'producer'`
and CHECK `producer_kind_values` (kind IN ('producer', 'organizer')).

A market / event organizer (שוק גלם and the like) registers to publish its
markets as events and sells nothing. It is a `producers` row with
`kind='organizer'`, not a new entity: `events.producer_id` is NOT NULL, and a
second owner table for events would be two parallel mechanisms for one job
(workflow smell #1). The row is hidden from every business surface by the
shared predicate `producer_listing.is_business()` and is reachable only
through its events (ADR-036).

Expand-only per ADR-007: ADD COLUMN with a server default, so every existing
row becomes a business with no backfill and no NOT NULL failure on live data;
adds a constraint; drops nothing. A bare `create_check_constraint` is safe
here without a repair UPDATE because the column is born with the default —
no pre-existing row can violate it. EXPECTED_TABLES unchanged (a column and
a CHECK are not BASE TABLEs; the drift gate counts tables only).

downgrade() drops the constraint, then the column — the inverse of upgrade,
and lossy by design: organizer rows become plain businesses on rollback, which
is the pre-MEH-2459 state of the world.

# DO NOT add this column anywhere else — Alembic is the sole schema authority
#        since MEH-267 (root cause of the MEH-265 incident).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
# Chains onto the single head e5b2d8f4a913 (MEH-2392/2393 drop follow +
# referral), derived by parsing every version file for revision /
# down_revision strings outside docstrings.
down_revision: Union[str, None] = "e5b2d8f4a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CONSTRAINT_NAME = "producer_kind_values"
CONSTRAINT_SQL = "kind IN ('producer', 'organizer')"


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "kind",
            sa.String(length=20),
            nullable=False,
            server_default="producer",
        ),
    )
    op.create_check_constraint(CONSTRAINT_NAME, "producers", CONSTRAINT_SQL)


def downgrade() -> None:
    op.drop_constraint(CONSTRAINT_NAME, "producers", type_="check")
    op.drop_column("producers", "kind")
