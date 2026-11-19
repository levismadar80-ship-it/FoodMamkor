"""meh3216_business_id_number

Revision ID: e3b9d1f7a2c4
Revises: a8d2c6f4e1b7
Create Date: 2026-11-19 07:00:00.000000+00:00

MEH-3216 (on-site ordering). Additive only: one nullable column,
producer_order_settings.business_id_number — the business's «מספר עוסק או
ח״פ», shown to the buyer on the order form as distance-selling law requires.
Approved by Sapir 19/11 06:05Z.

Nine digits or NULL. The settings route normalises what she types (spaces,
dashes, a dropped leading zero) before it reaches the CHECK. Nothing reads it
until PRODUCT_ORDERS_ENABLED is set. Expand-only per ADR-007; no table added.

# DO NOT change the CHECK here without BUSINESS_ID_PATTERN in
#        app/models/product_orders.py — tests/test_meh3216_business_id.py
#        compares the two.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3b9d1f7a2c4"
down_revision: Union[str, None] = "a8d2c6f4e1b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CHECK = "business_id_number IS NULL OR business_id_number ~ '^[0-9]{9}$'"


def upgrade() -> None:
    op.add_column(
        "producer_order_settings",
        sa.Column("business_id_number", sa.String(length=9), nullable=True),
    )
    op.create_check_constraint(
        "producer_order_settings_business_id_check",
        "producer_order_settings",
        CHECK,
    )


def downgrade() -> None:
    op.drop_constraint(
        "producer_order_settings_business_id_check",
        "producer_order_settings",
        type_="check",
    )
    op.drop_column("producer_order_settings", "business_id_number")
