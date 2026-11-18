"""meh3296_order_notifications

Revision ID: a8d2c6f4e1b7
Revises: f7c1a5e9b3d2
Create Date: 2026-11-15 09:00:00.000000+00:00

MEH-3296 (stage 3 of MEH-3216, on-site ordering). Additive only: one new
table, product_order_notifications — the messages an order owes (who, by
which channel, when), written in the same transaction as the status move and
sent by the scheduler with retries. No phone, address or link is stored.

Nothing writes to it until an order exists, and no order exists until
PRODUCT_ORDERS_ENABLED is set. Expand-only per ADR-007. EXPECTED_TABLES +1.

# DO NOT edit the CHECK literals here without the matching tuples in
#        app/models/product_orders.py — tests/test_meh3296_order_notifications.py
#        compares the two.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a8d2c6f4e1b7"
down_revision: Union[str, None] = "f7c1a5e9b3d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KINDS = (
    "new_order",
    "business_reminder",
    "confirmed",
    "change_proposed",
    "closed",
    "buyer_cancelled",
    "day_before",
)
CHANNELS = ("whatsapp", "email")
STATUSES = ("pending", "sent", "failed", "skipped")


def _check_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "product_order_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "order_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("product_orders.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=10), nullable=False),
        sa.Column(
            "outcome",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column("send_after", sa.DateTime(), nullable=False),
        sa.Column(
            "attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("last_error", sa.String(length=20), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            _check_in("kind", KINDS), name="product_order_notifications_kind_check"
        ),
        sa.CheckConstraint(
            _check_in("channel", CHANNELS),
            name="product_order_notifications_channel_check",
        ),
        sa.CheckConstraint(
            _check_in("outcome", STATUSES),
            name="product_order_notifications_outcome_check",
        ),
    )
    op.create_index(
        "uq_product_order_notifications_once",
        "product_order_notifications",
        ["order_id", "kind", "channel"],
        unique=True,
    )
    op.create_index(
        "ix_product_order_notifications_due",
        "product_order_notifications",
        ["send_after"],
        postgresql_where=sa.text("outcome = 'pending'"),
    )


def downgrade() -> None:
    op.drop_index(
        "ix_product_order_notifications_due",
        table_name="product_order_notifications",
    )
    op.drop_index(
        "uq_product_order_notifications_once",
        table_name="product_order_notifications",
    )
    op.drop_table("product_order_notifications")
