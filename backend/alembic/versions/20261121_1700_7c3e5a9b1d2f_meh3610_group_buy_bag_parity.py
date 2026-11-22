"""meh3610_group_buy_bag_parity

Revision ID: 7c3e5a9b1d2f
Revises: 40e9fd2c1b3a
Create Date: 2026-11-21 17:00:00.000000+00:00

MEH-3610 (Sapir approved 21/11: «מאשרת» for allergens, «כן, שתיהן» for the
branch and the reminder). Expand-only (ADR-007): three NULLable columns and
one index, no backfill, no row rewritten. A group buy that sets none of them
reads as before.

- group_buys.allergens — the 14+1 allergen codes the business declares, as a
  rescue bag does (rescue_typical_items.allergens, MEH-2752). NULL = not
  declared; [] never persists (app/allergens.normalize_allergens).
- group_buys.pickup_location_id — the branch people pick up from
  (producer_locations). ON DELETE SET NULL: a deleted branch leaves the group
  with its free-text pickup note, never a dead reference.
- group_buys.pickup_reminder_sent_at — one-way stamp of the «האיסוף מחר»
  email, so the daily job mails each group once.

No table added: EXPECTED_TABLES unchanged. Downgrade drops all three.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "7c3e5a9b1d2f"
down_revision: Union[str, None] = "40e9fd2c1b3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "group_buys",
        sa.Column("allergens", postgresql.ARRAY(sa.Text()), nullable=True),
    )
    op.add_column(
        "group_buys",
        sa.Column("pickup_location_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "group_buys_pickup_location_id_fkey",
        "group_buys",
        "producer_locations",
        ["pickup_location_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_group_buys_pickup_location_id", "group_buys", ["pickup_location_id"]
    )
    op.add_column(
        "group_buys",
        sa.Column("pickup_reminder_sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("group_buys", "pickup_reminder_sent_at")
    op.drop_index("ix_group_buys_pickup_location_id", table_name="group_buys")
    op.drop_constraint(
        "group_buys_pickup_location_id_fkey", "group_buys", type_="foreignkey"
    )
    op.drop_column("group_buys", "pickup_location_id")
    op.drop_column("group_buys", "allergens")
