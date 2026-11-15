"""meh3035_producer_payment_info

Revision ID: e3a5c1d7f904
Revises: a7f3c2e94d18
Create Date: 2026-11-13 15:00:00.000000+00:00

MEH-3035 (איך משלמים — chunk 1/3): adds one nullable JSONB column to
`producers` describing how the business takes payment:

  - `payment_info`  JSONB, nullable — {"methods": [...], "timing": str|None,
                    "note": str|None}. `methods` is a subset of
                    bit / paybox / bank_transfer / cash / credit_card,
                    `timing` one of advance / on_pickup / deposit, `note` one
                    optional free line ≤ 80 chars. Validated at the API boundary
                    (schemas._payment_info_validator → 422 Hebrew); no DB CHECK,
                    app-layer enforcement mirroring order_window (f4a1e9c3b7d2).

Nullable with NO server_default and NO backfill: existing rows stay NULL
(NULL = the business said nothing → the page renders nothing). Expand-only per
ADR-007 — one additive nullable column, no behaviour change at the schema
layer. EXPECTED_TABLES unchanged (a column, not a table).

# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "e3a5c1d7f904"
down_revision: Union[str, None] = "a7f3c2e94d18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "payment_info",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "payment_info")
