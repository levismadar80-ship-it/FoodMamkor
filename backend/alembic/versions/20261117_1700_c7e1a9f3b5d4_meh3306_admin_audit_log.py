"""meh3306_admin_audit_log

Revision ID: c7e1a9f3b5d4
Revises: 5808c77bee3a
Create Date: 2026-11-17 17:00:00.000000+00:00

MEH-3306 (rulings 17/11, part ב), EXPAND only: a new table, nothing existing
is touched.

  - `admin_audit_log`  one row per successful change an admin made:
        id           UUID PK
        actor_id     UUID NOT NULL          (indexed; deliberately NOT a FK)
        action       VARCHAR(160) NOT NULL  ("PUT /admin/users/{user_id}/role")
        target_type  VARCHAR(40) NULL
        target_id    VARCHAR(64) NULL
        details      JSONB NULL             (reduced before/after, no PII)
        ip           VARCHAR(64) NULL
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now()   (indexed)

WHY NO FOREIGN KEY on actor_id: a FK needs an ON DELETE rule and both are
wrong for an audit log. CASCADE erases the record with the account; SET NULL
is an UPDATE on an append-only table and erases who did it.

Append-only is enforced in the app (the only writer is
services/admin_audit.py, INSERT only; tests/test_meh3306_admin_audit_log.py
scans for any update or delete). No trigger: a trigger would also block the
retention job this table will need one day, and that decision is not made.

**EXPECTED_TABLES goes 57 → 58** (`.github/workflows/pr-checks.yml`). That
file is outside what CC edits; the line is in the PR body for Sapir.

Downgrade drops the table and its rows. That is the loss of the audit trail,
so it is a rollback for a failed deploy only, never a routine step.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "c7e1a9f3b5d4"
down_revision: Union[str, None] = "5808c77bee3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("actor_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("action", sa.String(length=160), nullable=False),
        sa.Column("target_type", sa.String(length=40), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column("details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip", sa.String(length=64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_admin_audit_log_actor_id"),
        "admin_audit_log",
        ["actor_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_admin_audit_log_created_at"),
        "admin_audit_log",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_admin_audit_log_created_at"), table_name="admin_audit_log")
    op.drop_index(op.f("ix_admin_audit_log_actor_id"), table_name="admin_audit_log")
    op.drop_table("admin_audit_log")
