"""meh3218_product_orders

Revision ID: d5a7c3e9f1b4
Revises: f7d1b4c8e563
Create Date: 2026-11-14 21:30:00.000000+00:00

MEH-3218 (stage 1 of MEH-3216, on-site ordering «בקשת הזמנה»). Additive only:

  - four new tables: producer_order_settings, product_orders,
    product_order_items, product_order_events
  - four new columns on `products`, each NOT NULL with a server default so
    existing rows are filled by the database, with no backfill script:
      price_unit        VARCHAR(10)  default 'unit'  (+ CHECK unit/kg/100g)
      is_orderable      BOOLEAN      default true
      in_stock          BOOLEAN      default true
      contains_alcohol  BOOLEAN      default false

No existing column, constraint or index is changed. Nothing reads these until
PRODUCT_ORDERS_ENABLED is set, and every route answers 404 while it is off.

The product PRICE gets no new column: `price_min == price_max` is the exact
price, a real range means the final price is set at confirmation.

Expand-only per ADR-007. EXPECTED_TABLES 50 -> 54 (four tables).
Awaiting Sapir's OK before merge (rule 38: an Alembic revision waits for her).

# DO NOT edit the CHECK literals here without the matching tuple in
#        app/models/product_orders.py — tests/test_meh3218_product_orders.py
#        compares the two. Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d5a7c3e9f1b4"
# Single head on staging when authored (14/11): f7d1b4c8e563 (MEH-2642).
down_revision: Union[str, None] = "f7d1b4c8e563"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_STATUSES = (
    "'pending', 'confirmed', 'change_proposed', 'ready', 'handed', "
    "'declined', 'cancelled', 'expired', 'no_show'"
)
_UNITS = "'unit', 'kg', '100g'"


def _uuid() -> postgresql.UUID:
    return postgresql.UUID(as_uuid=True)


def _flag(name: str, default: str) -> sa.Column:
    return sa.Column(
        name, sa.Boolean(), nullable=False, server_default=sa.text(default)
    )


def upgrade() -> None:
    # --- products: four additive columns ------------------------------------
    op.add_column(
        "products",
        sa.Column(
            "price_unit",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'unit'"),
        ),
    )
    op.add_column("products", _flag("is_orderable", "true"))
    op.add_column("products", _flag("in_stock", "true"))
    op.add_column("products", _flag("contains_alcohol", "false"))
    op.create_check_constraint(
        "products_price_unit_check", "products", f"price_unit IN ({_UNITS})"
    )

    # --- producer_order_settings ---------------------------------------------
    op.create_table(
        "producer_order_settings",
        sa.Column("producer_id", _uuid(), nullable=False),
        _flag("enabled", "false"),
        _flag("auto_confirm", "false"),
        sa.Column("auto_confirm_slot_cap", sa.Integer(), nullable=True),
        sa.Column(
            "cancel_cutoff_hours",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("24"),
        ),
        _flag("shabbat_observant", "false"),
        sa.Column("min_order_agorot", sa.Integer(), nullable=True),
        _flag("alcohol_licensed", "false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("producer_id"),
        sa.CheckConstraint(
            "cancel_cutoff_hours >= 0 AND cancel_cutoff_hours <= 168",
            name="producer_order_settings_cutoff_check",
        ),
        sa.CheckConstraint(
            "auto_confirm_slot_cap IS NULL OR auto_confirm_slot_cap >= 1",
            name="producer_order_settings_slot_cap_check",
        ),
        sa.CheckConstraint(
            "min_order_agorot IS NULL OR min_order_agorot >= 0",
            name="producer_order_settings_min_order_check",
        ),
    )

    # --- product_orders -------------------------------------------------------
    op.create_table(
        "product_orders",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("producer_id", _uuid(), nullable=False),
        sa.Column("user_id", _uuid(), nullable=True),
        sa.Column("customer_name", sa.String(length=120), nullable=False),
        sa.Column("customer_phone", sa.String(length=20), nullable=False),
        sa.Column("fulfilment", sa.String(length=10), nullable=False),
        sa.Column("delivery_address", sa.Text(), nullable=True),
        sa.Column("slot_start", sa.DateTime(), nullable=False),
        sa.Column("slot_end", sa.DateTime(), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("estimated_total_agorot", sa.Integer(), nullable=False),
        sa.Column("final_total_agorot", sa.Integer(), nullable=True),
        sa.Column(
            "delivery_fee_agorot",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'pending'"),
        ),
        sa.Column(
            "payment_status",
            sa.String(length=30),
            nullable=False,
            server_default=sa.text("'direct_to_business'"),
        ),
        sa.Column("pickup_code", sa.CHAR(length=4), nullable=True),
        _flag("age_declared", "false"),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("handed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            f"status IN ({_STATUSES})", name="product_orders_status_check"
        ),
        sa.CheckConstraint(
            "fulfilment IN ('pickup', 'delivery')",
            name="product_orders_fulfilment_check",
        ),
        sa.CheckConstraint(
            "payment_status IN ('direct_to_business')",
            name="product_orders_payment_status_check",
        ),
        sa.CheckConstraint(
            "estimated_total_agorot >= 0 AND delivery_fee_agorot >= 0 AND "
            "(final_total_agorot IS NULL OR final_total_agorot >= 0)",
            name="product_orders_amounts_check",
        ),
        sa.CheckConstraint("slot_end > slot_start", name="product_orders_slot_check"),
        sa.CheckConstraint(
            "pickup_code IS NULL OR pickup_code ~ '^[0-9]{4}$'",
            name="product_orders_pickup_code_check",
        ),
    )
    op.create_index(
        "ix_product_orders_producer_status",
        "product_orders",
        ["producer_id", "status"],
    )
    op.create_index("ix_product_orders_user_id", "product_orders", ["user_id"])
    op.create_index(
        "ix_product_orders_customer_phone", "product_orders", ["customer_phone"]
    )
    # The two reads every later stage makes: "which orders ran out of time"
    # (the expiry sweep) and "this business's orders for a day" (its inbox).
    op.create_index("ix_product_orders_expires_at", "product_orders", ["expires_at"])
    op.create_index(
        "ix_product_orders_producer_slot",
        "product_orders",
        ["producer_id", "slot_start"],
    )

    # --- product_order_items --------------------------------------------------
    op.create_table(
        "product_order_items",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("order_id", _uuid(), nullable=False),
        sa.Column("product_id", _uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unit_price_agorot", sa.Integer(), nullable=False),
        _flag("price_is_estimate", "false"),
        sa.Column(
            "price_unit",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'unit'"),
        ),
        sa.Column("qty", sa.Integer(), nullable=False),
        _flag("contains_alcohol", "false"),
        sa.ForeignKeyConstraint(
            ["order_id"], ["product_orders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "qty >= 1 AND qty <= 99", name="product_order_items_qty_check"
        ),
        sa.CheckConstraint(
            "unit_price_agorot >= 0", name="product_order_items_price_check"
        ),
        sa.CheckConstraint(
            f"price_unit IN ({_UNITS})",
            name="product_order_items_price_unit_check",
        ),
    )
    op.create_index(
        "ix_product_order_items_order_id", "product_order_items", ["order_id"]
    )
    # Deleting a product SET-NULLs its lines; without this that is a full scan.
    op.create_index(
        "ix_product_order_items_product_id", "product_order_items", ["product_id"]
    )

    # --- product_order_events -------------------------------------------------
    op.create_table(
        "product_order_events",
        sa.Column("id", _uuid(), nullable=False),
        sa.Column("order_id", _uuid(), nullable=False),
        sa.Column("from_status", sa.String(length=20), nullable=True),
        sa.Column("to_status", sa.String(length=20), nullable=False),
        sa.Column("actor", sa.String(length=10), nullable=False),
        sa.Column("actor_user_id", _uuid(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["order_id"], ["product_orders.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            f"to_status IN ({_STATUSES})",
            name="product_order_events_to_status_check",
        ),
        sa.CheckConstraint(
            "actor IN ('customer', 'business', 'admin', 'system')",
            name="product_order_events_actor_check",
        ),
    )
    op.create_index(
        "ix_product_order_events_order_id", "product_order_events", ["order_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_product_order_events_order_id", table_name="product_order_events")
    op.drop_table("product_order_events")
    op.drop_index("ix_product_order_items_product_id", table_name="product_order_items")
    op.drop_index("ix_product_order_items_order_id", table_name="product_order_items")
    op.drop_table("product_order_items")
    op.drop_index("ix_product_orders_producer_slot", table_name="product_orders")
    op.drop_index("ix_product_orders_expires_at", table_name="product_orders")
    op.drop_index("ix_product_orders_customer_phone", table_name="product_orders")
    op.drop_index("ix_product_orders_user_id", table_name="product_orders")
    op.drop_index("ix_product_orders_producer_status", table_name="product_orders")
    op.drop_table("product_orders")
    op.drop_table("producer_order_settings")
    op.drop_constraint("products_price_unit_check", "products", type_="check")
    op.drop_column("products", "contains_alcohol")
    op.drop_column("products", "in_stock")
    op.drop_column("products", "is_orderable")
    op.drop_column("products", "price_unit")
