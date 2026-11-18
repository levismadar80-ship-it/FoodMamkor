"""meh2697_availability_confirmed_at

Revision ID: a3d9e5c1f7b2
Revises: a8d41c2e7f90
Create Date: 2026-11-17 16:00:00.000000+00:00

MEH-2697 phase 1 (rulings 17/11 §א9), EXPAND step of ADR-007: when the owner
last said her availability is still true.

  - `producers.availability_confirmed_at`  TIMESTAMPTZ NULL — no default, no
                                           backfill.

WHY NO BACKFILL: the column backs a public tag, «אושר ע״י בית העסק · לפני N
ימים». Filling it from `updated_at` or `last_active_at` would put the owner's
name on a confirmation she never gave. NULL means "never confirmed" and the
tag shows nothing.

Writers (same PR): POST /producers/me/availability-state and
POST /producers/me/availability-confirm, owner only. Nothing reads it for a
decision; the public producer payload carries it for the tag, which ships in
a later PR together with its copy.

Adding a nullable column with no default is a metadata-only change in
Postgres: no table rewrite, no long lock.

EXPECTED_TABLES unchanged. Downgrade drops the column; the only thing lost is
the confirmation dates.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a3d9e5c1f7b2"
down_revision: Union[str, None] = "a8d41c2e7f90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "availability_confirmed_at", sa.DateTime(timezone=True), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "availability_confirmed_at")
