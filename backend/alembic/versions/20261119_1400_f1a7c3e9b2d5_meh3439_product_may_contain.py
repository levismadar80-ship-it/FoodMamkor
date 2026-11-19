"""meh3439_product_may_contain

Revision ID: f1a7c3e9b2d5
Revises: c7e2a9d4f1b8
Create Date: 2026-11-19 14:00:00.000000+00:00

MEH-3439: «עלול להכיל» — allergens that may reach a product from shared tools
or surfaces (cross-contact), separate from `allergens` («מכיל»), as the
Ministry of Health draft allergen-labelling regulations (2022) and EU
1169/2011 practice separate them. Codes from the same closed list in
app/allergens.py.

Expand-only per ADR-007: one new nullable column, no default, no backfill —
NULL means "the owner declared nothing", never "no cross-contact". The
previous container never reads it.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; anything owners ticked since is lost.

Chained on c7e2a9d4f1b8 (MEH-2936, #4860, which the release thread merges first, 19/11).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f1a7c3e9b2d5"
down_revision: Union[str, None] = "c7e2a9d4f1b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column("may_contain", postgresql.ARRAY(sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "may_contain")
