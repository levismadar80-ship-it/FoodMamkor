"""meh2936_price_unit_bottle_box

Revision ID: c7e2a9d4f1b8
Revises: f2c8a4d6e9b1
Create Date: 2026-11-19 14:00:00.000000+00:00

MEH-2936. Expand-only (ADR-007): two more values for the existing
`price_unit` column, «לבקבוק» (bottle) and «לארגז» (box), on both tables
that carry it — `products` and the order-line snapshot
`product_order_items`. No column is added, no row changes, no backfill:
every existing row is already 'unit' / 'kg' / '100g', which the new CHECK
still allows. Approved by Sapir 19/11 13:00Z (plan option א: widen the one
column instead of a second «unit» column).

Downgrade narrows the CHECK back. It FAILS on purpose if any row already
uses bottle/box — rewriting those rows to 'unit' would silently change what
a business wrote. Move them by hand first if a downgrade is ever needed.

# DO NOT change _UNITS without PRODUCT_PRICE_UNITS in
#        app/models/product_orders.py — tests/test_meh2936_product_unit.py
#        compares the two.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7e2a9d4f1b8"
down_revision: Union[str, None] = "f2c8a4d6e9b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UNITS = "'unit', 'kg', '100g', 'bottle', 'box'"
_UNITS_BEFORE = "'unit', 'kg', '100g'"

_CHECKS = (
    ("products_price_unit_check", "products"),
    ("product_order_items_price_unit_check", "product_order_items"),
)


def upgrade() -> None:
    for name, table in _CHECKS:
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"price_unit IN ({_UNITS})")


def downgrade() -> None:
    for name, table in _CHECKS:
        op.drop_constraint(name, table, type_="check")
        op.create_check_constraint(name, table, f"price_unit IN ({_UNITS_BEFORE})")
