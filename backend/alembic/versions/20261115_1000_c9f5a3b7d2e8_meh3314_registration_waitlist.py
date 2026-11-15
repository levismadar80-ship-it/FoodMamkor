"""meh3314_registration_waitlist

Revision ID: c9f5a3b7d2e8
Revises: f6c2a8d4e1b7
Create Date: 2026-11-15 10:00:00.000000+00:00

MEH-3314: a full event or one-off workshop takes a waitlist through the same
on-site form. A waitlist entry is a `registrations` row with status
'waitlisted'; when a sign-up is cancelled, the first one not yet offered gets
an email, stamped in the new `waitlist_offered_at` (naive UTC, like
created_at / cancelled_at) so nobody is offered twice.

Changes:
  - ck_registrations_status: ('registered', 'cancelled') → adds 'waitlisted'.
  - registrations.waitlist_offered_at DateTime NULL.

Expand-only per ADR-007: the old container never writes 'waitlisted' and
never reads the new column, and the wider CHECK accepts every row it writes.

downgrade(): a 'waitlisted' row would violate the old CHECK, so those rows
become 'cancelled' first (the waitlist is forgotten — the pre-MEH-3314
state), then the CHECK narrows and the column is dropped.

# DO NOT change this constraint anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9f5a3b7d2e8"
down_revision: Union[str, None] = "f6c2a8d4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_registrations_status", "registrations", type_="check")
    op.create_check_constraint(
        "ck_registrations_status",
        "registrations",
        "status IN ('registered', 'cancelled', 'waitlisted')",
    )
    op.add_column(
        "registrations",
        sa.Column("waitlist_offered_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.execute(
        "UPDATE registrations SET status = 'cancelled' WHERE status = 'waitlisted'"
    )
    op.drop_column("registrations", "waitlist_offered_at")
    op.drop_constraint("ck_registrations_status", "registrations", type_="check")
    op.create_check_constraint(
        "ck_registrations_status",
        "registrations",
        "status IN ('registered', 'cancelled')",
    )
