"""meh2923_farmer_declaration

Revision ID: d4f8b2c6e135
Revises: c3e7a1f5d829
Create Date: 2026-11-14 12:00:00.000000+00:00

MEH-2923 (הצהרת המגדל): the grower declaration gets its OWN record, apart
from the licensing declaration (`declared_at` / `declaration_version`).

  - `producers.farmer_declared_at`        TIMESTAMPTZ, nullable — when the
                                          owner ticked «גידלתי בחלקתי בלבד».
                                          NULL = not a grower category, or a
                                          row from before this revision.
  - `producers.farmer_declaration_version` VARCHAR(10), nullable — which
                                          wording (constants.
                                          FARMER_DECLARATION_VERSION).

Why: until now the server received one combined `declaration_accepted` and
stamped it as DECLARATION_VERSION "2026-06-v2", whose wording includes the
grower line — so a grower was recorded as having signed a line the server
never checked. DECLARATION_VERSION keeps its meaning; nothing is backfilled
(an existing row's grower consent is unknown, and NULL says exactly that).

Expand-only per ADR-007 — two additive nullable columns, no server_default,
no backfill, no table. EXPECTED_TABLES unchanged.

# DO NOT tighten either column to NOT NULL or add a server_default without a
#        separate Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "d4f8b2c6e135"
down_revision: Union[str, None] = "c3e7a1f5d829"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("farmer_declared_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("farmer_declaration_version", sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "farmer_declaration_version")
    op.drop_column("producers", "farmer_declared_at")
