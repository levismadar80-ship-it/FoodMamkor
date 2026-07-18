"""meh1297_producer_category_position

Revision ID: f3a8c2d61e9b
Revises: c5e1a9d7f2b4
Create Date: 2026-07-17 15:00:00.000000+00:00

MEH-1297 (multi-category ordering): adds `position` to the
`producer_categories` association table so a producer's categories have a
deterministic order — position 0 = the primary category (the first one the
producer picked). Until now the table was a bare (producer_id, category_id)
PK and every consumer of `producer.categories[0]` (card, map pin) displayed
an arbitrary row (root cause of MEH-1189).

One column:

- `position` (INTEGER, NOT NULL, server_default '0') — 0-based order of the
  category within the producer's selection. The server_default covers the
  ADD itself; the UPDATE below backfills existing rows to a deterministic
  0..n-1 sequence per producer, ordered by category_id (there is no
  historical selection order to recover, so category_id is the only stable
  tiebreaker — it matches what most listings happened to show).

Expand-only. EXPECTED_TABLES unchanged (column, not a table). No other
schema change (MEH-1297 scope).

# DO NOT add a cap/CHECK constraint here — the 3-category cap is enforced
#        at the Pydantic layer only (MEH-1297 product decision); existing
#        producers may legitimately carry >3 categories from import.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f3a8c2d61e9b"
down_revision: Union[str, None] = "c5e1a9d7f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_categories",
        sa.Column(
            "position",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    # Deterministic backfill: 0..n-1 per producer, ordered by category_id.
    op.execute(
        """
        UPDATE producer_categories AS pc
        SET position = sub.rn
        FROM (
            SELECT producer_id,
                   category_id,
                   row_number() OVER (
                       PARTITION BY producer_id
                       ORDER BY category_id
                   ) - 1 AS rn
            FROM producer_categories
        ) AS sub
        WHERE pc.producer_id = sub.producer_id
          AND pc.category_id = sub.category_id
        """
    )


def downgrade() -> None:
    op.drop_column("producer_categories", "position")
