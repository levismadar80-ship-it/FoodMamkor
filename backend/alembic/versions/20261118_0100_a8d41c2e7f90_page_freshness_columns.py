"""page_freshness_columns

Revision ID: a8d41c2e7f90
Revises: f6c2a8d4e1b7
Create Date: 2026-11-18 01:00:00.000000+00:00

Page freshness: a monthly email asks a business owner whether her page is
still correct. Two nullable columns on `producers`:

- `last_confirmed_at`: when the owner pressed «כן, הכול נכון».
- `freshness_email_sent_at`: idempotency stamp for the monthly send.

Expand-only per ADR-007: nullable, no default, no backfill; nothing reads them
before this revision. downgrade() drops both.
"""

import sqlalchemy as sa
from alembic import op

revision = "a8d41c2e7f90"
down_revision = "f6c2a8d4e1b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("freshness_email_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "freshness_email_sent_at")
    op.drop_column("producers", "last_confirmed_at")
