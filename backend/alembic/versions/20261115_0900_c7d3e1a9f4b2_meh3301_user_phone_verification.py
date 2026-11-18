"""meh3301_user_phone_verification

Revision ID: c7d3e1a9f4b2
Revises: d4a6b8c0e2f1
Create Date: 2026-11-15 09:00:00.000000+00:00

MEH-3301 (D14 of the 14/11 grill retro, part א): WhatsApp alerts must go only
to a phone the user proved is hers. Schema only; the routes are MEH-3302.

Adds to `users`:
  * `phone_verified_at` timestamptz NULL — when the current `phone` was
    verified with a code; cleared when the phone changes.
  * `whatsapp_consent_at` timestamptz NULL — when she agreed to WhatsApp
    updates; cleared by «הסר».
Both nullable with no backfill: NULL = no evidence, the truth for every
existing row.

Adds `user_phone_otp_tokens` (id UUID PK; user_id FK users.id ON DELETE
CASCADE NOT NULL, indexed; phone String(30) — the canonical number the code
is bound to; code String(6); expires_at; used bool default false; attempts
int default 0 — 5 wrong guesses per token; created_at).

Expand-only per ADR-007: two nullable columns and a new empty table; no
existing read path depends on any of them, so the previous container keeps
serving unchanged while this runs.

Adds one table, counted in v1.5.6 train 3's EXPECTED_TABLES=64 (.github/workflows/pr-checks.yml;
a .github change, committed by a human per security.md).

downgrade() drops the table and the two columns — verification records are
lost, which is the pre-MEH-3301 state.

# DO NOT create this table anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c7d3e1a9f4b2"
down_revision: Union[str, None] = "d4a6b8c0e2f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("whatsapp_consent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_table(
        "user_phone_otp_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("code", sa.String(length=6), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "used", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_user_phone_otp_tokens_user_id",
        "user_phone_otp_tokens",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_user_phone_otp_tokens_user_id", table_name="user_phone_otp_tokens"
    )
    op.drop_table("user_phone_otp_tokens")
    op.drop_column("users", "whatsapp_consent_at")
    op.drop_column("users", "phone_verified_at")
