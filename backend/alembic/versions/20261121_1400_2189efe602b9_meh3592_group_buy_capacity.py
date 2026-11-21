"""meh3592_group_buy_capacity

Revision ID: 2189efe602b9
Revises: b4e6a8c0d2f3
Create Date: 2026-11-21 14:00:00.000000+00:00

MEH-3592 (Sapir approved the migration 21/11). Expand-only (ADR-007): two
NULLable columns and one new table. No backfill, no row rewritten, no
constraint narrowed; a group buy that sets neither column reads as before.

- group_buys.max_units — a cap in units beside max_participants.
- group_buys.joins_closed_at — the business stopped new joins.
- group_buy_waitlist — a signed-in visitor waiting for a place in a full
  group buy (unique per group buy + user; cascades with both).

Adds one table: EXPECTED_TABLES 64 -> 65 (.github/workflows/pr-checks.yml).

Downgrade drops the table and the two columns (data in them is lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2189efe602b9"
down_revision: Union[str, None] = "b4e6a8c0d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("group_buys", sa.Column("max_units", sa.Integer(), nullable=True))
    op.add_column(
        "group_buys", sa.Column("joins_closed_at", sa.DateTime(), nullable=True)
    )
    op.create_table(
        "group_buy_waitlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_buy_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("offered_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["group_buy_id"], ["group_buys.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "group_buy_id", "user_id", name="uq_group_buy_waitlist_user"
        ),
    )
    op.create_index(
        "ix_group_buy_waitlist_group_buy_id", "group_buy_waitlist", ["group_buy_id"]
    )
    op.create_index("ix_group_buy_waitlist_user_id", "group_buy_waitlist", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_group_buy_waitlist_user_id", table_name="group_buy_waitlist")
    op.drop_index("ix_group_buy_waitlist_group_buy_id", table_name="group_buy_waitlist")
    op.drop_table("group_buy_waitlist")
    op.drop_column("group_buys", "joins_closed_at")
    op.drop_column("group_buys", "max_units")
