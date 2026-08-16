"""meh1490_producer_google_place_id

Revision ID: a9f2c7d41b6e
Revises: b3f1a9c7e2d4
Create Date: 2026-07-22 14:00:00.000000+00:00

MEH-1490 (quiet Google-rating trust line): adds a single nullable column to
`producers`:

  - `google_place_id`  VARCHAR(300), nullable — the Google Maps Place ID an
                       admin maps to this producer. NULL for every existing
                       row and any producer without a mapped Google profile.

This is the ONLY thing MEH-1490 stores. Google Maps Platform ToS
§3.2.3(b) forbids caching/persisting `rating` or `userRatingCount`; storing
the `place_id` is the explicit exception in the Service Specific Terms. The
rating + review count are fetched live per-request (routers/google_rating.py)
and never written to any DB column, Redis, or file cache.

Deliberately NO server_default and NO backfill: the column stays NULL until
an admin maps a place_id, so the public GoogleRatingLine renders ONLY for
producers with a strong Google profile (≥20 reviews) that an admin opted in.

Expand-only per ADR-007 — one additive nullable column, no behavior change
at the schema layer. EXPECTED_TABLES unchanged (column, not a table).

# DO NOT add rating/userRatingCount columns here or anywhere — MEH-1490 is
#        live-fetch only (Google ToS §3.2.3(b) No Caching). Only place_id is
#        storable. Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a9f2c7d41b6e"
# MEH-1490: chains onto the current head b3f1a9c7e2d4 (MEH-1457 group_buy
# fulfillment_note).
down_revision: Union[str, None] = "b3f1a9c7e2d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("google_place_id", sa.String(length=300), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "google_place_id")
