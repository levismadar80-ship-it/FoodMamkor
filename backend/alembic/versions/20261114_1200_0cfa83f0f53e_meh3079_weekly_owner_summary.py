"""meh3079_weekly_owner_summary

Revision ID: 0cfa83f0f53e
Revises: e4b8d2f6a913
Create Date: 2026-11-14 12:00:00.000000+00:00

MEH-3079 (weekly summary email for business owners): adds two columns to
`producers`:

  - `weekly_summary_opt_out`  BOOLEAN NOT NULL, server_default=false — set
    to true by the signed unsubscribe link in the email. NOT NULL is safe on
    an existing table because the server default fills every existing row
    in the same statement (the MEH-2952 `is_test` shape, b8cb5480552f).
  - `weekly_summary_sent_at`  TIMESTAMPTZ NULL — the idempotency stamp. NULL
    = never sent. The job skips a business stamped within the last 6 days.

Expand-only per ADR-007 — two additive columns, no change to existing
schema, no backfill. EXPECTED_TABLES unchanged (columns, not a table).

# DO NOT drop the server_default without a separate Expand-Contract ticket
#        (ADR-007). Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0cfa83f0f53e"
# Single head on staging when re-pointed (14/11): e4b8d2f6a913 (MEH-2642).
down_revision: Union[str, None] = "e4b8d2f6a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "weekly_summary_opt_out",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "producers",
        sa.Column(
            "weekly_summary_sent_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "weekly_summary_sent_at")
    op.drop_column("producers", "weekly_summary_opt_out")
