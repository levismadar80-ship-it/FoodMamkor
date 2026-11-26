"""meh3897_rescue_paid_at

Revision ID: b4d6f8a0c2e3
Revises: c6e8a0b2d4f5
Create Date: 2026-11-26 16:00:00.000000+00:00

MEH-3897, EXPAND only: one nullable column, nothing existing is touched.

A business that asks to be paid ahead (MEH-3895) gets the money in its own
Bit / PayBox; Mehamakor cannot see it. Like a manual-payment order on Shopify
or WooCommerce, the reservation stays unpaid until the business marks it.

  - `rescue_orders.paid_at`  TIMESTAMP NULL — when the business marked it
    paid; NULL = not marked (every existing row). Naive UTC, like
    `handed_at` beside it.
"""

import sqlalchemy as sa
from alembic import op

revision = "b4d6f8a0c2e3"
down_revision = "c6e8a0b2d4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rescue_orders", sa.Column("paid_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("rescue_orders", "paid_at")
