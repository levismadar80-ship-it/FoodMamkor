"""meh2621_group_buy_pickup_delivery_notes

Revision ID: e4b7c1a9d2f6
Revises: 9c534d477f2b
Create Date: 2026-10-30 23:00:00.000000+00:00

MEH-2621 (chunk 1 of the MEH-2615 split): the business's one free-text
answer «מתי ואיך מקבלים» (`group_buys.fulfillment_note`, MEH-1457) becomes
two answers, pickup and delivery, so the public page can show them as two
separate rows.

Expand-only per ADR-007: two new nullable Text columns, no default, no
backfill. `fulfillment_note` is NOT touched — rows created before this keep
it and the page keeps showing it; the previous container never reads the
new columns. A free-text note cannot be split mechanically into its pickup
and delivery halves, so there is nothing to backfill. A later contract step
may drop `fulfillment_note` once no live row depends on it.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops both columns — any pickup/delivery text written since is
lost; rows created with only those fields are left with no fulfillment text
at all, which the page already tolerates (it hides the section).

Chained on 9c534d477f2b (MEH-2556, staging head on 30/10), so `alembic
heads` stays at one head.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4b7c1a9d2f6"
down_revision: Union[str, None] = "9c534d477f2b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("group_buys", sa.Column("pickup_note", sa.Text(), nullable=True))
    op.add_column("group_buys", sa.Column("delivery_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("group_buys", "delivery_note")
    op.drop_column("group_buys", "pickup_note")
