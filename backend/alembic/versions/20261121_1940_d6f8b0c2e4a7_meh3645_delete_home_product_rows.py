"""meh3645_delete_home_product_rows

Revision ID: d6f8b0c2e4a7
Revises: c5e7a9b1d3f6
Create Date: 2026-11-21 19:40:00.000000+00:00

MEH-3645. Data only: deletes every row of the neighbour home-food listings
(home_products, home_product_ratings, home_product_whatsapp_clicks). The
router behind them has been unmounted since MEH-1406, so nothing writes these
rows; what is left is phone, street, zip and neighbourhood of a feature that is
off — personal data the privacy page does not describe (MEH-3644). Sapir,
21/11: «אז תמחק את השאריות שלן».

No table, column or constraint changes; the code that reads these tables stays.
Children first, so the result does not depend on ON DELETE CASCADE.

Downgrade does nothing: deleted rows cannot be restored. The listing images in
Cloudinary become orphans; backend/scripts/cleanup_cloudinary_orphans.py is
dry-run by default and unscheduled, so they leave Cloudinary only when it runs
with --apply against production (a production action, release thread).

# DO NOT turn this into a DROP TABLE — the models and ~20 call sites still
#        reference these tables; removing the feature is its own change.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d6f8b0c2e4a7"
down_revision: Union[str, None] = "c5e7a9b1d3f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Children before the parent.
TABLES = ("home_product_ratings", "home_product_whatsapp_clicks", "home_products")


def upgrade() -> None:
    for table in TABLES:
        # WHERE true: every row, on purpose (the whole table is the leftover).
        op.execute(sa.text(f"DELETE FROM {table} WHERE true"))


def downgrade() -> None:
    # Deleted data cannot come back; the schema was never changed.
    pass
