"""meh3055_product_order_and_groups

Revision ID: b7d4e2a9c615
Revises: e3a5c1d7f904
Create Date: 2026-11-13 19:00:00.000000+00:00

MEH-3055 (סידור מוצרים וקבוצות מוצרים): three nullable columns, no table.

  - `products.position`   INTEGER, nullable — the owner's order (0-based).
                          NULL = never ordered; the page then falls back to
                          "photos first" (MEH-3021).
  - `products.group_id`   VARCHAR(36), nullable — the id of one entry in
                          `producers.product_groups`. NULL = no group. No FK:
                          the groups live in a JSONB list on the business, so
                          the router clears this column when a group is
                          removed (routers/product_organize.py).
  - `producers.product_groups` JSONB, nullable — ordered list of
                          {"id": str, "name": str}, ≤ 20 entries, validated at
                          the API boundary (schemas/product_organize.py).

Why JSONB and not a `product_groups` table: a business holds at most 20 short
names, always read together with the business, and a table would add a row to
the CI table-count gate (EXPECTED_TABLES in pr-checks.yml, a human-only edit).

Expand-only per ADR-007 — additive nullable columns, no server_default, no
backfill, no behaviour change at the schema layer. EXPECTED_TABLES unchanged.

# DO NOT tighten any of these to NOT NULL or add a server_default without a
#        separate Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7d4e2a9c615"
down_revision: Union[str, None] = "e3a5c1d7f904"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("position", sa.Integer(), nullable=True))
    op.add_column("products", sa.Column("group_id", sa.String(length=36), nullable=True))
    op.add_column(
        "producers",
        sa.Column("product_groups", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "product_groups")
    op.drop_column("products", "group_id")
    op.drop_column("products", "position")
