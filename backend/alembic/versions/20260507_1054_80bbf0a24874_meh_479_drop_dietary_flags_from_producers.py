"""MEH-479 — drop legacy dietary columns from producers (close MEH-293)

Removes producers.gluten_free / producers.vegan / producers.lactose_free
after the MEH-293 7-day overlap. Per-product is_X flags (introduced in
MEH-293 PR #1, revision 1afe844d11f4) are now the canonical source;
ProducerListOut.has_X_products aggregation is wired through
attach_badge_fields and lib/badges.js reads the aggregated fields without
fallback (post this PR).

Pre-launch context (no real producer data on staging) — orphan check
(producers with X=TRUE but zero tagged products) was run by Smadar and
returned 0; no data restoration path needed in downgrade.

Reversibility: downgrade re-adds the 3 columns as Boolean nullable
(matching the baseline shape, no server_default) but DOES NOT
backfill values. Acceptable because (a) downgrade is only used to
revert a failed staging deploy before producers begin onboarding, and
(b) the canonical source moved to products.is_X — re-creating empty
producer columns just removes a hard 5xx on existing routes that
reference them, no semantics need to be restored.

Revision ID: 80bbf0a24874
Revises: 1afe844d11f4
Create Date: 2026-05-07 10:54:13+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = '80bbf0a24874'
down_revision: Union[str, None] = '1afe844d11f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('producers', 'lactose_free')
    op.drop_column('producers', 'vegan')
    op.drop_column('producers', 'gluten_free')


def downgrade() -> None:
    # Matches the baseline shape (Boolean nullable, no server_default).
    # Values are NOT backfilled — see module docstring for rationale.
    op.add_column(
        'producers',
        sa.Column('gluten_free', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('vegan', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('lactose_free', sa.Boolean(), nullable=True),
    )
