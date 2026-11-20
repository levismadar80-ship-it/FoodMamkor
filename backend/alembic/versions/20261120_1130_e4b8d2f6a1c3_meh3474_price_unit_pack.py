"""meh3474_price_unit_pack

Revision ID: e4b8d2f6a1c3
Revises: d7a3c5e9f1b4
Create Date: 2026-11-20 11:30:00.000000+00:00

MEH-3474. Expand-only (ADR-007): one more value for the existing
`price_unit` column, «למארז» (pack), on both tables that carry it —
`products` and the order-line snapshot `product_order_items`. No column is
added, no row changes, no backfill: every existing row already holds a value
the new CHECK still allows. Approved by Sapir 20/11 10:24Z («מאשרת את
המיגרציה»).

Downgrade narrows the CHECK back. It FAILS on purpose if any row already
uses pack — rewriting those rows to 'unit' would silently change what a
business wrote. Move them by hand first if a downgrade is ever needed.

# DO NOT change _UNITS without PRODUCT_PRICE_UNITS in
#        app/models/product_orders.py — tests/test_meh3474_pack_unit.py
#        compares the two.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4b8d2f6a1c3"
down_revision: Union[str, None] = "d7a3c5e9f1b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_UNITS = "'unit', 'kg', '100g', 'bottle', 'box', 'pack'"
_UNITS_BEFORE = "'unit', 'kg', '100g', 'bottle', 'box'"

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
