"""meh3208_ledger_outlives_business

Revision ID: e6c9a3b7d452
Revises: d5b8f2a6c341
Create Date: 2026-11-14 21:00:00.000000+00:00

MEH-3208: deleting a business deleted its `billable_events` rows
(`producer_id` ON DELETE CASCADE). Those rows are the record of what a
business was, or would be, billed, and bookkeeping records are kept seven
years from the end of the tax year. From this revision the rows stay:

  - new column `producer_ref` (uuid, NOT NULL, no foreign key): the business
    id, kept after the business is gone. Backfilled from `producer_id`.
  - `producer_id` becomes nullable and its foreign key ON DELETE SET NULL.

The table holds no personal data, so nothing here keeps a deleted person's
details. No row is deleted by this revision or by any job.

Approved by Sapir 14/11/2026 20:48Z-20:49Z (thread «מודל עסקי ותמחור מנוי»).
Adds no table: EXPECTED_TABLES unchanged.

Downgrade restores CASCADE and drops `producer_ref`. Rows whose business was
already deleted are KEPT with a NULL `producer_id` (the column stays
nullable): a downgrade must not be the thing that erases the ledger.

# DO NOT add a column here later — a new revision, Alembic only (MEH-267).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e6c9a3b7d452"
down_revision: Union[str, None] = "d5b8f2a6c341"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK = "billable_events_producer_id_fkey"


def upgrade() -> None:
    op.add_column(
        "billable_events",
        sa.Column("producer_ref", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        "UPDATE billable_events SET producer_ref = producer_id "
        "WHERE producer_ref IS NULL"
    )
    op.alter_column("billable_events", "producer_ref", nullable=False)
    op.alter_column("billable_events", "producer_id", nullable=True)
    op.drop_constraint(FK, "billable_events", type_="foreignkey")
    op.create_foreign_key(
        FK,
        "billable_events",
        "producers",
        ["producer_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(FK, "billable_events", type_="foreignkey")
    op.create_foreign_key(
        FK,
        "billable_events",
        "producers",
        ["producer_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_column("billable_events", "producer_ref")
