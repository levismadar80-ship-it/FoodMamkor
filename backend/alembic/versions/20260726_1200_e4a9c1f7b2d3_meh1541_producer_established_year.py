"""meh1541_producer_established_year

Revision ID: e4a9c1f7b2d3
Revises: d7b2f4a9c6e1
Create Date: 2026-07-26 12:00:00.000000+00:00

MEH-1541 (quiet "מאז {שנה}" heritage line): adds a single nullable column to
`producers`:

  - `established_year`  INTEGER, nullable — the self-reported founding year an
                        owner enters (optional). NULL for every existing row
                        and any business that hasn't stated a year.

Range (1800..current year) is enforced at the app layer
(schemas.ProducerUpdate._validate_established_year → 422 "שנת ההקמה לא תקינה"),
not a DB CHECK — mirrors the availability_state app-layer-validation precedent.

Deliberately NO server_default and NO backfill (Expand-only per ADR-007): the
column stays NULL until an owner sets a year, so the public masthead heritage
line renders ONLY for businesses that opted in. EXPECTED_TABLES unchanged
(column, not a table).

# DO NOT add "years in business" computed columns or a verification flag here —
#        MEH-1541 is one nullable column + one quiet line of text. Alembic is
#        the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e4a9c1f7b2d3"
# MEH-1541: chains onto the current head d7b2f4a9c6e1 (MEH-1471 referral_source).
down_revision: Union[str, None] = "d7b2f4a9c6e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("established_year", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "established_year")
