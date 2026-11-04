"""meh2665_experience_min_participants

Revision ID: c4d8e1f05a27
Revises: b3e9f2a71c45
Create Date: 2026-11-04 21:40:00.000000+00:00

MEH-2665 (experiences stage B): an optional minimum number of sign-ups for
the experience to run. The page compares it with the host-reported
participants_count and shows «נפתחת ב-N נרשמים לפחות» until it is reached.

Expand-only per ADR-007: one new nullable column, no default, no backfill —
an existing experience has no minimum, and NULL means exactly that. The
previous container never reads it.

No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; any minimum a host set since is lost.

Chained on b3e9f2a71c45 (MEH-2662, staging head on 04/11), so `alembic heads`
stays at one head.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d8e1f05a27"
down_revision: Union[str, None] = "b3e9f2a71c45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "experiences", sa.Column("min_participants", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("experiences", "min_participants")
