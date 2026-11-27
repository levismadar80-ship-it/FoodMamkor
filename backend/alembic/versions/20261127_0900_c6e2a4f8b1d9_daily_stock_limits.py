"""daily_stock_limits

Revision ID: c6e2a4f8b1d9
Revises: b8ee10dc69a9
Create Date: 2026-11-27 09:00:00.000000+00:00

Daily stock (Fischgrund bakery, 27/11): a business sets how many units of a
product, or of one of its sizes or flavours, can be ordered for one pickup
day.

- products.daily_limit: SMALLINT NULL, CHECK 1..999. Counted across all the
  product's variants.
- product_variants.daily_limit: SMALLINT NULL, CHECK 1..999. Counted for that
  variant alone.

Expand-only (ADR-007): two nullable columns with no default, so every
existing row reads NULL = no limit and keeps today's behaviour; Postgres adds
them without rewriting either table. The CHECKs allow NULL. The previous
container never reads them. Approved by Sapir 27/11 (decision card).

downgrade() drops both; every product falls back to no daily limit.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c6e2a4f8b1d9"
down_revision: Union[str, None] = "b8ee10dc69a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "products", sa.Column("daily_limit", sa.SmallInteger(), nullable=True)
    )
    op.create_check_constraint(
        "products_daily_limit_check",
        "products",
        "daily_limit >= 1 AND daily_limit <= 999",
    )
    op.add_column(
        "product_variants", sa.Column("daily_limit", sa.SmallInteger(), nullable=True)
    )
    op.create_check_constraint(
        "product_variants_daily_limit_check",
        "product_variants",
        "daily_limit >= 1 AND daily_limit <= 999",
    )


def downgrade() -> None:
    op.drop_constraint(
        "product_variants_daily_limit_check", "product_variants", type_="check"
    )
    op.drop_column("product_variants", "daily_limit")
    op.drop_constraint("products_daily_limit_check", "products", type_="check")
    op.drop_column("products", "daily_limit")
