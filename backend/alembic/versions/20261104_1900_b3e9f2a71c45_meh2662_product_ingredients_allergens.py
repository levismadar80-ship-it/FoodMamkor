"""meh2662_product_ingredients_allergens

Revision ID: b3e9f2a71c45
Revises: d7a511246b14
Create Date: 2026-11-04 19:00:00.000000+00:00

MEH-2662 chunk 1: two optional, owner-declared product fields, like the
"more info" panel on Wolt items — `ingredients` (free text) and `allergens`
(codes from the closed list in app/allergens.py).

Expand-only per ADR-007: two new nullable columns, no default, no backfill —
there is nothing to infer an ingredient list or an allergen claim from, and
inventing one would put a food-safety claim in the business's mouth. The
previous container never reads them.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops both columns; anything owners typed since is lost.

Chained on d7a511246b14 (MEH-2633, staging head on 04/11), so `alembic heads`
stays at one head.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b3e9f2a71c45"
down_revision: Union[str, None] = "d7a511246b14"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("ingredients", sa.Text(), nullable=True))
    op.add_column(
        "products",
        sa.Column("allergens", postgresql.ARRAY(sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("products", "allergens")
    op.drop_column("products", "ingredients")
