"""meh3597_group_buy_pickup_window

Revision ID: 40e9fd2c1b3a
Revises: 2189efe602b9
Create Date: 2026-11-21 16:00:00.000000+00:00

MEH-3597. Expand-only (ADR-007): two NULLable columns, no backfill, no row
rewritten. A group buy without them reads as before (the free-text pickup
note stays the only answer).

- group_buys.pickup_starts_at / pickup_ends_at — the pickup window, naive UTC
  like `deadline` («איסוף: שישי 5.12, 9:00–13:00», as a rescue bag shows its
  pickup hours).

No table added: EXPECTED_TABLES unchanged. Downgrade drops both columns.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "40e9fd2c1b3a"
down_revision: Union[str, None] = "2189efe602b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("group_buys", sa.Column("pickup_starts_at", sa.DateTime(), nullable=True))
    op.add_column("group_buys", sa.Column("pickup_ends_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("group_buys", "pickup_ends_at")
    op.drop_column("group_buys", "pickup_starts_at")
