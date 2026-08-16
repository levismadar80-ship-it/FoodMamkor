"""MEH-1872: producer_name_change_requests — re-moderated business-name edits.

MEH-1851 removed `name` from the owner-writable set because a plain setattr
let an approved business become a different business after approval. This
table is the sanctioned route back: the owner files a request, the public
`producers.name` does not move, and an admin approves or rejects it.

A table rather than a `pending_name` column (Sapir's ruling, 09/08) so the
decision keeps an audit trail and a second request cannot silently overwrite
the first.

Additive only — creates one new table, touches no existing column, so there is
no expand-contract phase and nothing to backfill.

Revision ID: b7d3e1a94c26
Revises: a2f7d4c8e153
Create Date: 2026-08-09 19:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b7d3e1a94c26"
down_revision: str | None = "a2f7d4c8e153"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "producer_name_change_requests",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column(
            "producer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("current_name", sa.String(length=100), nullable=False),
        sa.Column("requested_name", sa.String(length=100), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("admin_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_producer_name_change_requests_producer_id",
        "producer_name_change_requests",
        ["producer_id"],
    )
    # The admin queue reads WHERE status = 'pending' on every load.
    op.create_index(
        "ix_producer_name_change_requests_status",
        "producer_name_change_requests",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_producer_name_change_requests_status",
        table_name="producer_name_change_requests",
    )
    op.drop_index(
        "ix_producer_name_change_requests_producer_id",
        table_name="producer_name_change_requests",
    )
    op.drop_table("producer_name_change_requests")
