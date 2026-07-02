"""meh272 producer CHECK constraints (defense-in-depth, MEH-267 regression)

Revision ID: f9a2c7d41b83
Revises: c3f8a1d27e94
Create Date: 2026-07-02 21:00:00.000000+00:00

Two CHECK constraints on `producers` already live on prod + staging (added
by the removed `_migrate_columns` raw SQL in the MEH-267 era, never dropped)
but were missing from the ORM and the alembic baseline. Fresh alembic-
bootstrapped DBs (local dev, new env, CI) therefore lacked them. MEH-272
declares them in `Producer.__table_args__` and adds them here.

  1. producer_location_mode          — has_physical_location OR offers_delivery
  2. delivery_nationwide_xor_cities  — NOT (delivery_nationwide AND
                                        array_length(delivery_cities, 1) > 0)

IDEMPOTENT: prod + staging already carry both constraints, so each ADD is
wrapped in a `DO $$ ... IF NOT EXISTS (pg_constraint) ... $$` guard — a
no-op where the constraint exists, a create on a fresh DB. This mirrors the
guard style the old `_migrate_columns` used, so re-running on an already-
migrated environment is safe. downgrade drops both (IF EXISTS).

# DO NOT autogenerate this — the constraints pre-exist on prod/staging, so
# autogenerate would emit a bare ADD that fails there. Hand-written guard is
# required (MEH-272 acceptance).
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'f9a2c7d41b83'
down_revision: Union[str, None] = 'c3f8a1d27e94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # producer_location_mode — a producer must be reachable somehow: it has a
    # physical location OR it offers delivery (both is fine; neither is not).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'producer_location_mode'
            ) THEN
                ALTER TABLE producers
                    ADD CONSTRAINT producer_location_mode
                    CHECK (has_physical_location OR offers_delivery);
            END IF;
        END $$;
        """
    )
    # delivery_nationwide_xor_cities — nationwide delivery and a specific
    # delivery-cities list are mutually exclusive (nationwide already covers
    # everywhere, so an explicit city list is contradictory).
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'delivery_nationwide_xor_cities'
            ) THEN
                ALTER TABLE producers
                    ADD CONSTRAINT delivery_nationwide_xor_cities
                    CHECK (NOT (delivery_nationwide AND array_length(delivery_cities, 1) > 0));
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE producers DROP CONSTRAINT IF EXISTS delivery_nationwide_xor_cities;"
    )
    op.execute(
        "ALTER TABLE producers DROP CONSTRAINT IF EXISTS producer_location_mode;"
    )
