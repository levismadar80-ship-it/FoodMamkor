"""meh_530_add_producer_license_number

Revision ID: e8a3c4b5d791
Revises: 80bbf0a24874
Create Date: 2026-05-15 18:31:47.023944+00:00

MEH-530: adds `producers.producer_license_number` (VARCHAR(20), nullable).

The column is intentionally `nullable=True` at the DB level so existing
producer rows are not broken — the conditional requirement (license is
mandatory only when at least one selected category is in the
LICENSE_REQUIRED_CATEGORIES tuple) is enforced at the application
layer (Pydantic format check + router-level
`ensure_license_for_categories` helper). Don't tighten this column to
NOT NULL without a separate backfill migration.

# DO NOT widen this column or change nullability without an explicit MEH ticket —
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8a3c4b5d791'
down_revision: Union[str, None] = '80bbf0a24874'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('producer_license_number', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'producer_license_number')
