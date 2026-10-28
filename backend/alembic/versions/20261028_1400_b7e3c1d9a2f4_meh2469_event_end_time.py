"""meh2469_event_end_time

Revision ID: b7e3c1d9a2f4
Revises: a29c7a4a41e7
Create Date: 2026-10-28 14:00:00.000000+00:00

MEH-2469: adds `events.end_time TIME NULL` — an optional end time, so a
market that runs 09:30–15:00 can say so, and Google (Event.endDate) and the
«הוספה ליומן» file (DTEND) get it.

Expand-only per ADR-007: a nullable column with no default — every existing
event keeps exactly its current meaning (start time only); no backfill, no
NOT NULL, no constraint on live data. The "end after start" rule lives in the
request schemas (EventCreate / EventUpdate), not in a DB CHECK: a CHECK would
have to reason about NULL start times and add a second owner for one rule.
EXPECTED_TABLES unchanged (a column is not a table).

downgrade() drops the column — lossy by design (end times are forgotten),
which is the pre-MEH-2469 state of the world.

# DO NOT add this column anywhere else — Alembic is the sole schema authority
#        since MEH-267 (root cause of the MEH-265 incident).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7e3c1d9a2f4"
# Chains onto the single head a29c7a4a41e7 (MEH-586 mcp_reader role), derived
# by parsing every version file for revision / down_revision strings outside
# docstrings.
down_revision: Union[str, None] = "a29c7a4a41e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("events", sa.Column("end_time", sa.Time(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "end_time")
