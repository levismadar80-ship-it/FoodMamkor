"""meh1543_producer_order_window

Revision ID: f4a1e9c3b7d2
Revises: d7b2f4a9c6e1
Create Date: 2026-07-26 12:00:00.000000+00:00

MEH-1543 (חלון הזמנות — chunk 1/3): adds one nullable JSONB column to
`producers` storing an optional weekly ORDER-acceptance window:

  - `order_window`  JSONB, nullable — per-day order-acceptance hours, shape
                    {"sunday": {"open": "09:00", "close": "14:00"}, ...} with
                    keys a subset of sunday..saturday (a day absent = orders
                    closed that day). Distinct from `opening_hours` (store
                    hours, MEH-102) and ProducerLocation.opening_hours
                    (pickup-point hours, MEH-1509). Validated at the API
                    boundary (schemas.ProducerUpdate: day keys, HH:MM 24h,
                    close>open -> 422) — no DB CHECK/constraint (app-layer
                    enforcement, mirroring availability_state).

Nullable with NO server_default and NO backfill: existing producer rows predate
the field and stay NULL (NULL = feature unused -> the public page renders
nothing). Expand-only per ADR-007 — one additive nullable column, no behaviour
change at the schema layer. EXPECTED_TABLES unchanged (a column, not a table).

# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f4a1e9c3b7d2"
down_revision: Union[str, None] = "d7b2f4a9c6e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "order_window",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "order_window")
