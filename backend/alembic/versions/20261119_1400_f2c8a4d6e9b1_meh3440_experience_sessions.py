"""meh3440_experience_sessions

Revision ID: f2c8a4d6e9b1
Revises: e3b9d1f7a2c4
Create Date: 2026-11-19 14:00:00.000000+00:00

MEH-3440 (stage 1 of MEH-3264, recurring workshop booked per date). Approved
by Sapir 19/11 (plan doc, «כן מאשרת הכל»). Additive only:

  - experiences.sessions  JSONB, nullable — the dates an owner opens for a
    recurring workshop: a list of {"date": "YYYY-MM-DD", "time": "HH:MM",
    "participants_count": int}. NULL / [] = no dates set, and the workshop
    keeps today's behaviour (one pool of places, MEH-3250's 30-day window).
  - registrations.session_date  DATE, nullable
  - registrations.session_time  TIME, nullable
    The date a sign-up is for. NULL = a sign-up with no date (an event, a
    one-off experience, or a recurring one with no dates set).
  - ix_registrations_experience_session on (experience_id, session_date,
    session_time): places, waitlist and the duplicate check count per date.

Columns, not an experience_sessions table: the EXPECTED_TABLES step lives in
.github/workflows/pr-checks.yml, which CC cannot write (MEH-671). Same call as
c4e81b7a2f96 (MEH-1889) and f4a1e9c3b7d2 (MEH-1543). So the uniqueness of a
date and the cap of 12 dates (MEH-3022) are enforced by the API (stage 2),
not by a constraint. EXPECTED_TABLES unchanged (columns, not a table).

No backfill, no server_default: every existing row stays NULL, which is the
"no dates" case. Expand-only per ADR-007. Downgrade drops the index and the
three columns; dates an owner set are not restorable.

# DO NOT tighten any of these to NOT NULL without a separate Expand-Contract
#        ticket (ADR-007). Alembic is the sole schema authority (MEH-267).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f2c8a4d6e9b1"
down_revision: Union[str, None] = "e3b9d1f7a2c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "experiences",
        sa.Column("sessions", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "registrations", sa.Column("session_date", sa.Date(), nullable=True)
    )
    op.add_column(
        "registrations", sa.Column("session_time", sa.Time(), nullable=True)
    )
    op.create_index(
        "ix_registrations_experience_session",
        "registrations",
        ["experience_id", "session_date", "session_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_registrations_experience_session", table_name="registrations")
    op.drop_column("registrations", "session_time")
    op.drop_column("registrations", "session_date")
    op.drop_column("experiences", "sessions")
