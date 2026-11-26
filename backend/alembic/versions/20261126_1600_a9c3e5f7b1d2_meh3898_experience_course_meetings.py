"""meh3898_experience_course_meetings

Revision ID: a9c3e5f7b1d2
Revises: c6e8a0b2d4f5
Create Date: 2026-11-26 16:00:00.000000+00:00

MEH-3898: a course — one experience that meets several times, with one
sign-up for all of its meetings.

- experiences.course_meetings: JSONB, [{"date": "YYYY-MM-DD", "time":
  "HH:MM"}], soonest first. NULL = not a course (every existing row).

Expand-only (ADR-007): one nullable column, no default, no backfill. The
previous container never reads it. Approved by Sapir 26/11 (her choice
«לבנות קורס עכשיו», which named the new column).

downgrade() drops it; the meetings of any course are lost, and each course
stays a one-off experience on its first meeting.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "a9c3e5f7b1d2"
down_revision: Union[str, None] = "c6e8a0b2d4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("experiences", sa.Column("course_meetings", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("experiences", "course_meetings")
