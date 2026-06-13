"""meh296_contact_channels

Revision ID: 7346235e318b
Revises: c1d2e3f4a5b6
Create Date: 2026-06-13 09:15:00.000000+00:00

MEH-296 Chunk 1: two nullable contact channels on `producers`:
  - facebook            VARCHAR(200)  — mirrors `website`; FB page/Messenger link.
  - external_order_form VARCHAR(500)  — backs primary_contact_method="external_order"
                        (Etsy/order-form URL); 500 wide for long URLs.

Expand-only (ADR-007): additive nullable, no backfill, no behavior change.
Table count unchanged (36). Alembic is the sole schema authority (MEH-267) —
no _migrate_columns / main.py edits. The matching models.py columns +
schema fields + boundary validators land in the same PR so CI `alembic
check` (MEH-492) stays green.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "7346235e318b"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("facebook", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("external_order_form", sa.String(length=500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "external_order_form")
    op.drop_column("producers", "facebook")
