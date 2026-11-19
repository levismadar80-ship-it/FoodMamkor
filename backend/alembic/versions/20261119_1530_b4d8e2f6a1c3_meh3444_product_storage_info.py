"""meh3444_product_storage_info

Revision ID: b4d8e2f6a1c3
Revises: f1a7c3e9b2d5
Create Date: 2026-11-19 15:30:00.000000+00:00

MEH-3444: «אחסון ותוקף» — owner-declared storage and shelf-life text for a
product (e.g. «בקירור, עד 10 ימים מיום הקנייה»), shown on the product sheet
under the allergens. A mandatory item on every Israeli food label (ת"י 1145).

Expand-only per ADR-007: one new nullable column, no default, no backfill —
NULL means "not filled". The previous container never reads it.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; anything owners wrote since is lost.

Chained on f1a7c3e9b2d5 (MEH-3439). If the merge order re-points MEH-3439,
this stays on it.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4d8e2f6a1c3"
down_revision: Union[str, None] = "f1a7c3e9b2d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("storage_info", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "storage_info")
