"""meh3263_order_route

Revision ID: f7c1a5e9b3d2
Revises: e6b9d4f1a2c7
Create Date: 2026-11-14 23:30:00.000000+00:00

MEH-3263 (stage 2b of MEH-3216, on-site ordering). Additive only:

  - new table product_order_phone_codes: the one-time code a buyer's phone is
    verified with (HMAC of the code, expiry, wrong-try counter).
  - seven nullable columns on product_orders: status_token_hash,
    idempotency_key, delivery_city, and the proposed-change columns
    (proposed_slot_start, proposed_slot_end, proposed_total_agorot,
    proposal_note).
  - three partial UNIQUE indexes on product_orders: the pickup code among a
    business's confirmed/ready orders, the idempotency key, the status token.

product_orders is new in d5a7c3e9f1b4 and has no rows on any environment.
Nothing reads any of this until PRODUCT_ORDERS_ENABLED is set.

Expand-only per ADR-007. EXPECTED_TABLES +1.

# DO NOT edit the partial-index predicates here without the matching
#        constants in app/models/product_orders.py —
#        tests/test_meh3263_order_route.py compares the two.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "f7c1a5e9b3d2"
down_revision: Union[str, None] = "e6b9d4f1a2c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_NEW_ORDER_COLUMNS = (
    sa.Column("status_token_hash", sa.CHAR(length=64), nullable=True),
    sa.Column("idempotency_key", sa.String(length=64), nullable=True),
    sa.Column("delivery_city", sa.String(length=100), nullable=True),
    sa.Column("proposed_slot_start", sa.DateTime(), nullable=True),
    sa.Column("proposed_slot_end", sa.DateTime(), nullable=True),
    sa.Column("proposed_total_agorot", sa.Integer(), nullable=True),
    sa.Column("proposal_note", sa.Text(), nullable=True),
)


def upgrade() -> None:
    for column in _NEW_ORDER_COLUMNS:
        op.add_column("product_orders", column.copy())
    op.create_index(
        "uq_product_orders_open_pickup_code",
        "product_orders",
        ["producer_id", "pickup_code"],
        unique=True,
        postgresql_where=sa.text("status IN ('confirmed', 'ready')"),
    )
    op.create_index(
        "uq_product_orders_idempotency_key",
        "product_orders",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index(
        "uq_product_orders_status_token_hash",
        "product_orders",
        ["status_token_hash"],
        unique=True,
        postgresql_where=sa.text("status_token_hash IS NOT NULL"),
    )

    op.create_table(
        "product_order_phone_codes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone", sa.String(length=20), nullable=False),
        sa.Column("code_hash", sa.CHAR(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column(
            "attempts", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_product_order_phone_codes_phone_created",
        "product_order_phone_codes",
        ["phone", "created_at"],
    )
    op.create_index(
        "ix_product_order_phone_codes_created_at",
        "product_order_phone_codes",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_product_order_phone_codes_created_at",
        table_name="product_order_phone_codes",
    )
    op.drop_index(
        "ix_product_order_phone_codes_phone_created",
        table_name="product_order_phone_codes",
    )
    op.drop_table("product_order_phone_codes")
    op.drop_index("uq_product_orders_status_token_hash", table_name="product_orders")
    op.drop_index("uq_product_orders_idempotency_key", table_name="product_orders")
    op.drop_index("uq_product_orders_open_pickup_code", table_name="product_orders")
    for column in reversed(_NEW_ORDER_COLUMNS):
        op.drop_column("product_orders", column.name)
