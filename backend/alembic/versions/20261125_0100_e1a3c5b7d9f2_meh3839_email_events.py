"""meh3839_email_events

Revision ID: e1a3c5b7d9f2
Revises: b7d9f1a3c5e8
Create Date: 2026-11-25 01:00:00.000000+00:00

MEH-3839. Additive only (ADR-007 expand): one new table, email_events — a
delivery event Resend reported for an email we sent (delivered, bounced,
complained, suppressed, failed, clicked), written only by the signed webhook
(app/routers/resend_webhook.py). No existing table, column or constraint is
touched. EXPECTED_TABLES +1.

No full address is stored: the recipient's domain, and the user id when the
address belongs to an account (SET NULL when the account is deleted).

Downgrade drops the table and the events in it; nothing else reads it.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e1a3c5b7d9f2"
down_revision: Union[str, None] = "b7d9f1a3c5e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("svix_id", sa.String(length=64), nullable=False),
        sa.Column("event_type", sa.String(length=40), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("recipient_domain", sa.String(length=255), nullable=True),
        sa.Column("resend_email_id", sa.String(length=64), nullable=True),
        sa.Column("detail", sa.String(length=80), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("svix_id", name="email_events_svix_id_key"),
    )
    op.create_index(
        "ix_email_events_kind_created_at", "email_events", ["kind", "created_at"]
    )
    op.create_index("ix_email_events_user_id", "email_events", ["user_id"])
    op.create_index("ix_email_events_created_at", "email_events", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_email_events_created_at", table_name="email_events")
    op.drop_index("ix_email_events_user_id", table_name="email_events")
    op.drop_index("ix_email_events_kind_created_at", table_name="email_events")
    op.drop_table("email_events")
