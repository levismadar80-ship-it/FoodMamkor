"""meh3312_registration_reminder_stamp

Revision ID: b8e4f2a6c9d1
Revises: f6c2a8d4e1b7
Create Date: 2026-11-15 09:30:00.000000+00:00

MEH-3312 (a reminder email the evening before an event or workshop): adds
`registrations.reminder_sent_at` TIMESTAMP NULL (naive UTC, like
`created_at` / `cancelled_at` on the same table). It is the idempotency
stamp: NULL = no reminder yet. The daily job sends only to rows with NULL and
stamps them, so a second run that day sends nothing.

Expand-only per ADR-007 — one additive nullable column, no backfill.
EXPECTED_TABLES unchanged (a column, not a table).

Head note (15/11): MEH-3311 (a7d3e9c1b5f2) also revises f6c2a8d4e1b7. Whichever
lands second is re-pointed onto the other so staging keeps a single head.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b8e4f2a6c9d1"
down_revision: Union[str, None] = "f6c2a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registrations", sa.Column("reminder_sent_at", sa.DateTime(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("registrations", "reminder_sent_at")
