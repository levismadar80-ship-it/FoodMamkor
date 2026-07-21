"""meh1395_producer_locations

Revision ID: a9f4c2e7b1d3
Revises: c8f3a6d1e9b2
Create Date: 2026-07-21 12:30:00.000000+00:00

MEH-1395 (MEH-1388 chunk 1): creates `producer_locations` — physical presence
points of a producer (branch / pickup / market_stand). One producer -> many
locations (evidence: "הלחם של גל" self-pickup from 10 points, MEH-1382).

Columns follow the ProducerRecipe child-model conventions. Two CHECK
constraints mirror the ORM __table_args__ (producer_location_kind,
producer_location_precision). Two indexes mirror the column-level index=True
(ix_producer_locations_producer_id, ix_producer_locations_city).

Backfill: one is_primary=true, kind='branch', location_precision='exact' row
per producer that already has coordinates (lat AND lng NOT NULL), copying
city/address/lat/lng/opening_hours/phone from the producer. Producers without
coordinates get no row (nothing to place on the map yet). label stays NULL —
the producer name carries the primary point's identity.

Expand-only per ADR-007 — new table, no change to existing schema.
EXPECTED_TABLES 37 -> 38 in .github/workflows/pr-checks.yml.

# DO NOT add PostGIS / geo columns beyond lat/lng floats, or per-location
#        kashrut/license fields — out of scope by epic MEH-1388.
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a9f4c2e7b1d3"
down_revision: Union[str, None] = "c8f3a6d1e9b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producer_locations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("address", sa.String(length=255), nullable=True),
        sa.Column("lat", sa.Float(), nullable=True),
        sa.Column("lng", sa.Float(), nullable=True),
        sa.Column("opening_hours", sa.String(), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column(
            "is_primary",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "location_precision",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'exact'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["producer_id"], ["producers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "kind IN ('branch', 'pickup', 'market_stand')",
            name="producer_location_kind",
        ),
        sa.CheckConstraint(
            "location_precision IN ('exact', 'approximate')",
            name="producer_location_precision",
        ),
    )
    op.create_index(
        "ix_producer_locations_producer_id",
        "producer_locations",
        ["producer_id"],
        unique=False,
    )
    op.create_index(
        "ix_producer_locations_city",
        "producer_locations",
        ["city"],
        unique=False,
    )

    # Backfill one primary branch row per already-geocoded producer.
    op.execute(
        """
        INSERT INTO producer_locations
            (id, producer_id, kind, label, city, address, lat, lng,
             opening_hours, phone, is_primary, location_precision,
             created_at, updated_at)
        SELECT
            gen_random_uuid(), p.id, 'branch', NULL, p.city, p.address,
            p.lat, p.lng, p.opening_hours, p.phone, true, 'exact',
            now(), now()
        FROM producers p
        WHERE p.lat IS NOT NULL AND p.lng IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_index("ix_producer_locations_city", table_name="producer_locations")
    op.drop_index(
        "ix_producer_locations_producer_id", table_name="producer_locations"
    )
    op.drop_table("producer_locations")
