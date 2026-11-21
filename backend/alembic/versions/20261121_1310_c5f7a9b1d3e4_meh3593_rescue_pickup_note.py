"""meh3593_rescue_pickup_note

Revision ID: c5f7a9b1d3e4
Revises: b4e6a8c0d2f3
Create Date: 2026-11-21 13:10:00.000000+00:00

MEH-3593. Expand-only (ADR-007): one NULLable column, no backfill, no row
rewritten. rescue_typical_items.pickup_note is the business's «הוראות איסוף»
for its surprise bag («נכנסים מהכניסה האחורית»), kept beside the typical items
and allergens because, like them, it is said once and holds for every bag.
NULL = the business wrote none, and the bag page shows no such line.

Downgrade drops the column (any notes in it are lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c5f7a9b1d3e4"
down_revision: Union[str, None] = "b4e6a8c0d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rescue_typical_items", sa.Column("pickup_note", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("rescue_typical_items", "pickup_note")
