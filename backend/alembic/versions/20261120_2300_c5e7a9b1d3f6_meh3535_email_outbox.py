"""meh3535_email_outbox

Revision ID: c5e7a9b1d3f6
Revises: a3d5f7b9c1e2
Create Date: 2026-11-20 23:00:00.000000+00:00

MEH-3535. Additive only (ADR-007 expand): one new table, email_outbox — an
email the site owes, written in the same transaction as its cause and sent by
the dispatcher with retries (app/services/email_outbox.py). No existing table,
column or constraint is touched. EXPECTED_TABLES +1.

Downgrade drops the table: any row still pending at that moment is never sent.

# DO NOT edit the CHECK literals here without EMAIL_OUTBOX_OUTCOMES in
#        app/models/email_outbox.py — tests/test_meh3535_email_outbox.py
#        compares the two.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c5e7a9b1d3f6"
down_revision: Union[str, None] = "a3d5f7b9c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OUTCOMES = ("pending", "sent", "failed", "skipped")


def _check_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "email_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("to_email", sa.String(length=320), nullable=True),
        sa.Column("subject", sa.Text(), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("html", sa.Text(), nullable=True),
        sa.Column("reply_to", sa.String(length=320), nullable=True),
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
            _check_in("outcome", OUTCOMES), name="email_outbox_outcome_check"
        ),
    )
    op.create_index(
        "ix_email_outbox_due",
        "email_outbox",
        ["send_after"],
        postgresql_where=sa.text("outcome = 'pending'"),
    )
    op.create_index("ix_email_outbox_created_at", "email_outbox", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_email_outbox_created_at", table_name="email_outbox")
    op.drop_index("ix_email_outbox_due", table_name="email_outbox")
    op.drop_table("email_outbox")
