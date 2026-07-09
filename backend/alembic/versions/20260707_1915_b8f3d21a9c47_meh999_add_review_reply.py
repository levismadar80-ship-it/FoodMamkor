"""meh999_add_review_reply

Revision ID: b8f3d21a9c47
Revises: a1b2c3d4e5f6
Create Date: 2026-07-07 19:15:00.000000+00:00

MEH-1039 (Refs MEH-999): adds the business-owner reply trail — two nullable
columns on `producer_reviews`:

- `reply` (TEXT, nullable) — the producer owner's free-text reply to a
  customer review. One reply per review; set/edited only by the review's
  producer owner (review.producer_id == user.producer_id). No threading,
  no nested replies.
- `reply_at` (TIMESTAMP, nullable) — naive stamp of when the reply was last
  set. Naive (NOT timezone=True) to match the sibling `created_at` on this
  same table and the `datetime.utcnow()` the endpoint writes (CHUNK B).

Both nullable / Expand-only (ADR-007, no backfill) — existing reviews predate
the reply. EXPECTED_TABLES unchanged (columns, not a table).

# DO NOT change nullability without an explicit MEH ticket + backfill —
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8f3d21a9c47'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producer_reviews',
        sa.Column('reply', sa.Text(), nullable=True),
    )
    op.add_column(
        'producer_reviews',
        sa.Column('reply_at', sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producer_reviews', 'reply_at')
    op.drop_column('producer_reviews', 'reply')
