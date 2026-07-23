"""meh1291_producer_updated_at

Revision ID: a3f1c9d2e4b7
Revises: c5e1a9d7f2b4
Create Date: 2026-07-17 12:00:00.000000+00:00

MEH-1291 (producer freshness signal): adds a single nullable column to
`producers`:

  - `updated_at`  TIMESTAMP WITH TIME ZONE, nullable — stamped by the ORM
                  `onupdate=func.now()` on every real UPDATE to a producer
                  row (owner edits via producer_me.py, admin edits via
                  admin.py). Timezone-aware (mirrors MEH-762 `verified_at`,
                  NOT naive `utcnow`).

Deliberately NO server_default and NO backfill: the column stays NULL for
every existing row and for any producer that is never edited again, so the
public "עודכן לאחרונה" line (MEH-1291 Chunk B) renders ONLY after a genuine
edit. An honest freshness signal — a backfilled timestamp would falsely
claim every legacy row was "just updated".

Expand-only per ADR-007 — one additive nullable column, no behavior change
in this chunk (the ORM `onupdate` stamping and the public read-only exposure
are code, not schema). EXPECTED_TABLES unchanged (column, not a table).

# DO NOT add a server_default/backfill or tighten to NOT NULL without a
#        separate Expand-Contract ticket (ADR-007) — the NULL-until-edited
#        semantics are load-bearing for the honest freshness signal.
#        Alembic is the sole schema authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a3f1c9d2e4b7"
# MEH-1291: chains onto the current head c5e1a9d7f2b4 (MEH-1266 report_status).
# Chain tail: e7c4b1f95a2d (MEH-1255 delivery_excluded_cities) →
# c5e1a9d7f2b4 (MEH-1266 report lifecycle) → THIS.
down_revision: Union[str, None] = "c5e1a9d7f2b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "updated_at")
