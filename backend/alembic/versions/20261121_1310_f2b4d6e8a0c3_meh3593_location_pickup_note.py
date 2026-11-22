"""meh3593_location_pickup_note

Revision ID: f2b4d6e8a0c3
Revises: 7c3e5a9b1d2f
Create Date: 2026-11-21 13:10:00.000000+00:00

MEH-3593. Expand-only (ADR-007): one NULLable column, no backfill, no row
rewritten. producer_locations.pickup_note is «הוראות איסוף» for that pickup
point («נכנסים מהכניסה האחורית»). It lives on the address, not on the bag, so
a surprise bag, a product order and a group-buy pickup at the same point all
read one text. NULL = none written, and no surface shows the line.

Downgrade drops the column (any notes in it are lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2b4d6e8a0c3"
down_revision: Union[str, None] = "7c3e5a9b1d2f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_locations", sa.Column("pickup_note", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("producer_locations", "pickup_note")
