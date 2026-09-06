"""meh2079_analytics_daily

Revision ID: c4a9e2b7d3f8
Revises: f5b8d2c7a3e9
Create Date: 2026-09-06 11:00:00.000000+00:00

MEH-2079 chunk A: the anonymous daily aggregate that makes pruning the raw
analytics tables survivable. ONE new table, no writers, no readers.

  producer_analytics_daily
    id                   UUID PK
    producer_id          UUID FK producers(id) ON DELETE CASCADE, indexed
    day                  DATE, indexed — an Israel calendar day
    views_unique         INTEGER NOT NULL DEFAULT 0
    views_search_unique  INTEGER NOT NULL DEFAULT 0
    whatsapp_clicks      INTEGER NOT NULL DEFAULT 0
    UNIQUE (producer_id, day)

WHY IT EXISTS. Sapir's ruling of 05/09 keeps 90 days of RAW rows in
`producer_page_views` and `producer_whatsapp_clicks` and then deletes them.
Three dashboard numbers read those tables with NO time bound at all —
`profile_views.total`, `search_appearances.total` and `whatsapp_clicks.total`
(`producer_me.py`'s `windowed(...)`, `days=None`) — so a purge without this
table would silently shorten the owner's "מאז ומתמיד" figures to 90 days the
first time the job ran. The ruling's own words for the requirement are "אפס
שינוי נראה לבעלת העסק".

WHY IT MAY BE KEPT WITHOUT A BOUND, when the rows it summarises may not: it
carries no `viewer_ip_hash`, no `city`, no `user_id` — nothing about a person.
The raw rows are pseudonymous (SHA-256 of the IP with a deploy-scoped salt,
`analytics.py:163`, re-identifiable with the salt) and are therefore personal
data under Amendment 13; a per-business per-day count is not.

WHY THREE COUNT COLUMNS AND NOT TWO. The ruling names two ("כל-הצפיות ·
צפיות-search"), which are the two page-view figures. `whatsapp_clicks.total`
reads the same unbounded pattern against the OTHER purged table, so leaving it
out would break the ruling's own stated goal on a number it did not enumerate.
Recorded on the card as a decision rather than applied silently.

THE COUNTS ARE DEDUPED. `views_unique` / `views_search_unique` hold what
`unique_views_count` computes — one visitor per Israel day (MEH-160) — because
that is the unit every existing reader displays. Raw row counts here would
make the owner's totals jump the moment the aggregate is first read.
`whatsapp_clicks` is a plain count, matching its own reader.

Expand-only per ADR-007: a new table, nothing reads or writes it in this
chunk, no backfill. It changes `EXPECTED_TABLES` in the PR-checks workflow
from 42 to 43 — bumped in the same PR, which is why this one does not carry
the usual "EXPECTED_TABLES unchanged" line.

Downgrade drops the table. Safe in chunk A precisely because nothing writes to
it yet; once chunk B's roll-up runs and chunk C's purge deletes the raw rows,
this table is the ONLY copy of the pre-90-day history and a downgrade becomes
data loss. That asymmetry is the reason chunk C is a separate, later merge.

# DO NOT add a person-level column here — the licence to keep it unbounded is
#        that it carries none.
# DO NOT write raw row counts into views_unique; use unique_views_count.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4a9e2b7d3f8"
down_revision: Union[str, None] = "f5b8d2c7a3e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producer_analytics_daily",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column(
            "views_unique", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.Column(
            "views_search_unique",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "whatsapp_clicks", sa.Integer(), nullable=False, server_default=sa.text("0")
        ),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "producer_id", "day", name="uq_producer_analytics_daily_producer_day"
        ),
    )
    op.create_index(
        "ix_producer_analytics_daily_producer_id",
        "producer_analytics_daily",
        ["producer_id"],
    )
    op.create_index(
        "ix_producer_analytics_daily_day", "producer_analytics_daily", ["day"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_producer_analytics_daily_day", table_name="producer_analytics_daily"
    )
    op.drop_index(
        "ix_producer_analytics_daily_producer_id",
        table_name="producer_analytics_daily",
    )
    op.drop_table("producer_analytics_daily")
