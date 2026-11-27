"""product_order_repeats

Revision ID: a4c8e2f6b0d1
Revises: c5e7a9b1d3f4
Create Date: 2026-11-27 13:00:00.000000+00:00

MEH-3933 (Fischgrund bakery, 27/11): a buyer can ask for the same order
every week. An hourly job makes each week's order from the repeat.

- product_order_repeats: new table (see app/models/product_order_repeats.py).
- product_orders.repeat_id: UUID NULL, FK → product_order_repeats.id ON
  DELETE SET NULL.

Expand-only (ADR-007): a new table, and one nullable column with no default,
so every existing order reads NULL = a one-off; Postgres adds it without
rewriting the table. The previous container never reads either.

NOTE for the merge train: MEH-3932 (PR #5424, revision e3b7d1f5a9c2) also
revises c5e7a9b1d3f4. Whichever of the two merges second moves its
down_revision onto the other, so there is one head.

downgrade() drops the column, then the table: recurring orders stop, every
order made from one stays as an ordinary order.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4c8e2f6b0d1"
down_revision: Union[str, None] = "c5e7a9b1d3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_order_repeats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "producer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("customer_name", sa.String(120), nullable=False),
        sa.Column("customer_phone", sa.String(20), nullable=False),
        sa.Column("fulfilment", sa.String(10), nullable=False),
        sa.Column("delivery_city", sa.String(100), nullable=True),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("items", postgresql.JSONB(), nullable=False),
        sa.Column("last_slot_start", sa.DateTime(), nullable=False),
        sa.Column(
            "skipped_in_row",
            sa.SmallInteger(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "state", sa.String(10), nullable=False, server_default=sa.text("'active'")
        ),
        sa.Column("stopped_by", sa.String(10), nullable=True),
        sa.Column("stopped_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "state IN ('active', 'stopped')", name="product_order_repeats_state_check"
        ),
        sa.CheckConstraint(
            "stopped_by IS NULL OR stopped_by IN ('customer', 'business', 'system')",
            name="product_order_repeats_stopped_by_check",
        ),
        sa.CheckConstraint(
            "fulfilment IN ('pickup', 'delivery')",
            name="product_order_repeats_fulfilment_check",
        ),
        sa.CheckConstraint(
            "skipped_in_row >= 0", name="product_order_repeats_skipped_check"
        ),
    )
    op.create_index(
        "ix_product_order_repeats_producer_state",
        "product_order_repeats",
        ["producer_id", "state"],
    )
    op.create_index(
        "ix_product_order_repeats_phone", "product_order_repeats", ["customer_phone"]
    )
    op.add_column(
        "product_orders",
        sa.Column(
            "repeat_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(
                "product_order_repeats.id",
                ondelete="SET NULL",
                name="product_orders_repeat_id_fkey",
            ),
            nullable=True,
        ),
    )
    # A repeat's orders are read by repeat_id (last week's result, SET NULL).
    op.create_index("ix_product_orders_repeat_id", "product_orders", ["repeat_id"])


def downgrade() -> None:
    op.drop_index("ix_product_orders_repeat_id", table_name="product_orders")
    op.drop_column("product_orders", "repeat_id")
    op.drop_index("ix_product_order_repeats_phone", table_name="product_order_repeats")
    op.drop_index(
        "ix_product_order_repeats_producer_state", table_name="product_order_repeats"
    )
    op.drop_table("product_order_repeats")
