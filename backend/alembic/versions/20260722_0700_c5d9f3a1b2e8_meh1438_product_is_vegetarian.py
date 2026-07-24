"""MEH-1438 — add is_vegetarian dietary flag on products

Fourth per-product dietary axis, mirroring MEH-293's is_gluten_free /
is_vegan / is_lactose_free. Industry-standard separation (Ocado, TripAdvisor,
HappyCow, Yelp all treat vegetarian as a distinct axis from vegan).

A vegan product is vegetarian by definition, so the public ?vegetarian filter
matches `is_vegetarian OR is_vegan` (producer_listing.py) and the producer-card
aggregation `has_vegetarian_products` counts is_vegan too — the owner marks a
product vegan without also having to mark it vegetarian. Backfill therefore
seeds is_vegetarian = TRUE for every already-vegan product so existing vegan
catalogs surface under the new filter on day 1.

The idx_products_dietary partial index is rebuilt to add is_vegetarian to its
predicate, keeping the index aligned with the EXISTS-subquery access pattern.

Reversibility: downgrade rebuilds the pre-1438 index (without is_vegetarian)
and drops the column. is_vegan (the backfill source) is untouched on the way
down, so a re-upgrade re-seeds identically. Product-level is_vegetarian writes
made through the owner form are lost on downgrade — acceptable, downgrade is
only for reverting a failed staging deploy before the new chip ships.

Revision ID: c5d9f3a1b2e8
Revises: e4a1c7b9d2f5
Create Date: 2026-07-22 07:00:00+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'c5d9f3a1b2e8'
down_revision: Union[str, None] = 'e4a1c7b9d2f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column(
            'is_vegetarian', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )

    # Backfill: every vegan product is vegetarian by definition, so seed
    # is_vegetarian = TRUE wherever is_vegan is already TRUE. This makes the
    # new ?vegetarian filter return the existing vegan catalog on day 1
    # (the `is_vegetarian OR is_vegan` filter would match them anyway; the
    # backfill also keeps the aggregation/index honest for vegan-only rows).
    op.execute("""
        UPDATE products
        SET is_vegetarian = TRUE
        WHERE is_vegan = TRUE
    """)

    # Rebuild the partial index to include is_vegetarian in its predicate.
    # Drop + recreate (Postgres can't ALTER a partial-index WHERE clause).
    op.drop_index('idx_products_dietary', table_name='products')
    op.create_index(
        'idx_products_dietary',
        'products',
        ['producer_id'],
        postgresql_where=sa.text(
            'is_gluten_free OR is_vegan OR is_vegetarian OR is_lactose_free'
        ),
    )


def downgrade() -> None:
    # Drop the is_vegetarian-aware index first (it references the column),
    # then the column, then restore the original MEH-293 predicate.
    op.drop_index('idx_products_dietary', table_name='products')
    op.drop_column('products', 'is_vegetarian')
    op.create_index(
        'idx_products_dietary',
        'products',
        ['producer_id'],
        postgresql_where=sa.text(
            'is_gluten_free OR is_vegan OR is_lactose_free'
        ),
    )
