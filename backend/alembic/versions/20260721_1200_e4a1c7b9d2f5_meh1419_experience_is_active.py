"""meh1419_experience_is_active

Revision ID: e4a1c7b9d2f5
Revises: a9f4c2e7b1d3
Create Date: 2026-07-21 12:00:00.000000+00:00

MEH-1419 (reversible-cancel for experiences): adds a single column to
`experiences`, mirroring the existing `Event.is_active` flag:

  - `is_active`  BOOLEAN, NOT NULL, server_default `true` — lets a host
                 temporarily cancel/reactivate an experience from the
                 dashboard (MEH-1405 gave events this toggle; experiences
                 were left delete-only). The public list filters
                 `is_active IS TRUE`, so a cancelled experience drops from
                 the feed but stays visible + toggleable on GET /mine.

server_default `true` (unlike MEH-1291's NULL-until-edited column):
every existing row must be treated as active on backfill — a cancel is
an explicit host action, never the default state. NOT NULL because the
flag is always meaningful (there is no "unknown" active state).

Expand-only per ADR-007 — one additive column with a safe backfill, no
behavior change until the router filter + dashboard toggle ship in the
same PR. EXPECTED_TABLES unchanged (column, not a table).

# DO NOT add column changes for experiences in main.py — Alembic is the
#        sole schema authority since MEH-267 (root cause of the MEH-265
#        production-login incident).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a1c7b9d2f5"
# MEH-1419: chains onto the current single head a9f4c2e7b1d3 (MEH-1395
# producer_locations). Prior tail: b7e2a4c9d1f6 (merge meh1291/meh1297) →
# d4b8f1c7e903 (meh1338 alert_log) → f7d2a9c4b1e8 (meh1335 owner_story) →
# c8f3a6d1e9b2 (meh1361 notify_new_recipe) → a9f4c2e7b1d3 → THIS.
down_revision: Union[str, None] = "a9f4c2e7b1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "experiences",
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("experiences", "is_active")
