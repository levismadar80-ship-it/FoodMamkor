"""MEH-291 — add producers.availability_state enum + backfill

Consolidates 3 overlapping availability mechanisms on `producers` into a
single durable enum column. The old columns (`is_available_today`,
`availability_status`) are PRESERVED during a mandatory 7-day overlap
period — a separate migration drops them after staging verification.
`vacation_until` is preserved permanently (still relevant for
`availability_state = 'on_vacation'`).

Source: MEH-291 spec. Anti-pattern reference: Yelp (2017) /
WeWork (2019) — multiple parallel availability surfaces confused
producers and consumers.

Backfill semantics (PostgreSQL CASE WHEN, evaluated top-down):
  availability_status='vacation'   → 'on_vacation'
  availability_status='full'       → 'full_this_week'
  is_available_today=TRUE          → 'available_today'
  ELSE                             → 'accepting_orders'

Safe on populated DBs:
  - server_default='accepting_orders' covers any rows the backfill
    misses (and matches the column's logical default for new INSERTs)
  - nullable=False enforced; the column is authoritative going forward
  - Old columns untouched — readers on the old surfaces keep working
    until the Phase 4 removal PR

Index strategy:
  Partial index on availability_state WHERE state != 'accepting_orders'.
  Most producers default to 'accepting_orders'; the index only needs to
  serve filter queries for the minority states (available_today,
  full_this_week, on_vacation).

Revision ID: 2a74fa41ceb1
Revises: e4da13353c58
Create Date: 2026-05-04 19:11:00.000000+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = '2a74fa41ceb1'
down_revision: Union[str, None] = 'e4da13353c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column(
            'availability_state',
            sa.String(length=32),
            nullable=False,
            server_default='accepting_orders',
        ),
    )

    op.create_index(
        'idx_producers_availability_state',
        'producers',
        ['availability_state'],
        postgresql_where=sa.text("availability_state != 'accepting_orders'"),
    )

    op.execute(
        """
        UPDATE producers
        SET availability_state = CASE
            WHEN availability_status = 'vacation' THEN 'on_vacation'
            WHEN availability_status = 'full'     THEN 'full_this_week'
            WHEN is_available_today = TRUE        THEN 'available_today'
            ELSE 'accepting_orders'
        END
        """
    )


def downgrade() -> None:
    op.drop_index(
        'idx_producers_availability_state',
        table_name='producers',
    )
    op.drop_column('producers', 'availability_state')
