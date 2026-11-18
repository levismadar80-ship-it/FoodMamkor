"""meh3315_party_size_attendance

Revision ID: d4a6b8c0e2f1
Revises: c9f5a3b7d2e8
Create Date: 2026-11-18 12:00:00.000000+00:00

MEH-3315: one sign-up can be for a party (1-10 people), and the business can
mark who came.

Changes:
  - registrations.party_size SMALLINT NOT NULL DEFAULT 1, CHECK 1..10
    (ck_registrations_party_size). Places are counted as the sum of it.
  - registrations.attendance VARCHAR(10) NULL, CHECK NULL / 'attended' /
    'no_show' (ck_registrations_attendance). For the business only; nothing
    blocks a visitor who did not come.

Expand-only per ADR-007: the server default fills every existing row with 1
(the old one-row-one-place count), and the old container never reads either
column.

downgrade(): drop both constraints and columns. A party sign-up then counts
as one place again (the pre-MEH-3315 state).

# DO NOT change these constraints anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4a6b8c0e2f1"
down_revision: Union[str, None] = "c9f5a3b7d2e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "registrations",
        sa.Column(
            "party_size", sa.SmallInteger(), nullable=False, server_default=sa.text("1")
        ),
    )
    op.add_column(
        "registrations", sa.Column("attendance", sa.String(length=10), nullable=True)
    )
    op.create_check_constraint(
        "ck_registrations_party_size",
        "registrations",
        "party_size BETWEEN 1 AND 10",
    )
    op.create_check_constraint(
        "ck_registrations_attendance",
        "registrations",
        "attendance IS NULL OR attendance IN ('attended', 'no_show')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_registrations_attendance", "registrations", type_="check")
    op.drop_constraint("ck_registrations_party_size", "registrations", type_="check")
    op.drop_column("registrations", "attendance")
    op.drop_column("registrations", "party_size")
