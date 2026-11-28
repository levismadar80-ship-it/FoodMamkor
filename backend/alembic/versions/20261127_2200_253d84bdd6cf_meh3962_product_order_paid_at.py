"""product_orders.paid_at

Revision ID: 253d84bdd6cf
Revises: a4c8e2f6b0d1
Create Date: 2026-11-27 22:00:00.000000+00:00

MEH-3962: the business marks that the buyer paid it (Bit, PayBox, cash),
so it can see who still owes and send a reminder.

- product_orders.paid_at: DateTime NULL. NULL = not marked as paid.

Expand-only (ADR-007): one nullable column with no default, so every
existing order reads NULL = not marked; Postgres adds it without rewriting
the table, and the previous container never reads it.

Not a widening of `payment_status`: that column says how money moves (today
always straight to the business) and is kept for on-site payment later.
Whether the business got the money is a separate fact.

downgrade() drops the column: the marks are lost, nothing else changes.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "253d84bdd6cf"
down_revision: Union[str, None] = "a4c8e2f6b0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("product_orders", sa.Column("paid_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("product_orders", "paid_at")
