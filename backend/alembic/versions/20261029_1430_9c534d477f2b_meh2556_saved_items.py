"""meh2556_saved_items

Revision ID: 9c534d477f2b
Revises: 8600916f1942
Create Date: 2026-10-29 14:30:00.000000+00:00

MEH-2556 (chunk 1/5 of MEH-2555): adds the `saved_items` table — the recipes,
events and experiences a user saved to «המועדפים שלי». Businesses keep their
own `favorites` table (FavoriteAlert hangs off it); this table holds every
other content type.

Expand-only per ADR-007: a new, empty table that no existing read path
touches — the previous container keeps serving unchanged while this runs. No
backfill: nothing could be saved before this revision.

Columns: `id` UUID PK; `user_id` FK → users.id ON DELETE CASCADE (no
separate index: the UNIQUE below leads with user_id and serves every per-user
query); `item_type` String(20) with a DB CHECK
('recipe' | 'event' | 'experience' — mirrored by SAVED_ITEM_TYPES in
models.py); `item_id` UUID with NO foreign key (it points at a different
table per type — the API serves only items that still exist and are public);
`created_at`. UNIQUE (user_id, item_type, item_id): one save per item.

Adds one table → EXPECTED_TABLES 42 -> 43 (pr-checks.yml).

downgrade() drops the table — every saved recipe/event/experience is
forgotten, which is the pre-MEH-2556 state. Business favorites are untouched.

Chained on 8600916f1942 (MEH-2496, staging head on 29/10 after #3791
merged), so `alembic heads` stays at one head.

# DO NOT create this table anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "9c534d477f2b"
down_revision: Union[str, None] = "8600916f1942"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_type", sa.String(length=20), nullable=False),
        sa.Column("item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "item_type", "item_id", name="uq_saved_items_user_item"
        ),
        sa.CheckConstraint(
            "item_type IN ('recipe', 'event', 'experience')",
            name="saved_items_item_type_check",
        ),
    )


def downgrade() -> None:
    op.drop_table("saved_items")
