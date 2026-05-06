"""drop_review_title_dead_column

MEH-459: drop unused producer_reviews.title column. Audit Drift #3.

The column was added with the original ProducerReview model but was
never wired into the Pydantic input/output schemas — the frontend
posted a `title` field that Pydantic silently discarded
(extra='ignore'), and the value was never persisted. The DB column
was always NULL.

End-to-end cleanup in this PR:
  - models.py: ProducerReview.title removed
  - ProducerReviews.jsx: state, pre-fill, POST body, form input + label,
    and render block all removed (5 locations)
  - this migration: drops the column

Reversibility: downgrade re-adds the column with the original shape
(String(200), nullable=True). No data preserved on downgrade — the
column was always NULL anyway, so there's nothing to round-trip.

Source: MEH-433 schema parity audit, Drift #3 (`docs/SCHEMA_PARITY_AUDIT.md`).

Revision ID: 261e8d6ab23a
Revises: 2a74fa41ceb1
Create Date: 2026-05-06 13:09:55.308770+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '261e8d6ab23a'
down_revision: Union[str, None] = '2a74fa41ceb1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('producer_reviews', 'title')


def downgrade() -> None:
    op.add_column(
        'producer_reviews',
        sa.Column('title', sa.String(length=200), nullable=True),
    )
