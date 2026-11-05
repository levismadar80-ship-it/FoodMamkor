"""reservist_owned

Revision ID: f1c7a2b9d4e6
Revises: e5a9c3d17b28
Create Date: 2026-11-05 18:10:00.000000+00:00

«עסק של מילואימניקים»: the business owner declares that one of the owners
serves in the IDF reserves. Self-declared from the owner dashboard; no
document is collected or stored. Drives a badge only, never ranking
(ADR-027/030).

Expand-only per ADR-007: one NOT NULL boolean with a server default of
false. Existing rows were never asked, so false is the truth for them, and
the previous container (which never names the column) inserts through the
server default. No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; any declarations collected since are lost.

Chained on e5a9c3d17b28 (MEH-2673 waitlist host opt-in, staging head on 05/11).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1c7a2b9d4e6"
down_revision: Union[str, None] = "e5a9c3d17b28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "reservist_owned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),  # same idiom as the model
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "reservist_owned")
