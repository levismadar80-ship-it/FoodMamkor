"""MEH-283 — add producers.rejection_reason

Adds the missing `rejection_reason` column on the `producers` table.

Why: auth.py::get_me reads `producer.rejection_reason` (wired in MEH-206) to
surface the admin reject note on the consumer side. The column was never
added to the ORM model, never added to _migrate_columns, and therefore was
missing from the Alembic baseline. Every /auth/me call for a user with a
producer_id raised AttributeError → 500. MEH-267 removing _migrate_columns
didn't cause this; it just stopped masking other drift.

Safe on populated DBs: nullable, no default, no backfill required.

Revision ID: b2e8f947c316
Revises: ef8fb1858f5b
Create Date: 2026-04-24 19:00:00.000000+00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b2e8f947c316'
down_revision: Union[str, None] = 'ef8fb1858f5b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('rejection_reason', sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'rejection_reason')
