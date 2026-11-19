"""meh3442_product_allergen_detail

Revision ID: c9e1a5d3f7b2
Revises: b4d8e2f6a1c3
Create Date: 2026-11-19 16:00:00.000000+00:00

MEH-3442: name the source of two allergens, as EU 1169/2011 Annex II requires
on a label — which cereal holds the gluten («איזה דגן?», e.g. כוסמין) and
which nut («איזה אגוז?», e.g. שקדים). The sheet then reads «מכיל: גלוטן
(כוסמין), אגוזים (שקדים)». Owner free text, kept only while its code is
declared (app/allergens.py detail_if_declared).

Expand-only per ADR-007: two new nullable columns, no default, no backfill.
The previous container never reads them.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops both columns; anything owners wrote since is lost.

Chained on b4d8e2f6a1c3 (MEH-3444).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9e1a5d3f7b2"
down_revision: Union[str, None] = "b4d8e2f6a1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("gluten_detail", sa.Text(), nullable=True))
    op.add_column("products", sa.Column("nuts_detail", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("products", "nuts_detail")
    op.drop_column("products", "gluten_detail")
