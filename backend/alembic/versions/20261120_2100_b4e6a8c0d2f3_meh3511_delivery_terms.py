"""meh3511_delivery_terms

Revision ID: b4e6a8c0d2f3
Revises: a3d5f7b9c1e2
Create Date: 2026-11-20 21:00:00.000000+00:00

MEH-3511. Expand-only (ADR-007): seven NULLable columns, no backfill, no row
rewritten, no constraint narrowed. A business that fills none of them reads
exactly as before.

- producers.delivery_days_min / delivery_days_max — «מגיע תוך 3–5 ימי עסקים»
  for the whole business (the default every zone inherits).
- producers.delivery_min_order — a business-wide order minimum. Before this,
  a minimum lived only on a city row (delivery_areas.min_order), so a
  nationwide business, which has no city rows, could not state one. A city's
  own min_order still wins.
- delivery_areas.delivery_days_min / delivery_days_max — the zone's delivery
  time copied onto its cities (services/delivery_zones.py, the one writer).
- delivery_areas.order_cutoff_day / order_cutoff_time — the zone's own
  «מקבלים הזמנות עד», copied the same way. NULL = the business order_window.

Downgrade drops the seven columns (data in them is lost).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b4e6a8c0d2f3"
down_revision: Union[str, None] = "a3d5f7b9c1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PRODUCER = [
    ("delivery_days_min", sa.SmallInteger),
    ("delivery_days_max", sa.SmallInteger),
    ("delivery_min_order", sa.Integer),
]
_AREA = [
    ("delivery_days_min", sa.SmallInteger),
    ("delivery_days_max", sa.SmallInteger),
    ("order_cutoff_day", lambda: sa.String(10)),
    ("order_cutoff_time", lambda: sa.String(5)),
]


def upgrade() -> None:
    for name, kind in _PRODUCER:
        op.add_column("producers", sa.Column(name, kind(), nullable=True))
    for name, kind in _AREA:
        op.add_column("delivery_areas", sa.Column(name, kind(), nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_AREA):
        op.drop_column("delivery_areas", name)
    for name, _ in reversed(_PRODUCER):
        op.drop_column("producers", name)
