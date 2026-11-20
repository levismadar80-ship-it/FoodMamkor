"""meh3484_delivery_zones

Revision ID: f2c6a8e4b0d7
Revises: e4b8d2f6a1c3
Create Date: 2026-11-20 15:00:00.000000+00:00

MEH-3484. Expand-only (ADR-007): four NULLable columns, no backfill, no row
rewritten, no constraint narrowed.

- producers.delivery_zones (JSONB) — the business's named zones: name, days,
  minimum, fee, free-delivery threshold. Same JSONB-on-producer shape as
  producers.product_groups (MEH-3055): a short owner-edited list, written
  whole by one PUT. Not a table on purpose: a table would also bump the
  EXPECTED_TABLES gate in .github/workflows (Sapir-only), for a list capped
  at a few dozen entries.
- delivery_areas.zone_name — which zone the city belongs to (membership lives
  here, once).
- delivery_areas.delivery_days — several days per city. `delivery_day` STAYS
  and keeps being written (the first day), so every reader that knows only
  the single column answers as before. NULL here = read `delivery_day`.
- delivery_areas.free_delivery_above — the zone's threshold copied onto its
  cities. NULL = the business-level producers.free_delivery_above applies.

Approved with the MEH-3484 work («כן תתקן הכל», Sapir 20/11).

Downgrade drops the four columns (data in them is lost; delivery_day and the
per-city min/fee, which the zone values are copied into, survive).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

# revision identifiers, used by Alembic.
revision: str = "f2c6a8e4b0d7"
down_revision: Union[str, None] = "e4b8d2f6a1c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("producers", sa.Column("delivery_zones", JSONB, nullable=True))
    op.add_column(
        "delivery_areas", sa.Column("zone_name", sa.String(40), nullable=True)
    )
    op.add_column(
        "delivery_areas",
        sa.Column("delivery_days", ARRAY(sa.String(10)), nullable=True),
    )
    op.add_column(
        "delivery_areas",
        sa.Column("free_delivery_above", sa.Integer, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("delivery_areas", "free_delivery_above")
    op.drop_column("delivery_areas", "delivery_days")
    op.drop_column("delivery_areas", "zone_name")
    op.drop_column("producers", "delivery_zones")
