"""meh3225_rescue_no_show_tombstones

Revision ID: f6c2a8d4e1b7
Revises: e4b8d2f6a913
Create Date: 2026-11-14 23:00:00.000000+00:00

MEH-3225 (D5 of the 14/11 grill retro): the two-no-shows block of the rescue
bags must survive account deletion. Deleting a user cascades her
rescue_orders, so before this a buyer with two no-shows could delete the
account, sign up again with the same email and reserve at once.

Adds `rescue_no_show_tombstones`: one row per no-show still counting when an
account is deleted. Columns: `id` UUID PK; `email_hash` String(64), the hex
HMAC-SHA256 of the normalised email keyed with the app secret
(services/rescue_no_show.py::email_hash); `pickup_end` (naive UTC, same as
rescue_offers.pickup_end); `created_at`. No email, no name, no business, no
order, no FK. Indexed on email_hash (the reserve gate's lookup) and
pickup_end (the retention purge's scan). The purge deletes a row 30 days
after its pickup_end, when it would stop counting anyway.

Expand-only per ADR-007: a new, empty table no existing read path depends on
— the previous container keeps serving unchanged while this runs. No
backfill: accounts deleted before this revision left nothing to hash.

Adds one table → EXPECTED_TABLES 50 -> 51 (pr-checks.yml).

downgrade() drops the table — the block is forgotten on deletion again,
which is the pre-MEH-3225 state.

# DO NOT create this table anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f6c2a8d4e1b7"
down_revision: Union[str, None] = "e4b8d2f6a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rescue_no_show_tombstones",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email_hash", sa.String(length=64), nullable=False),
        sa.Column("pickup_end", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_rescue_no_show_tombstones_email_hash",
        "rescue_no_show_tombstones",
        ["email_hash"],
    )
    op.create_index(
        "ix_rescue_no_show_tombstones_pickup_end",
        "rescue_no_show_tombstones",
        ["pickup_end"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_rescue_no_show_tombstones_pickup_end",
        table_name="rescue_no_show_tombstones",
    )
    op.drop_index(
        "ix_rescue_no_show_tombstones_email_hash",
        table_name="rescue_no_show_tombstones",
    )
    op.drop_table("rescue_no_show_tombstones")
