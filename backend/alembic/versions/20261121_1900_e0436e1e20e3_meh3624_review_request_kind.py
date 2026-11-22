"""meh3624_review_request_kind

Revision ID: e0436e1e20e3
Revises: d6a8c0e2f4b5
Create Date: 2026-11-21 19:00:00.000000+00:00

MEH-3624: an order owes the buyer one more message, the «איך היה?» email a
day after the hand-over. The kind CHECK on product_order_notifications gains
`review_request`. Expand-only per ADR-007: every existing row keeps a kind the
wider CHECK still allows, and the old code never writes the new value, so the
two can write side by side during the deploy (rows fall due 24 h later, so the
old dispatcher never meets one during a normal overlap). No table added or
dropped.

ROLLBACK: the pre-MEH-3624 dispatcher sends any unknown buyer kind as the
«closed» WhatsApp. Rolling the backend back past this release without the
schema downgrade must first close the owed rows — docs/release/ROLLBACK.md §2b.

Downgrade deletes the `review_request` rows first: the narrower CHECK would
reject them otherwise. They are one email each, already sent or skipped.

# DO NOT edit KINDS here without PRODUCT_ORDER_NOTICE_KINDS in
#        app/models/product_orders.py — tests/test_meh3296_order_notifications.py
#        compares the two against the newest revision that defines KINDS.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e0436e1e20e3"
down_revision: Union[str, None] = "d6a8c0e2f4b5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KINDS = (
    "new_order",
    "business_reminder",
    "confirmed",
    "change_proposed",
    "closed",
    "buyer_cancelled",
    "day_before",
    "review_request",
)
NAME = "product_order_notifications_kind_check"
TABLE = "product_order_notifications"


def _check_in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.drop_constraint(NAME, TABLE, type_="check")
    op.create_check_constraint(NAME, TABLE, _check_in("kind", KINDS))


def downgrade() -> None:
    op.execute(f"DELETE FROM {TABLE} WHERE kind = 'review_request'")
    op.drop_constraint(NAME, TABLE, type_="check")
    op.create_check_constraint(NAME, TABLE, _check_in("kind", KINDS[:-1]))
