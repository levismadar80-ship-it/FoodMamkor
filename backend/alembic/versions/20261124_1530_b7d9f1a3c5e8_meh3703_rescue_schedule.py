"""meh3703_rescue_schedule

Revision ID: b7d9f1a3c5e8
Revises: d6a8b0c2e4f5
Create Date: 2026-11-24 15:30:00.000000+00:00

MEH-3703. Expand-only (ADR-007). Approved by Sapir 24/11/2026.

- producer_locations.rescue_schedule: JSONB NULL. A pickup point's weekly
  surprise-bag routine, set once by the business:
  {"weekdays": 1..127 (Sunday = 1 … Saturday = 64, as products.available_weekdays),
   "pickup_start": "HH:MM", "pickup_end": "HH:MM" (Israel time),
   "cancel_minutes": minutes before pickup_start that a buyer may still cancel,
   "qty": 1..20, "price_agorot", "value_min_agorot", "value_max_agorot",
   "paused": bool, "skip_dates": ["YYYY-MM-DD", …]}
  The shape is validated by schemas/rescue_schedule.py RescueScheduleStored on every write;
  the CHECK here holds only that the value is an object.
- NULL = no routine, which is every existing row: nothing publishes and nothing
  reads differently.

WHY A COLUMN AND NOT A TABLE: one routine per pickup point, so it belongs on the
point. A new table would also need the EXPECTED_TABLES count in the PR-checks
workflow, which CC cannot edit (precedent c4e81b7a2f96, MEH-1889, and
f4a1e9c3b7d2, MEH-1543). The bags it makes are ordinary rescue_offers rows, so
the existing «one bag per point per day», cancel and buyer email all apply.

No backfill, no row rewritten. Downgrade drops the column (the routines are
lost; bags already published stay).

# DO NOT add a server_default or NOT NULL without a separate Expand-Contract
#        ticket (ADR-007). Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b7d9f1a3c5e8"
down_revision: Union[str, None] = "d6a8b0c2e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producer_locations",
        sa.Column("rescue_schedule", postgresql.JSONB(), nullable=True),
    )
    op.create_check_constraint(
        "producer_locations_rescue_schedule_check",
        "producer_locations",
        "rescue_schedule IS NULL OR jsonb_typeof(rescue_schedule) = 'object'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "producer_locations_rescue_schedule_check",
        "producer_locations",
        type_="check",
    )
    op.drop_column("producer_locations", "rescue_schedule")
