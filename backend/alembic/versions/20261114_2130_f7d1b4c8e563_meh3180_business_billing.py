"""meh3180_business_billing

Revision ID: f7d1b4c8e563
Revises: e6c9a3b7d452
Create Date: 2026-11-14 21:30:00.000000+00:00

MEH-3180 (billing infrastructure, everything switched off).

1. New table `business_billing`: where a business stands in billing. One row
   per business that has left the launch default (no row = "launch").
     producer_id uuid PK, FK producers ON DELETE CASCADE
     state varchar(12) NOT NULL  launch|notice|active|page_only|unpaid (CHECK)
     state_since timestamptz NOT NULL
     price_list_version int NULL  (the list the business joined billing under)
     subscribed bool NOT NULL DEFAULT false
     created_at, updated_at timestamptz NOT NULL
   Its own table and not columns on `producers` (Sapir 14/11: the right
   design over the one with no manual step): a business's page and its
   billing account are separate things. No payment details, no personal data.
   Nothing closes a tool while `app.pricing.BILLING_PHASE` is "launch".

2. `billable_events.kind` CHECK gains `product_order` (MEH-3216: a product
   order through the site, counted when handed over). No writer yet.

Expand-only per ADR-007. EXPECTED_TABLES 51 -> 52 (pr-checks.yml; `.github/**`
is committed by a human or Claude in Chrome). Approved by Sapir 14/11/2026.

# DO NOT add a column here later — a new revision, Alembic only (MEH-267).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "f7d1b4c8e563"
down_revision: Union[str, None] = "e6c9a3b7d452"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

KIND_CHECK = "ck_billable_events_kind"
OLD_KINDS = (
    "'event_registration','experience_registration','group_buy_order','rescue_bag'"
)


def upgrade() -> None:
    op.create_table(
        "business_billing",
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state", sa.String(length=12), nullable=False),
        sa.Column("state_since", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price_list_version", sa.Integer(), nullable=True),
        sa.Column(
            "subscribed", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "state IN ('launch','notice','active','page_only','unpaid')",
            name="ck_business_billing_state",
        ),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("producer_id"),
    )
    op.drop_constraint(KIND_CHECK, "billable_events", type_="check")
    op.create_check_constraint(
        KIND_CHECK, "billable_events", f"kind IN ({OLD_KINDS},'product_order')"
    )


def downgrade() -> None:
    # Refuses while a product order is in the ledger: the old CHECK would
    # reject the row, and deleting ledger rows is never a downgrade's job.
    counted = (
        op.get_bind()
        .execute(
            sa.text("SELECT count(*) FROM billable_events WHERE kind = 'product_order'")
        )
        .scalar()
    )
    if counted:
        raise RuntimeError(
            f"MEH-3180: {counted} product-order row(s) in the ledger; "
            "the four-kind CHECK cannot be restored over them."
        )
    op.drop_constraint(KIND_CHECK, "billable_events", type_="check")
    op.create_check_constraint(KIND_CHECK, "billable_events", f"kind IN ({OLD_KINDS})")
    op.drop_table("business_billing")
