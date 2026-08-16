"""meh1651_group_buy_funded_notified_at

Revision ID: c7e2a4f9b1d6
Revises: b9d3f1a7c2e4
Create Date: 2026-07-27 12:00:00.000000+00:00

MEH-1651 (קבוצת רכש funded — התראה לשני הצדדים): adds one nullable timestamp
column to `group_buys` that marks the moment the open->funded notification pair
was dispatched:

  - `funded_notified_at`  TIMESTAMP, nullable — NULL = the funded notification
                          has never been sent for this group buy. Set to
                          `datetime.utcnow()` at the moment the router fires the
                          producer + participant emails.

This is an IDEMPOTENCY MARKER, not a business field. `group_buys.status` alone
cannot carry it: the status legitimately flaps. A cancelled commit that drops
the group back below `min_participants` reverts `status` to "open"
(group_buys.py:171-172), and the next join re-crosses the threshold and sets
"funded" again (group_buys.py:136-137). Keying the send off the transition alone
would re-notify every participant on every flap around the threshold. The send
is therefore guarded by `funded_notified_at IS NULL`, which is a one-way latch:
once stamped it stays stamped, and the revert-to-open path deliberately does NOT
clear it.

Nullable with NO server_default and NO backfill: existing group_buys rows
predate the notification feature, and backfilling a timestamp would assert a
send that never happened. Rows already in "funded" stay NULL — they are past
their transition, so the guard never fires for them retroactively. Expand-only
per ADR-007 — one additive nullable column, no behaviour change at the schema
layer. EXPECTED_TABLES unchanged (a column, not a table).

Chained onto b9d3f1a7c2e4 (merge of MEH-1541 + MEH-1543), verified as the single
head via `alembic heads` at staging d844e177.

# DO NOT clear this column on the funded->open revert path — that would
#        re-arm the notification and re-spam every participant on the next
#        threshold crossing, which is the exact failure this column exists to
#        prevent.
# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c7e2a4f9b1d6"
down_revision: Union[str, None] = "b9d3f1a7c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "group_buys",
        sa.Column("funded_notified_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("group_buys", "funded_notified_at")
