"""meh3179_billable_events

Revision ID: d5b8f2a6c341
Revises: c3e7a1f5d829
Create Date: 2026-11-14 17:00:00.000000+00:00

MEH-3179 (subscription infrastructure, stage 1 — no charging): one new table,
`billable_events` — the ledger of bookings a business got through the site
(a registration for an event or an experience, a participant's order in a
fulfilled group buy, a collected rescue bag). ADR-042 bills, later, from a
monthly count of these; the bookings themselves are purged (registrations,
30 days after the item's date) or cascade away, so the count needs its own
table. No personal data: the business, the kind, the source row's id and
amounts in agorot.

  - `source_id` is deliberately NOT a foreign key (it must outlive its row).
  - UNIQUE (kind, source_id): a booking is counted once.
  - `producer_id` FK ON DELETE CASCADE: deleting a business removes its rows.

Expand-only per ADR-007 — a new table, no change to an existing one.
EXPECTED_TABLES 50 -> 51 (pr-checks.yml; `.github/**` is committed by a human
or Claude in Chrome, see the PR body).

# DO NOT add a column here later — a new revision, Alembic only (MEH-267).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "d5b8f2a6c341"
# Single head on staging when authored (14/11): c3e7a1f5d829 (MEH-3117).
down_revision: Union[str, None] = "c3e7a1f5d829"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "billable_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("base_amount_agorot", sa.BigInteger(), nullable=False),
        sa.Column("fee_agorot", sa.BigInteger(), nullable=False),
        sa.Column("price_list_version", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "kind IN ('event_registration','experience_registration',"
            "'group_buy_order','rescue_bag')",
            name="ck_billable_events_kind",
        ),
        sa.CheckConstraint(
            "status IN ('counted','voided')", name="ck_billable_events_status"
        ),
        sa.CheckConstraint("quantity >= 1", name="ck_billable_events_quantity"),
        sa.CheckConstraint(
            "base_amount_agorot >= 0 AND fee_agorot >= 0",
            name="ck_billable_events_amounts",
        ),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", "source_id", name="uq_billable_events_kind_source"),
    )
    op.create_index(
        "ix_billable_events_producer_occurred",
        "billable_events",
        ["producer_id", "occurred_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_billable_events_producer_occurred", table_name="billable_events")
    op.drop_table("billable_events")
