"""meh3311_group_buy_goal_flap_stamps

Revision ID: a7d3e9c1b5f2
Revises: f6c2a8d4e1b7
Create Date: 2026-11-15 09:00:00.000000+00:00

MEH-3311 (a funded group buy that drops below its goal): adds two nullable
naive-UTC timestamps to `group_buys`, the same shape as `funded_notified_at`
(MEH-1651):

  - `below_goal_notified_at` — the participants who stayed were told the group
    dropped below its minimum. NULL = never. Set at most once per group.
  - `refunded_notified_at`   — after that, the group re-crossed its minimum and
    every participant got the funded email again. NULL = never. At most once.

Two one-way stamps keep the MEH-1651 promise: however often a group flaps
around its minimum, each participant gets at most three emails (funded,
below goal, back at goal). `funded_notified_at` itself stays one-way.

Expand-only per ADR-007 — two additive nullable columns, no backfill.
EXPECTED_TABLES unchanged (columns, not a table).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a7d3e9c1b5f2"
down_revision: Union[str, None] = "f6c2a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "group_buys", sa.Column("below_goal_notified_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "group_buys", sa.Column("refunded_notified_at", sa.DateTime(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("group_buys", "refunded_notified_at")
    op.drop_column("group_buys", "below_goal_notified_at")
