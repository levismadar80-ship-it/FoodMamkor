"""meh2618_delivery_waitlist

Revision ID: d4e7a1b2c3f5
Revises: 9c534d477f2b
Create Date: 2026-10-30 23:30:00.000000+00:00

MEH-2618: adds the `delivery_waitlist` table — «תודיעו לי כשתגיעו ל{עיר}».
A visitor whose city a business does not deliver to leaves an email and the
city (no account needed) and is mailed once when the business adds that city
to its delivery areas.

Expand-only per ADR-007: a new, empty table that no existing read path
touches. No backfill: nothing could be waited for before this revision.

Columns: `id` UUID PK; `producer_id` FK → producers.id ON DELETE CASCADE;
`city` String(60) (the visitor's own spelling, used in her email);
`city_key` String(60) (app.data.cities.city_key — the comparison form the
trigger matches on); `email` String(200) (trimmed, lower-cased);
`user_id` FK → users.id ON DELETE SET NULL (set when she was signed in);
`created_at`; `notified_at` nullable (the once-only guard).
UNIQUE (producer_id, city_key, email); index (producer_id, city_key) for
the trigger's lookup.

Adds one table → EXPECTED_TABLES 43 -> 44 (pr-checks.yml — Sapir's edit).

downgrade() drops the table — every pending «תודיעו לי» request is
forgotten, which is the pre-MEH-2618 state.

Chained on 9c534d477f2b (MEH-2556, staging head on 30/10), so
`alembic heads` stays at one head.

# DO NOT create this table anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d4e7a1b2c3f5"
down_revision: Union[str, None] = "9c534d477f2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "delivery_waitlist",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("city", sa.String(length=60), nullable=False),
        sa.Column("city_key", sa.String(length=60), nullable=False),
        sa.Column("email", sa.String(length=200), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("notified_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "producer_id",
            "city_key",
            "email",
            name="uq_delivery_waitlist_city_email",
        ),
    )
    op.create_index(
        "ix_delivery_waitlist_producer_city",
        "delivery_waitlist",
        ["producer_id", "city_key"],
    )


def downgrade() -> None:
    op.drop_index("ix_delivery_waitlist_producer_city", table_name="delivery_waitlist")
    op.drop_table("delivery_waitlist")
