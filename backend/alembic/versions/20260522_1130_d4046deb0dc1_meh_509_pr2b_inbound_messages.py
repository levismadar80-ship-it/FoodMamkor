"""meh_509_pr2b_inbound_messages

Revision ID: d4046deb0dc1
Revises: b504e4be4225
Create Date: 2026-05-22 11:30:00.000000+00:00

MEH-509 PR2b: adds the inbound_messages table that the after-hours
watchdog scans every 5 minutes for rows with bot_replied=False AND
human_replied=False AND received_at >= now() - INTERVAL 30 minutes,
then dispatches vacation_mode_response_he (if vacation mode is active
per the PR2a AdminSetting keys) or after_hours_response_he (if outside
the Asia/Jerusalem business hours).

Rows are populated by the future PR2c webhook receiver. Until PR2c
ships, the table stays empty and the watchdog is gated off
(WATCHDOG_ENABLED=False in config + Railway).

meta_message_id is UNIQUE for webhook idempotency. Three btree indexes
(from_phone, received_at, bot_replied) size the watchdog WHERE clause.
bot_template_sent is audit-trail only: bot_replied=True AND
bot_template_sent IS NULL means we tried but the send failed (one
shot, no retry storm).

DO NOT add backfill SQL here. Alembic is the sole schema authority
since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d4046deb0dc1"
down_revision: Union[str, None] = "b504e4be4225"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inbound_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("from_phone", sa.String(length=20), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("received_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("meta_message_id", sa.String(length=100), nullable=True),
        sa.Column("bot_replied", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("bot_replied_at", sa.DateTime(), nullable=True),
        sa.Column("bot_template_sent", sa.String(length=50), nullable=True),
        sa.Column("human_replied", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.UniqueConstraint("meta_message_id", name="uq_inbound_messages_meta_id"),
    )
    op.create_index("ix_inbound_messages_from_phone", "inbound_messages", ["from_phone"])
    op.create_index("ix_inbound_messages_received_at", "inbound_messages", ["received_at"])
    op.create_index("ix_inbound_messages_bot_replied", "inbound_messages", ["bot_replied"])


def downgrade() -> None:
    op.drop_index("ix_inbound_messages_bot_replied", table_name="inbound_messages")
    op.drop_index("ix_inbound_messages_received_at", table_name="inbound_messages")
    op.drop_index("ix_inbound_messages_from_phone", table_name="inbound_messages")
    op.drop_table("inbound_messages")
