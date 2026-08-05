"""meh1818_pending_nudge_sent_at

Revision ID: d3b7f1a92c64
Revises: a4f7c2e91b58
Create Date: 2026-08-02 12:00:00.000000+00:00

MEH-1818: adds ONE nullable TIMESTAMP WITH TIME ZONE column on `producers`
to track when the day-1 pending-nudge email was sent to a business that is
still awaiting approval (`status` IN ('pending', 'pending_whatsapp')).

`NULL` encodes "not yet nudged". A non-null timestamp is the durable
"this producer received the nudge" record — the same fail-open contract as
the MEH-539 columns this mirrors (Resend may still have silently dropped
the message; accepted per MEH-539 Phase 2A.5 risk note). It is what makes
the email fire EXACTLY ONCE: the candidate query filters on IS NULL, and a
producer with nothing actually missing is stamped WITHOUT being emailed, so
it never re-enters the candidate set.

Mirrors b504e4be4225 (MEH-539) in style and in every schema property —
nullable=True, no server_default, no index of its own. No new index is
needed: the candidate query filters on `created_at`, already covered by
`idx_producers_created_at` created in b504e4be4225.

EXPECTED_TABLES unchanged (a column, not a table) — the CI drift gate
stays at 38.

# DO NOT add backfill SQL here — every existing producer must remain NULL
#        on this column. A backfill would retro-suppress the nudge for the
#        exact pending businesses this ticket exists to reach.
#        Alembic is the sole schema authority since MEH-267.

Expand-only: ADD COLUMN nullable with no default is not a rewrite and
takes no long lock on Postgres, so ADR-007 Expand-Contract does not apply
(that governs DROP / RENAME / type change / NOT NULL on an existing
column — none of which happen here).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3b7f1a92c64'
# MEH-1818: chain head verified by parsing every `revision` / `down_revision`
# across all 49 files in backend/alembic/versions/ and taking the revision
# that nothing points back to — a4f7c2e91b58 (MEH-1772 delivery_area_fee,
# 20260729_1200). SINGLE head, so this revision extends the chain linearly
# and needs no merge revision. rtl-ok
down_revision: Union[str, None] = 'a4f7c2e91b58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('email_pending_nudge_sent_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'email_pending_nudge_sent_at')
