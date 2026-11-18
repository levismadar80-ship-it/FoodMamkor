"""meh3305_admin_passkeys

Revision ID: b4f2c8e1d6a3
Revises: a3d9e5c1f7b2
Create Date: 2026-11-18 18:00:00.000000+00:00

MEH-3305 (Sapir's approval 18/11), EXPAND only: two new tables, nothing
existing is touched.

  - `admin_passkeys`  one row per passkey an admin account registered:
        id            UUID PK
        user_id       UUID NOT NULL FK users.id ON DELETE CASCADE (indexed)
        credential_id BYTEA NOT NULL UNIQUE   (the authenticator's id)
        public_key    BYTEA NOT NULL          (COSE key)
        sign_count    BIGINT NOT NULL DEFAULT 0
        transports    VARCHAR(120) NULL
        name          VARCHAR(60) NULL
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        last_used_at  TIMESTAMPTZ NULL

  - `admin_recovery_codes`  one row per one-time recovery code, HASHED:
        id         UUID PK
        user_id    UUID NOT NULL FK users.id ON DELETE CASCADE (indexed)
        code_hash  VARCHAR(128) NOT NULL
        used_at    TIMESTAMPTZ NULL
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()

CASCADE on both: a deleted admin account must leave no usable key or code.
Nothing reads these tables until chunk 3 ships the routes, so this revision
can deploy alone.

**EXPECTED_TABLES goes 58 → 60** (`.github/workflows/pr-checks.yml`). That
file is outside what CC edits; it rides in the chunk-2 Chrome commit.

Downgrade drops both tables. Every admin then signs in with the first factor
only, so it is a rollback for a failed deploy only.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "b4f2c8e1d6a3"
down_revision: Union[str, None] = "a3d9e5c1f7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_passkeys",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("transports", sa.String(length=120), nullable=True),
        sa.Column("name", sa.String(length=60), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("credential_id"),
    )
    op.create_index(
        op.f("ix_admin_passkeys_user_id"), "admin_passkeys", ["user_id"], unique=False
    )
    op.create_table(
        "admin_recovery_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("code_hash", sa.String(length=128), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_recovery_codes_user_id"),
        "admin_recovery_codes",
        ["user_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_admin_recovery_codes_user_id"), table_name="admin_recovery_codes"
    )
    op.drop_table("admin_recovery_codes")
    op.drop_index(op.f("ix_admin_passkeys_user_id"), table_name="admin_passkeys")
    op.drop_table("admin_passkeys")
