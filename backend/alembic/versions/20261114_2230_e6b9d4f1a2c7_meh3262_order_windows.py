"""meh3262_order_windows

Revision ID: e6b9d4f1a2c7
Revises: d5a7c3e9f1b4
Create Date: 2026-11-14 22:30:00.000000+00:00

MEH-3262 (stage 2a of MEH-3216, on-site ordering). Additive only:

  - new table producer_order_windows: the weekly windows in which a business
    HANDS orders over (weekday 0 = Sunday, start, end, pickup or delivery).
    A different fact from producers.order_window, which is when the owner
    answers orders and carries no pickup/delivery split; the slot service
    still honours her closed dates (special_hours) and vacation.
  - two NOT NULL defaulted columns on producer_order_settings:
      slot_minutes     INTEGER default 60 (CHECK 30 / 60 / 120)
      lead_time_hours  INTEGER default 24 (CHECK 0..168)

producer_order_settings is itself new in d5a7c3e9f1b4 and has no rows on any
environment, so the two columns fill nothing. Nothing reads any of this until
PRODUCT_ORDERS_ENABLED is set.

Expand-only per ADR-007. EXPECTED_TABLES +1.

# DO NOT edit the CHECK literals here without the matching constants in
#        app/models/product_orders.py — tests/test_meh3262_order_windows.py
#        compares the two. Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e6b9d4f1a2c7"
down_revision: Union[str, None] = "d5a7c3e9f1b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_order_settings",
        sa.Column(
            "slot_minutes", sa.Integer(), nullable=False, server_default=sa.text("60")
        ),
    )
    op.add_column(
        "producer_order_settings",
        sa.Column(
            "lead_time_hours",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("24"),
        ),
    )
    op.create_check_constraint(
        "producer_order_settings_slot_minutes_check",
        "producer_order_settings",
        "slot_minutes IN (30, 60, 120)",
    )
    op.create_check_constraint(
        "producer_order_settings_lead_time_check",
        "producer_order_settings",
        "lead_time_hours >= 0 AND lead_time_hours <= 168",
    )

    op.create_table(
        "producer_order_windows",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "producer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("weekday", sa.SmallInteger(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=False),
        sa.Column("fulfilment", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "weekday >= 0 AND weekday <= 6",
            name="producer_order_windows_weekday_check",
        ),
        sa.CheckConstraint(
            "end_time > start_time", name="producer_order_windows_time_check"
        ),
        sa.CheckConstraint(
            "fulfilment IN ('pickup', 'delivery')",
            name="producer_order_windows_fulfilment_check",
        ),
    )
    op.create_index(
        "ix_producer_order_windows_producer_id",
        "producer_order_windows",
        ["producer_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_producer_order_windows_producer_id", table_name="producer_order_windows"
    )
    op.drop_table("producer_order_windows")
    op.drop_constraint(
        "producer_order_settings_lead_time_check",
        "producer_order_settings",
        type_="check",
    )
    op.drop_constraint(
        "producer_order_settings_slot_minutes_check",
        "producer_order_settings",
        type_="check",
    )
    op.drop_column("producer_order_settings", "lead_time_hours")
    op.drop_column("producer_order_settings", "slot_minutes")
