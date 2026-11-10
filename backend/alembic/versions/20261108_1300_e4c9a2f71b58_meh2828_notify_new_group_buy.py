"""meh2828_notify_new_group_buy

Revision ID: e4c9a2f71b58
Revises: f2b8d4c61a07
Create Date: 2026-11-08 13:00:00.000000+00:00

MEH-2828 (new_group_buy favorite alert): adds a single nullable Boolean to
`favorite_alerts`:

  - `notify_new_group_buy`  BOOLEAN, nullable, server_default=true — the 5th
    alert-type preference, mirroring notify_new_recipe (MEH-1361,
    c8f3a6d1e9b2) and the three older siblings. server_default=true opts
    EXISTING rows in without a backfill script — the siblings' opt-out
    model; new rows always receive an explicit value from AlertPrefsIn.

Fired from group_buys.create_group_buy after commit (status open) — not on
edit, funded or cancel. The MEH-1338 per-(user, producer, channel) 24h cap
applies automatically via fire_alerts — alert_type is not part of the key.

Expand-only per ADR-007 — one additive nullable column, no change to
existing schema. EXPECTED_TABLES unchanged (column, not a table).

Note: the card says "NOT NULL server_default true", then "same as
MEH-1361". MEH-1361 shipped it NULLABLE with server_default=true, and its
header forbids tightening to NOT NULL without a separate Expand-Contract
ticket (ADR-007). This file follows MEH-1361 (nullable) — flagged to Sapir
at the gate.

# DO NOT tighten to NOT NULL or drop the server_default without a
#        separate Expand-Contract ticket (ADR-007).
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4c9a2f71b58"
# Single head on staging when authored (08/11): f2b8d4c61a07 (MEH-2782).
down_revision: Union[str, None] = "f2b8d4c61a07"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "favorite_alerts",
        sa.Column(
            "notify_new_group_buy",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("favorite_alerts", "notify_new_group_buy")
