"""meh2646_rescue_block_cleared_at

Revision ID: b2e6d4a17c93
Revises: a1c9f3e8d204
Create Date: 2026-11-04 08:30:00.000000+00:00

MEH-2646 (chunk 2/4 of MEH-2643): one nullable timestamp on `users`, so that
«two no-shows in 30 days blocks new reservations» and «an admin endpoint to
reset» can both be true at once.

WHY A COLUMN AT ALL — the two halves of the pilot rule do not fit together
without a time anchor:

  - `users.rescue_no_show_count` (added in a1c9f3e8d204) carries NO window, so
    on its own it cannot express "in 30 days". Blocking on it would block a
    buyer whose two no-shows were a year apart.
  - A window derived from `rescue_orders` DOES express the rule exactly
    (status = 'no_show' AND the offer's `pickup_end` inside 30 days), but then
    "reset the counter" releases nothing — the window recomputes from the
    orders and the buyer stays blocked. The admin endpoint would be a no-op
    that looks like it worked.

So the derived window stays the authority, and this column is what an admin
reset writes: the gate counts only no-shows whose `pickup_end` is AFTER
`rescue_block_cleared_at`. One write releases a buyer, nothing is deleted, and
the history in `rescue_orders` is left intact — a forgiven no-show is still a
no-show for the chunk-5 metrics, which is the honest record.

NULL = never cleared, which is every existing row. Expand-only per ADR-007: a
nullable column no current read path touches, so the previous container keeps
serving unchanged. No backfill — "never cleared" is correct for everyone.

Adds no table -> EXPECTED_TABLES unchanged (still 47 after a1c9f3e8d204, which
needs its own 43 -> 47 edit in pr-checks.yml; that one is Sapir's, PR #3963).

downgrade() drops the column. Every cleared block is forgotten, which means
the affected buyers become blocked again if their no-shows are still inside
the 30-day window — the pre-MEH-2646 state, and worth knowing before rolling
back rather than after.

# DO NOT widen this into a general "admin forgiveness" ledger — if more than
#        one kind of forgiveness is ever needed, that is a table, not more
#        columns on `users`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2e6d4a17c93"
down_revision: Union[str, None] = "a1c9f3e8d204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("rescue_block_cleared_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "rescue_block_cleared_at")
