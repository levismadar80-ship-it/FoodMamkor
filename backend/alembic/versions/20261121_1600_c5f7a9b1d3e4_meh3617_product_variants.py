"""meh3617_product_variants

Revision ID: c5f7a9b1d3e4
Revises: b4e6a8c0d2f3
Create Date: 2026-11-21 16:00:00.000000+00:00

MEH-3617. Expand-only (ADR-007). Approved by Sapir 21/11 (card MEH-3617).

- New table product_variants: a product's sizes or flavours, each with an
  optional own price (NULL = the product's price), a stock flag and an order.
  CASCADE with the product.
- product_order_items.variant_id (NULLable FK, SET NULL: deleting a variant
  never rewrites an order) and variant_name (the name as ordered).

No backfill, no row rewritten. A product with no variant rows reads and
orders exactly as before. Downgrade drops the two columns and the table (any
variants and the variant names on past order lines are lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c5f7a9b1d3e4"
down_revision: Union[str, None] = "b4e6a8c0d2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("product_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("price_agorot", sa.Integer(), nullable=True),
        sa.Column(
            "in_stock", sa.Boolean(), server_default=sa.text("true"), nullable=False
        ),
        sa.Column(
            "position", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.CheckConstraint(
            "price_agorot IS NULL OR price_agorot >= 0",
            name="product_variants_price_check",
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_product_variants_product_id", "product_variants", ["product_id"]
    )
    op.add_column(
        "product_order_items",
        sa.Column("variant_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "product_order_items",
        sa.Column("variant_name", sa.String(length=40), nullable=True),
    )
    op.create_foreign_key(
        "product_order_items_variant_id_fkey",
        "product_order_items",
        "product_variants",
        ["variant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    # Deleting a variant (or its product, by CASCADE) SETs NULL here; without
    # an index that is a scan of every order line.
    op.create_index(
        "ix_product_order_items_variant_id", "product_order_items", ["variant_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_product_order_items_variant_id", table_name="product_order_items")
    op.drop_constraint(
        "product_order_items_variant_id_fkey", "product_order_items", type_="foreignkey"
    )
    op.drop_column("product_order_items", "variant_name")
    op.drop_column("product_order_items", "variant_id")
    op.drop_index("ix_product_variants_product_id", table_name="product_variants")
    op.drop_table("product_variants")
