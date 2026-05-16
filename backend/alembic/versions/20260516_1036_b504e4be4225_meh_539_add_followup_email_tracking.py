"""meh_539_add_followup_email_tracking

Revision ID: b504e4be4225
Revises: e8a3c4b5d791
Create Date: 2026-05-16 10:36:26.950860+00:00

MEH-539: adds 4 nullable TIMESTAMP WITH TIME ZONE columns on `producers`
to track when each Phase 2 onboarding follow-up email was sent
(Email 2 / 3 / 4 / 5 — Day 2, 5, 10, 30 respectively), plus a btree
index on `producers.created_at` to support the daily scheduler query
`WHERE created_at BETWEEN today-N AND today-N+1` (APScheduler per
Phase 2A discovery).

All four columns are `nullable=True` with no server_default — `NULL`
encodes "not yet sent". A non-null timestamp is the durable "this
producer received Email N" record (fail-open Resend may still have
silently dropped the message, accepted per Phase 2A.5 risk note).

# DO NOT add backfill SQL here — every existing producer must remain
#        NULL on these columns so the scheduler doesn't retro-skip them.
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b504e4be4225'
# MEH-539: chain head was MEH-530's e8a3c4b5d791 at branch-cut time
# (verified against backend/alembic/versions/ + the CI EXPECTED_REV in
# the GitHub Actions workflow). rtl-ok
down_revision: Union[str, None] = 'e8a3c4b5d791'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('email_followup_2_sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('email_followup_3_sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('email_followup_4_sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('email_followup_5_sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        'idx_producers_created_at',
        'producers',
        ['created_at'],
    )


def downgrade() -> None:
    op.drop_index('idx_producers_created_at', table_name='producers')
    op.drop_column('producers', 'email_followup_5_sent_at')
    op.drop_column('producers', 'email_followup_4_sent_at')
    op.drop_column('producers', 'email_followup_3_sent_at')
    op.drop_column('producers', 'email_followup_2_sent_at')
