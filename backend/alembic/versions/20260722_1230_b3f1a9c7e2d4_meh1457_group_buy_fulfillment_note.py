"""meh1457_group_buy_fulfillment_note

Revision ID: b3f1a9c7e2d4
Revises: c5d9f3a1b2e8
Create Date: 2026-07-22 12:30:00.000000+00:00

MEH-1457 (group-buy clarity — "מתי ואיך מקבלים"): adds a single nullable
free-text column to `group_buys`:

  - `fulfillment_note`  TEXT, nullable — the producer's free-text answer to
                        "מתי ואיך מקבלים את המוצרים?" (Open Food Network
                        "Ready for" precedent). Optional; NULL when the
                        producer leaves it blank, and the public page hides
                        the line entirely when NULL.

Deliberately NO server_default and NO backfill: existing rows stay NULL and
the public "איסוף ומשלוח:" line renders ONLY when a producer actually fills
it in — an honest signal, not a placeholder on every legacy group.

Expand-only per ADR-007 — one additive nullable column, no behavior change
at the schema layer. EXPECTED_TABLES unchanged (column, not a table).

# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b3f1a9c7e2d4"
# MEH-1457: chains onto the current head c5d9f3a1b2e8 (MEH-1438 product_is_vegetarian).
down_revision: Union[str, None] = "c5d9f3a1b2e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "group_buys",
        sa.Column("fulfillment_note", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("group_buys", "fulfillment_note")
