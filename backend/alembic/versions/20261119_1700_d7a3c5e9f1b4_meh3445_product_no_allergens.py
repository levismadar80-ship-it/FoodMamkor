"""meh3445_product_no_allergens

Revision ID: d7a3c5e9f1b4
Revises: c9e1a5d3f7b2
Create Date: 2026-11-19 17:00:00.000000+00:00

MEH-3445: «אין במוצר אלרגנים מהרשימה» — the owner's explicit declaration that
none of the listed allergens is in the product (honey, olives, vegetables).
Until now NULL lists meant only «בית העסק לא ציין אלרגנים», so such a product
could never answer the dashboard reminder truthfully.

Expand-only per ADR-007: one NOT NULL boolean with server default false, so
existing rows read false and the previous container, which never writes the
column, inserts false too. No backfill.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; every "none" declaration since is lost (the
product then reads «לא ציין» again).

Chained on c9e1a5d3f7b2 (MEH-3442).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7a3c5e9f1b4"
down_revision: Union[str, None] = "c9e1a5d3f7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products",
        sa.Column(
            "no_allergens",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("products", "no_allergens")
