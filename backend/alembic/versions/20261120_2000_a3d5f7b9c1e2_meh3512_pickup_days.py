"""meh3512_pickup_days

Revision ID: a3d5f7b9c1e2
Revises: f2c6a8e4b0d7
Create Date: 2026-11-20 20:00:00.000000+00:00

MEH-3512. Expand-only (ADR-007): three NULLable columns on producer_locations,
no backfill, no row rewritten, no constraint narrowed.

- pickup_days — the weekdays the point is open for pickup (same Hebrew day
  names as delivery_areas.delivery_days, whitelisted in the schema). NULL or
  [] = «בתיאום», which renders exactly as a point did before this column.
- order_cutoff_day / order_cutoff_time — «מזמינים עד יום רביעי ב-15:00» for
  this point. NULL = the business-wide order_window applies, as before.

Existing labels that carry the day in text are NOT parsed into the column
(card: no automatic conversion).

Downgrade drops the three columns (the data in them is lost; label and
opening_hours are untouched).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

# revision identifiers, used by Alembic.
revision: str = "a3d5f7b9c1e2"
down_revision: Union[str, None] = "f2c6a8e4b0d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_locations",
        sa.Column("pickup_days", ARRAY(sa.String(10)), nullable=True),
    )
    op.add_column(
        "producer_locations",
        sa.Column("order_cutoff_day", sa.String(10), nullable=True),
    )
    op.add_column(
        "producer_locations",
        sa.Column("order_cutoff_time", sa.String(5), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producer_locations", "order_cutoff_time")
    op.drop_column("producer_locations", "order_cutoff_day")
    op.drop_column("producer_locations", "pickup_days")
