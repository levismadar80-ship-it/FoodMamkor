"""MEH-1934 — add is_no_added_sugar + is_low_carb dietary flags on products

Fifth and sixth per-product dietary axes, mirroring MEH-293's is_gluten_free /
is_vegan / is_lactose_free and MEH-1438's is_vegetarian. Target audiences are
people managing blood sugar and people eating low-carb/ketogenic; the product
decision (MEH-1934) is to serve them by naming the NEED ("ללא סוכר מוסף" / "דל
פחמימות"), never a medical claim or a trend label.

NO BACKFILL, deliberately — and this is the one place this migration departs
from the MEH-1438 template it otherwise copies. MEH-1438 could seed
is_vegetarian from is_vegan because "a vegan product is vegetarian" is true by
definition. Nothing in the existing catalog implies "no added sugar" or "low
carb": not is_vegan, not is_gluten_free, not any combination of them. Seeding
from any of them would be inventing a nutrition claim on the business's behalf,
on a surface whose whole contract is that the marking came from the business
itself. Both columns therefore start FALSE for every existing row, and the
owner form (chunk 3) is the only writer.

The idx_products_dietary partial index is rebuilt to add both new flags to its
predicate, keeping the index aligned with the EXISTS-subquery access pattern
that the ?no_added_sugar / ?low_carb filters use.

Reversibility: downgrade drops the two-flag-aware index, drops both columns,
then rebuilds the pre-1934 predicate (the MEH-1438 four-flag form). No data
outside these two columns is touched on the way down, so a re-upgrade lands on
the same schema. Product-level markings made through the owner form are lost on
downgrade — acceptable, downgrade is only for reverting a failed staging deploy
before the new chips ship.

Revision ID: a2f7d4c8e153
Revises: e4b1c72d9a35
Create Date: 2026-08-07 12:00:00+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a2f7d4c8e153'
down_revision: Union[str, None] = 'e4b1c72d9a35'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column(
            'is_no_added_sugar', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )
    op.add_column(
        'products',
        sa.Column(
            'is_low_carb', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )

    # Rebuild the partial index to include both new flags in its predicate.
    # Drop + recreate (Postgres can't ALTER a partial-index WHERE clause).
    # Without this, a product marked ONLY low-carb falls outside the index
    # predicate and the ?low_carb EXISTS subquery seq-scans products.
    op.drop_index('idx_products_dietary', table_name='products')
    op.create_index(
        'idx_products_dietary',
        'products',
        ['producer_id'],
        postgresql_where=sa.text(
            'is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free '
            'OR is_no_added_sugar OR is_low_carb'
        ),
    )


def downgrade() -> None:
    # Drop the new-flag-aware index first (its predicate references both
    # columns), then the columns, then restore the MEH-1438 predicate.
    op.drop_index('idx_products_dietary', table_name='products')
    op.drop_column('products', 'is_low_carb')
    op.drop_column('products', 'is_no_added_sugar')
    op.create_index(
        'idx_products_dietary',
        'products',
        ['producer_id'],
        postgresql_where=sa.text(
            'is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free'
        ),
    )
