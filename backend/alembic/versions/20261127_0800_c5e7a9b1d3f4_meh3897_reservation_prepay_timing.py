"""meh3897_reservation_prepay_timing

Revision ID: c5e7a9b1d3f4
Revises: b8ee10dc69a9
Create Date: 2026-11-27 08:00:00.000000+00:00

MEH-3897, EXPAND only: two nullable columns, nothing existing is touched
(Sapir's OK on the decision card, 27/11 07:36Z).

A reservation keeps how it is paid at the moment it is made, the way an order
keeps its own payment terms (Shopify Order.paymentTerms) instead of reading the
shop's current settings. Without it, a refund email followed whatever the
business set at CANCEL time.

  - `rescue_orders.prepay_timing`      VARCHAR(10) NULL
  - `group_buy_commits.prepay_timing`  VARCHAR(10) NULL
    'advance' | 'deposit' (through the business's own link) | 'counter'
    (at pickup). NULL = made before this revision; no backfill, the reader
    falls back to the business's settings for those rows.
"""

import sqlalchemy as sa
from alembic import op

revision = "c5e7a9b1d3f4"
down_revision = "b8ee10dc69a9"
branch_labels = None
depends_on = None

_CHECK = "prepay_timing IS NULL OR prepay_timing IN ('advance', 'deposit', 'counter')"


def upgrade() -> None:
    op.add_column(
        "rescue_orders", sa.Column("prepay_timing", sa.String(10), nullable=True)
    )
    op.create_check_constraint(
        "rescue_orders_prepay_timing_check", "rescue_orders", _CHECK
    )
    op.add_column(
        "group_buy_commits", sa.Column("prepay_timing", sa.String(10), nullable=True)
    )
    op.create_check_constraint(
        "group_buy_commits_prepay_timing_check", "group_buy_commits", _CHECK
    )


def downgrade() -> None:
    op.drop_constraint("group_buy_commits_prepay_timing_check", "group_buy_commits")
    op.drop_column("group_buy_commits", "prepay_timing")
    op.drop_constraint("rescue_orders_prepay_timing_check", "rescue_orders")
    op.drop_column("rescue_orders", "prepay_timing")
