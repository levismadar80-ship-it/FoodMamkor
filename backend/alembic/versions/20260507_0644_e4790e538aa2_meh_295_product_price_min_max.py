"""MEH-295 — add products.price_min + products.price_max (additive)

Splits the free-text `products.price_range String(50)` field into two
numeric columns so the producer dashboard can validate input and the
public producer page can render a normalized price range.

Both new columns are NUMERIC(10,2) NULL — see decision matrix:

  - Pydantic ProductCreate enforces price_min required (ge=1, le=10000)
    and price_max optional (ge=1, le=10000, must be >= price_min).
  - DB stays nullable so existing rows with `price_range` populated do
    not block the upgrade. The /producer/[id] display chain falls back
    to `price_range` when both new columns are NULL (see
    ProducerSections.jsx + settings/page.jsx product list).
  - `price_range` is preserved in this migration. Drop is tracked as a
    follow-up after a soak period in which producers re-edit existing
    products (no automated backfill — free-text values like "₪45/ק״ג"
    cannot be parsed unambiguously).

Reversibility: downgrade drops both columns; `price_range` is untouched
on the way down so any data written through the legacy path round-trips
cleanly. New rows that wrote only price_min/price_max lose pricing on
downgrade — this is acceptable because the downgrade is only used to
revert a failed staging deploy before producers begin using the form.

Revision ID: e4790e538aa2
Revises: 261e8d6ab23a
Create Date: 2026-05-07 06:44:17+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e4790e538aa2'
down_revision: Union[str, None] = '261e8d6ab23a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column('price_min', sa.Numeric(precision=10, scale=2), nullable=True),
    )
    op.add_column(
        'products',
        sa.Column('price_max', sa.Numeric(precision=10, scale=2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('products', 'price_max')
    op.drop_column('products', 'price_min')
