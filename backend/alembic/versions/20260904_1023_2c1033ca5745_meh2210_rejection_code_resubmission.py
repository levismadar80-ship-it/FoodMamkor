"""meh2210_rejection_code_resubmission

Revision ID: 2c1033ca5745
Revises: e6b2d4f81a37
Create Date: 2026-09-04 10:23:00.000000+00:00

MEH-2210 chunk A — the rejected → resubmit loop. Three additive columns on
`producers`, no backfill, no new table (EXPECTED_TABLES unchanged):

  - `rejection_reason_code`  VARCHAR(40), NULL — the admin's preset key
                             (admin.py::PRODUCER_REJECTION_PRESETS, the same
                             dict that composes `rejection_reason`). NULL on
                             every row rejected before this column and on
                             free-text-only rejections; the owner banner
                             falls back to the text.
  - `resubmission_count`     INTEGER, NOT NULL, server_default '0' — how many
                             times the business sent itself back from
                             `rejected` to `pending`. History: approve does
                             not reset it. Capped server-side at
                             constants.MAX_PRODUCER_RESUBMISSIONS (3).
  - `resubmitted_at`         TIMESTAMPTZ, NULL — the latest resubmission.

server_default '0' + NOT NULL follows MEH-1419's `experiences.is_active`:
every existing row has used zero resubmissions, and the cap comparison must
never meet a NULL. Expand-only per ADR-007 — additive, safe backfill, no
behaviour change until the router branch in the same PR reads them.

# DO NOT add column changes for producers in main.py — Alembic is the sole
#        schema authority since MEH-267 (root cause of the MEH-265
#        production-login incident).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2c1033ca5745"
# MEH-2210: chains onto the single head e6b2d4f81a37 (MEH-1606 merge orphan
# category, 03/09), which itself follows 7c1e2a9f4b3d (MEH-2056 backfill
# primary locations). Verified with `alembic heads` before writing.
down_revision: Union[str, None] = "e6b2d4f81a37"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("rejection_reason_code", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column(
            "resubmission_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "producers",
        sa.Column("resubmitted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "resubmitted_at")
    op.drop_column("producers", "resubmission_count")
    op.drop_column("producers", "rejection_reason_code")
