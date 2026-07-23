"""meh1361_notify_new_recipe

Revision ID: c8f3a6d1e9b2
Revises: f7d2a9c4b1e8
Create Date: 2026-07-20 12:00:00.000000+00:00

MEH-1361 (new_recipe favorite alert): adds a single nullable Boolean to
`favorite_alerts`:

  - `notify_new_recipe`  BOOLEAN, nullable, server_default=true — the 4th
    alert-type preference, mirroring the three sibling columns
    (notify_new_product / notify_new_event / notify_delivery_area, all
    ORM default=True). server_default=true opts EXISTING rows in without
    a backfill script — consistent with the siblings' opt-out model; new
    rows always receive an explicit value from AlertPrefsIn.

Fired from admin_recipes.approve_recipe on the false→true `published`
transition (the single publicly-visible flip path). The MEH-1338
per-(user, producer, channel) 24h cap applies automatically via
fire_alerts — alert_type is not part of the cap key.

Expand-only per ADR-007 — one additive nullable column, no change to
existing schema. EXPECTED_TABLES unchanged (column, not a table).

# DO NOT tighten to NOT NULL or drop the server_default without a
#        separate Expand-Contract ticket (ADR-007).
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c8f3a6d1e9b2"
# MEH-1361: chains onto f7d2a9c4b1e8 (MEH-1335 owner story fields), which
# landed on staging after CC authored this file against d4b8f1c7e903 —
# down_revision updated by Sapir at commit time to keep a single head.
down_revision: Union[str, None] = "f7d2a9c4b1e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "favorite_alerts",
        sa.Column(
            "notify_new_recipe",
            sa.Boolean(),
            nullable=True,
            server_default=sa.text("true"),
        ),
    )


def downgrade() -> None:
    op.drop_column("favorite_alerts", "notify_new_recipe")
