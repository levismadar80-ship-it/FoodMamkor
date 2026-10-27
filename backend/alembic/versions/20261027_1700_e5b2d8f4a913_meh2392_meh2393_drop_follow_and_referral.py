"""meh2392_meh2393_drop_follow_and_referral

Revision ID: e5b2d8f4a913
Revises: d7a3f5c1e2b8
Create Date: 2026-10-27 17:00:00.000000+00:00

Contract phase (ADR-007) for two removed features:

- MEH-2392: drops `producer_followers`. The follow button went in MEH-1363,
  the endpoints in MEH-2370 (#3638); follower counts read `favorites` since
  MEH-1364. Nothing reads or writes the table.
- MEH-2393 (chunk 2/3): drops `referral_clicks`. The claim flow went in
  MEH-2374 (#3639); nothing reads or writes it.

`users.referral_code` is NOT dropped here. The running container maps it on
User, so dropping it in the same deploy would fail every SELECT on users from
the old container until the new one passes its healthcheck (and for good if
it never does). This revision ships with the column excluded from the User
mapper (still in the table); chunk 3 drops it once this code is running.

The 7-day staging soak was waived by Sapir on 27/10 (pre-launch, no real
businesses or users yet). Tables 43 -> 41; EXPECTED_TABLES in pr-checks.yml
moves in the same PR.

downgrade() restores the exact pre-drop DDL (columns, PKs, unique
constraints, indexes, FKs with their ondelete rules) as measured with
pg_dump on a fresh `alembic upgrade head` at d7a3f5c1e2b8. Rows are not
restored.

Chained on d7a3f5c1e2b8 (staging head on 27/10), so `alembic heads` stays
at one head.

# DO NOT change nullability or add a default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e5b2d8f4a913"
down_revision: Union[str, None] = "d7a3f5c1e2b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_table("producer_followers")
    op.drop_table("referral_clicks")


def downgrade() -> None:
    op.create_table(
        "referral_clicks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("referrer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("referee_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["referee_id"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["referrer_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("referee_id", name="uq_referral_one_per_referee"),
    )
    op.create_index(
        "ix_referral_clicks_referee_id", "referral_clicks", ["referee_id"]
    )
    op.create_index(
        "ix_referral_clicks_referrer_id", "referral_clicks", ["referrer_id"]
    )

    op.create_table(
        "producer_followers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("notify_new_products", sa.Boolean(), nullable=True),
        sa.Column("notify_back_in_stock", sa.Boolean(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["producer_id"], ["producers.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "producer_id", name="uq_one_follow_per_user_producer"
        ),
    )
