"""aud009_add_outbound_message_status

Revision ID: c1d2e3f4a5b6
Revises: f1c7b9a3e264
Create Date: 2026-06-07 00:00:00.000000+00:00

AUD-009/010 (MEH-214 / MEH-771): durable record of OUTBOUND WhatsApp
sends so a Graph "accepted" (queued) can be reconciled against the later
delivery webhook instead of being assumed delivered. Mirrors the MEH-509
`inbound_messages` style; `meta_message_id` (the wamid) is UNIQUE for
webhook idempotency. `status` is app-enforced (no DB enum/CHECK),
by-convention 'accepted' | 'delivered' | 'failed' | 'window_expired',
consistent with `availability_state` / `verification_doc_type`.

Expand-only per ADR-007 — new table, no backfill, no behavior change.

DO NOT add a status CHECK constraint or NOT NULL on meta_message_id
here — the wamid is absent on transport-level failures. Alembic is the
sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "f1c7b9a3e264"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "outbound_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("to_phone", sa.String(length=20), nullable=False),
        sa.Column("kind", sa.String(length=64), nullable=False),
        sa.Column("meta_message_id", sa.String(length=100), nullable=True),
        sa.Column("status", sa.String(length=20), server_default=sa.text("'accepted'"), nullable=False),
        sa.Column("error_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("meta_message_id", name="uq_outbound_messages_meta_id"),
    )
    op.create_index("ix_outbound_messages_to_phone", "outbound_messages", ["to_phone"])
    op.create_index("ix_outbound_messages_status", "outbound_messages", ["status"])


def downgrade() -> None:
    op.drop_index("ix_outbound_messages_status", table_name="outbound_messages")
    op.drop_index("ix_outbound_messages_to_phone", table_name="outbound_messages")
    op.drop_table("outbound_messages")
