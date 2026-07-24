"""meh1338_alert_log

Revision ID: d4b8f1c7e903
Revises: b7e2a4c9d1f6
Create Date: 2026-07-18 19:00:00.000000+00:00

MEH-1338 (frequency cap): creates `alert_log` — an append-only ledger of
delivered favorite-alerts, per channel. Backing store for the "at most one
message per (user, producer, channel) in a rolling 24h window" cap in
`fire_alerts`.

Composite index `ix_alert_log_cap_lookup` on
(user_id, producer_id, channel, sent_at) serves the cap EXISTS lookup
exactly. `alert_type` is recorded but is NOT part of the cap key — kept for
a future digest / analytics.

Rows CASCADE-delete with their user/producer. Append-only: nothing prunes
this table yet — retention/purge is a separate follow-up.

Expand-only per ADR-007 — new table, no change to existing schema.
EXPECTED_TABLES 36 -> 37 in .github/workflows/pr-checks.yml.

# DO NOT add a purge job or tighten the cap key without a separate ticket —
#        alert_type is deliberately outside the cap key.
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d4b8f1c7e903"
# MEH-1338: chains onto the current head b7e2a4c9d1f6
# (merge of MEH-1291 + MEH-1297 heads).
down_revision: Union[str, None] = "b7e2a4c9d1f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("channel", sa.String(length=16), nullable=False),
        sa.Column("alert_type", sa.String(length=32), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_alert_log_cap_lookup",
        "alert_log",
        ["user_id", "producer_id", "channel", "sent_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_alert_log_cap_lookup", table_name="alert_log")
    op.drop_table("alert_log")
