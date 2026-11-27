"""product_lead_days

Revision ID: e3b7d1f5a9c2
Revises: c5e7a9b1d3f4
Create Date: 2026-11-27 12:00:00.000000+00:00

MEH-3932 (Fischgrund bakery, 27/11): a business sets, per product, how many
days ahead it must be ordered. The pickup's Israel day must be at least
today + lead_days.

- products.lead_days: SMALLINT NULL, CHECK 1..7. Slots are offered for 14
  days, so 7 always leaves a week to pick from.

Expand-only (ADR-007): one nullable column with no default, so every
existing row reads NULL = no product rule and keeps today's behaviour;
Postgres adds it without rewriting the table. The CHECK allows NULL. The
previous container never reads it.

downgrade() drops it; every product falls back to the business's lead time.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3b7d1f5a9c2"
down_revision: Union[str, None] = "c5e7a9b1d3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("products", sa.Column("lead_days", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "products_lead_days_check",
        "products",
        "lead_days >= 1 AND lead_days <= 7",
    )


def downgrade() -> None:
    op.drop_constraint("products_lead_days_check", "products", type_="check")
    op.drop_column("products", "lead_days")
