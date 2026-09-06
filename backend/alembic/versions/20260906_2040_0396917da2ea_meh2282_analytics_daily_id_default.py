"""meh2282_analytics_daily_id_default

Revision ID: 0396917da2ea
Revises: c4a9e2b7d3f8
Create Date: 2026-09-06 20:40:00.000000+00:00

MEH-2079 chunk B1 (MEH-2282): a server-side default for
`producer_analytics_daily.id`. One ALTER, nothing else.

  ALTER TABLE producer_analytics_daily
    ALTER COLUMN id SET DEFAULT gen_random_uuid()

WHY A NEW REVISION AND NOT AN EDIT TO c4a9e2b7d3f8. That revision is applied
on staging (`/api/health` has reported it as `alembic_head` since 16:41Z on
06/09). Adding the default to its `upgrade()` would never run, and would leave
the model saying one thing and the database another. So it chains.

WHY THE COLUMN NEEDS IT AT ALL. Chunk A shipped the table with a Python-side
`default=uuid.uuid4` on the ORM class and nothing else. Chunk B2's roll-up
writes with a raw `INSERT … ON CONFLICT (producer_id, day) DO NOTHING` —
Sapir's ruling: a rolled-up day is immutable, skip on conflict, never
overwrite — and a raw INSERT never instantiates the class, so the Python
default is never consulted on exactly the path that writes every row. Without
this default that INSERT fails on NOT NULL. The adversarial reviewer raised it
on #3452; the fix (`00cc19a1`) was overtaken by auto-merge and never landed.

WHY gen_random_uuid(). Postgres 13+ core, no pgcrypto — the same call
`b7d3e1a94c26` (MEH-1872) and `d4a9c31e6f82` (MEH-1399) already rely on.

Expand-only per ADR-007: no data is read or written (the table is empty —
chunk A shipped no writer), `EXPECTED_TABLES` is unchanged (a default is not
a table), and the ORM's `default=uuid.uuid4` stays so the ORM path keeps
working identically. Downgrade drops the default and nothing else.

# DO NOT fold this into the chunk-A revision — it is applied.
# DO NOT add a person-level column here (see c4a9e2b7d3f8's docstring for
#        why this table may be kept unbounded).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0396917da2ea"
# Chains after chunk A (c4a9e2b7d3f8), which `alembic heads` confirms is the
# sole head on staging at cut time. If another revision lands first and
# claims c4a9e2b7d3f8 as its parent, re-point this one to THAT revision
# rather than merging — this revision has never been applied anywhere, so
# re-pointing rewrites no history (the same call c4a9e2b7d3f8 itself made
# when 3f9a7c2e5d18 arrived first).
down_revision: Union[str, None] = "c4a9e2b7d3f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "producer_analytics_daily",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
        server_default=sa.text("gen_random_uuid()"),
    )


def downgrade() -> None:
    op.alter_column(
        "producer_analytics_daily",
        "id",
        existing_type=postgresql.UUID(as_uuid=True),
        existing_nullable=False,
        server_default=None,
    )
