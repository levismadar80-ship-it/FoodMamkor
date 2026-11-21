"""meh3618_product_weekdays

Revision ID: d6a8b0c2e4f5
Revises: c5f7a9b1d3e4
Create Date: 2026-11-21 18:00:00.000000+00:00

MEH-3618. Expand-only (ADR-007). Approved by Sapir 21/11 (card MEH-3618).

- products.available_weekdays: SMALLINT NULL, a bitmask of the days the
  product is made (Sunday = 1 … Saturday = 64). NULL = every day, which is
  every existing row, so nothing reads or orders differently.
- CHECK 1..127: no mask with no day, no bit past Saturday.

No backfill, no row rewritten. Downgrade drops the column (the owners' day
choices are lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6a8b0c2e4f5"
down_revision: Union[str, None] = "c5f7a9b1d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("available_weekdays", sa.SmallInteger(), nullable=True),
    )
    op.create_check_constraint(
        "products_available_weekdays_check",
        "products",
        "available_weekdays >= 1 AND available_weekdays <= 127",
    )


def downgrade() -> None:
    op.drop_constraint("products_available_weekdays_check", "products", type_="check")
    op.drop_column("products", "available_weekdays")
