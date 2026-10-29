"""meh2528_retired_slugs

Revision ID: c3d8e2f1a9b4
Revises: 1cd44149cc20
Create Date: 2026-10-28 23:00:00.000000+00:00

MEH-2528: adds the `retired_slugs` table — tombstones for public business
URLs. Deleting a business is a hard delete, so its UNIQUE `producers.slug`
slot was free again at once, and the next business with the same name
inherited every `/p/<slug>` link to the deleted one. Same for a slug an admin
changes. `_ensure_unique_slug` (routers/admin.py) now treats a row here as
taken.

Expand-only per ADR-007: a new, empty table that no existing read path
touches — the previous container keeps serving unchanged while this runs. No
backfill: businesses deleted before this revision are gone, and their slugs
cannot be recovered (pre-launch: prod has no real businesses, staging only
test rows).

Columns: `slug` PK (String(100), same width as producers.slug); `producer_id`
nullable FK → producers.id ON DELETE SET NULL (the owner of a renamed slug,
NULL for a deleted business), indexed for the SET NULL scan; `reason`
('deleted' | 'renamed', checked in services/retired_slugs.py, not a DB
CHECK — one owner for the rule); `retired_at`.

Adds one table → EXPECTED_TABLES 41 -> 42 (pr-checks.yml).

downgrade() drops the table — every tombstone is forgotten, which is the
pre-MEH-2528 state (deleted slugs reusable).

Chained on 1cd44149cc20 (staging head on 28/10), so `alembic heads` stays at
one head.

# DO NOT create this table anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3d8e2f1a9b4"
down_revision: Union[str, None] = "1cd44149cc20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "retired_slugs",
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("retired_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["producer_id"], ["producers.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("slug"),
    )
    op.create_index(
        "ix_retired_slugs_producer_id", "retired_slugs", ["producer_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_retired_slugs_producer_id", table_name="retired_slugs")
    op.drop_table("retired_slugs")
