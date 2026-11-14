"""meh3117_notify_new_rescue

Revision ID: c3e7a1f5d829
Revises: b7d4e2a9c615
Create Date: 2026-11-14 09:30:00.000000+00:00

MEH-3117 (new_rescue favorite alert): adds a single nullable Boolean to
`favorite_alerts`:

  - `notify_new_rescue`  BOOLEAN, nullable, server_default=true — the 6th
    alert-type preference, a copy of MEH-2828's notify_new_group_buy
    (e4c9a2f71b58). server_default=true opts EXISTING rows in without a
    backfill script; new rows always receive an explicit value from
    AlertPrefsIn. The code reads NULL as ON, like notify_new_group_buy.

Fired from rescue.create_offer after commit, only for an offer dated TODAY
on the Israel clock (the approved title says «היום»). The MEH-1338
per-(user, producer, channel) 24h cap applies via fire_alerts.

Expand-only per ADR-007 — one additive nullable column, no change to
existing schema. EXPECTED_TABLES unchanged (column, not a table).
Approved by Sapir 14/11/2026 09:04Z.

# DO NOT tighten to NOT NULL or drop the server_default without a
#        separate Expand-Contract ticket (ADR-007).
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3e7a1f5d829"
# Single head on staging when authored (14/11): b7d4e2a9c615 (MEH-3055).
down_revision: Union[str, None] = "b7d4e2a9c615"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "favorite_alerts",
        sa.Column(
            "notify_new_rescue",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("favorite_alerts", "notify_new_rescue")
