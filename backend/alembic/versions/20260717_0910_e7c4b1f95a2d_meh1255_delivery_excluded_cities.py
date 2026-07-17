"""meh1255_delivery_excluded_cities

Revision ID: e7c4b1f95a2d
Revises: d4e7a92c81b5
Create Date: 2026-07-17 09:10:00.000000+00:00

MEH-1255: delivery-exclusion mode ("משלוחים לכל הארץ חוץ מ:") — one new
column on `producers`:

- `delivery_excluded_cities` (TEXT[], NOT NULL, DEFAULT '{}') — cities a
  nationwide-delivery producer does NOT ship to (ShipperHQ include/exclude
  zone model). Only meaningful when `delivery_nationwide = true`.

Plus one CHECK constraint:

- `delivery_excluded_requires_nationwide` —
  `delivery_nationwide OR delivery_excluded_cities = '{}'::text[]`
  An exclusion list without nationwide mode is contradictory (the sibling
  of `delivery_nationwide_xor_cities`, f9a2c7d41b83). The column is
  NOT NULL, so the equality form is NULL-free — no `array_length()`
  three-valued-logic edge.

Expand-only (ADR-007): ADD COLUMN with a server default backfills existing
rows to '{}' in-place; no data migration, no dual-write. Unlike
f9a2c7d41b83 no `DO $$` idempotency guard is needed — the column is new,
so the constraint cannot pre-exist on prod/staging.

No new table → EXPECTED_TABLES in the CI workflow is unchanged.

# DO NOT write to this column unless delivery_nationwide is true —
#        enforced by the DB CHECK + ProducerUpdate validator (MEH-1255).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = 'e7c4b1f95a2d'
down_revision: Union[str, None] = 'd4e7a92c81b5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column(
            'delivery_excluded_cities',
            ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
    )
    op.create_check_constraint(
        'delivery_excluded_requires_nationwide',
        'producers',
        "delivery_nationwide OR delivery_excluded_cities = '{}'::text[]",
    )


def downgrade() -> None:
    op.drop_constraint(
        'delivery_excluded_requires_nationwide', 'producers', type_='check'
    )
    op.drop_column('producers', 'delivery_excluded_cities')
