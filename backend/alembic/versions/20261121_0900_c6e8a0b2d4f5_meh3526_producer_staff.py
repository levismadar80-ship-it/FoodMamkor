"""meh3526_producer_staff

Revision ID: c6e8a0b2d4f5
Revises: f3a7c91e2b64
Create Date: 2026-11-21 09:00:00.000000+00:00

MEH-3526, EXPAND only: one new table, nothing existing is touched.

A business invites up to 5 people by email to handle its orders. A person
who accepts keeps their own account; this row is what lets them in. It is a
separate table on purpose (Fable plan review 20/11): putting `producer_id` on
the staff member's `users` row would break `_has_owner`
(producer_owner_invite.py), the order-email recipient pick
(product_order_outbox.py, `.first()`) and every `_own_producer_id` route.

  - `producer_staff`
        id            UUID PK
        producer_id   UUID NOT NULL FK producers.id ON DELETE CASCADE (indexed)
        user_id       UUID NULL FK users.id ON DELETE CASCADE
                      (NULL while the invite is pending; set on accept)
        invited_email VARCHAR(255) NOT NULL
        role          VARCHAR(20) NOT NULL DEFAULT 'orders'   CHECK role IN ('orders')
        token_hash    VARCHAR(64) NULL   -- sha256 of the invite token; NULL once used or revoked
        expires_at    TIMESTAMPTZ NOT NULL   -- 7 days after the invite
        invited_by    UUID NULL FK users.id ON DELETE SET NULL
        status        VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK status IN ('pending', 'active', 'revoked')
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
        accepted_at   TIMESTAMPTZ NULL
        revoked_at    TIMESTAMPTZ NULL

  Indexes:
    - uq_producer_staff_active_user  UNIQUE (user_id) WHERE status = 'active'
      (a person is staff of one business at a time)
    - uq_producer_staff_live_email   UNIQUE (producer_id, lower(invited_email))
      WHERE status IN ('pending', 'active')  (one live invite per address)
    - uq_producer_staff_token_hash   UNIQUE (token_hash) WHERE token_hash IS NOT NULL
    - ix_producer_staff_producer_id  (producer_id)

The 5-per-business cap is enforced in code (`limits.py`), counting pending
and active rows, not by the database.

**EXPECTED_TABLES goes +1** (`.github/workflows/pr-checks.yml`). That file is
outside what CC edits from the shell; it rides in a browser commit on this
branch.

Downgrade drops the table: every staff member loses access at once, and the
owner's invites are gone. Rollback for a failed deploy only.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c6e8a0b2d4f5"
down_revision: Union[str, None] = "f3a7c91e2b64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producer_staff",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "producer_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("producers.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("invited_email", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), nullable=False, server_default="orders"),
        sa.Column("token_hash", sa.String(64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("role IN ('orders')", name="ck_producer_staff_role"),
        sa.CheckConstraint(
            "status IN ('pending', 'active', 'revoked')",
            name="ck_producer_staff_status",
        ),
    )
    op.create_index(
        "ix_producer_staff_producer_id", "producer_staff", ["producer_id"]
    )
    op.create_index(
        "uq_producer_staff_active_user",
        "producer_staff",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index(
        "uq_producer_staff_live_email",
        "producer_staff",
        ["producer_id", sa.text("lower(invited_email)")],
        unique=True,
        postgresql_where=sa.text("status IN ('pending', 'active')"),
    )
    op.create_index(
        "uq_producer_staff_token_hash",
        "producer_staff",
        ["token_hash"],
        unique=True,
        postgresql_where=sa.text("token_hash IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_producer_staff_token_hash", table_name="producer_staff")
    op.drop_index("uq_producer_staff_live_email", table_name="producer_staff")
    op.drop_index("uq_producer_staff_active_user", table_name="producer_staff")
    op.drop_index("ix_producer_staff_producer_id", table_name="producer_staff")
    op.drop_table("producer_staff")
