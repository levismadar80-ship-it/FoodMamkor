"""meh1011_producer_requested_changes

Revision ID: a1b2c3d4e5f6
Revises: f9a2c7d41b83
Create Date: 2026-07-03 10:00:00.000000+00:00

MEH-1011: adds the producer "request-changes" trail — two nullable columns
on `producers`:

- `requested_changes` (TEXT, nullable) — the admin's free-text completion
  feedback sent to a pending producer (e.g. "missing photo", "missing
  license number"). The non-terminal twin of `rejection_reason`: status
  stays "pending", so this is a "please complete" path, not a rejection.
- `changes_requested_at` (TIMESTAMPTZ, nullable) — tz-aware stamp of when
  the request was sent (MEH-762 D1 precedent — NOT naive utcnow).

Both nullable / Expand-only (ADR-007, no backfill) — existing rows predate
the trail. Cleared on approve (approve_producer). Admin-only exposure via
ProducerAdminOut; never on the public ProducerDetailOut/ListOut.

# DO NOT change nullability without an explicit MEH ticket + backfill —
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'f9a2c7d41b83'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('requested_changes', sa.Text(), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column(
            'changes_requested_at',
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column('producers', 'changes_requested_at')
    op.drop_column('producers', 'requested_changes')
