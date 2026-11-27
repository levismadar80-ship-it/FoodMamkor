"""meh3896_share_links

Revision ID: d2f4b6a8c0e1
Revises: c6e8a0b2d4f5
Create Date: 2026-11-26 15:00:00.000000+00:00

MEH-3896. Additive only (ADR-007 expand): one new table, share_links — the
short code behind mehamakor.co.il/v/<code> (draft preview) and /c/<code>
(claim), written only by the two admin "create link" routes. No existing
table, column or constraint is touched. EXPECTED_TABLES +1.

Only the SHA-256 of each code is stored, never the code.

Downgrade drops the table. Short links already sent stop working; the long
JWT links keep working, because nothing here replaced them.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "d2f4b6a8c0e1"
down_revision: Union[str, None] = "c6e8a0b2d4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "share_links",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("scope", sa.String(length=20), nullable=False),
        sa.Column(
            "producer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("code_hash", name="share_links_code_hash_key"),
        sa.CheckConstraint(
            "scope IN ('draft_preview', 'producer_claim')",
            name="share_links_scope_check",
        ),
    )
    op.create_index("ix_share_links_producer_id", "share_links", ["producer_id"])
    op.create_index("ix_share_links_expires_at", "share_links", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_share_links_expires_at", table_name="share_links")
    op.drop_index("ix_share_links_producer_id", table_name="share_links")
    op.drop_table("share_links")
