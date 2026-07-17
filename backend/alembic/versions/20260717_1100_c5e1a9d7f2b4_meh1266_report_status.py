"""meh1266_report_status

Revision ID: c5e1a9d7f2b4
Revises: d4e7a92c81b5
Create Date: 2026-07-17 11:00:00.000000+00:00

MEH-1266 (report lifecycle): adds a resolve/dismiss lifecycle to `reports`
so admins can close a report and dashboard counters reflect only open ones.

Three columns on `reports`:

- `status` (VARCHAR, NOT NULL, server_default 'open') — one of
  open|resolved|dismissed. The server_default backfills every existing row
  to 'open' during the ADD; the explicit UPDATE below is a belt-and-braces
  guarantee for the "backfill existing rows to 'open'" acceptance criterion.
- `resolved_at` (TIMESTAMP, nullable) — naive stamp of when the report was
  closed (matches the naive `created_at` on this table).
- `resolved_by` (UUID, nullable, FK users.id ON DELETE SET NULL) — the admin
  who closed it. SET NULL (not CASCADE): closing an account must not delete
  the report history, only drop the resolver attribution.

Expand-only against the ef8fb1858f5b baseline chain. EXPECTED_TABLES
unchanged (columns, not a table). No other schema change (MEH-1266 scope).

# DO NOT change status nullability/default without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "c5e1a9d7f2b4"
down_revision: Union[str, None] = "d4e7a92c81b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="open",
        ),
    )
    op.add_column(
        "reports",
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "reports",
        sa.Column("resolved_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_reports_resolved_by_users",
        "reports",
        "users",
        ["resolved_by"],
        ["id"],
        ondelete="SET NULL",
    )
    # Explicit backfill (server_default already covers the ADD; this is the
    # documented "backfill existing rows to 'open'" step).
    op.execute("UPDATE reports SET status = 'open' WHERE status IS NULL")


def downgrade() -> None:
    op.drop_constraint("fk_reports_resolved_by_users", "reports", type_="foreignkey")
    op.drop_column("reports", "resolved_by")
    op.drop_column("reports", "resolved_at")
    op.drop_column("reports", "status")
