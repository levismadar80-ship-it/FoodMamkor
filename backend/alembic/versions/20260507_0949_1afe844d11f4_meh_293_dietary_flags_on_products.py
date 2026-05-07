"""MEH-293 — move dietary flags (gluten_free / vegan / lactose_free) from producers to products

Adds three boolean columns on `products` so dietary labels can be claimed per
listing rather than per business. Same anti-pattern fix as MEH-291: a single
business often sells both vegan and non-vegan items; storing the flag on the
producer forced shoppers to filter on the worst-case denominator and surfaced
producers who only "sometimes" make a vegan SKU.

7-day overlap (matches MEH-291 / MEH-295): the producer columns
`producers.gluten_free` / `producers.vegan` / `producers.lactose_free` remain
in this migration. Reads aggregate `any(p.is_X for p in producer.products)`
and the public filter (`/producers?vegan=true`) switches to an EXISTS subquery
over products. Backfill copies `producers.X -> products.is_X` via JOIN so the
filter returns the same producer set on day 1 of the overlap (modulo the edge
case below).

Filter behavior change inherent to the move: a producer who had vegan=TRUE
but zero products will disappear from `?vegan=true` after the upgrade. This
is intentional — without products there is nothing for shoppers to filter on,
which was exactly the imprecision MEH-293 set out to fix.

Reversibility: downgrade drops the partial index + 3 columns. Producer
columns are untouched on the way down, so any flag toggled through the legacy
admin form during the overlap round-trips. New product-level flag writes are
lost on downgrade — acceptable because downgrade is only used to revert a
failed staging deploy before producers begin using the new product form.

Revision ID: 1afe844d11f4
Revises: e4790e538aa2
Create Date: 2026-05-07 09:49:14+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '1afe844d11f4'
down_revision: Union[str, None] = 'e4790e538aa2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'products',
        sa.Column(
            'is_gluten_free', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )
    op.add_column(
        'products',
        sa.Column(
            'is_vegan', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )
    op.add_column(
        'products',
        sa.Column(
            'is_lactose_free', sa.Boolean(),
            nullable=False, server_default=sa.false(),
        ),
    )

    # Backfill: copy producer-level dietary flag onto every product belonging
    # to that producer, so the new EXISTS-based filter returns the same set
    # of producers as the legacy `Producer.vegan == TRUE` filter on day 1.
    # Skip producers with no flags set — keeps the UPDATE row count honest.
    op.execute("""
        UPDATE products
        SET is_gluten_free  = producers.gluten_free,
            is_vegan        = producers.vegan,
            is_lactose_free = producers.lactose_free
        FROM producers
        WHERE products.producer_id = producers.id
          AND (
            producers.gluten_free = TRUE
            OR producers.vegan = TRUE
            OR producers.lactose_free = TRUE
          )
    """)

    # Partial index — only rows with at least one dietary flag set are
    # indexed. Mirrors the access pattern: filter queries always look for
    # TRUE values via EXISTS subquery on `producer_id`.
    op.create_index(
        'idx_products_dietary',
        'products',
        ['producer_id'],
        postgresql_where=sa.text('is_gluten_free OR is_vegan OR is_lactose_free'),
    )


def downgrade() -> None:
    op.drop_index('idx_products_dietary', table_name='products')
    op.drop_column('products', 'is_lactose_free')
    op.drop_column('products', 'is_vegan')
    op.drop_column('products', 'is_gluten_free')
