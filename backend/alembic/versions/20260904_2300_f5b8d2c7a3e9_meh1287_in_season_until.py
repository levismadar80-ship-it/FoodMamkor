"""meh1287_in_season_until

Revision ID: f5b8d2c7a3e9
Revises: e2a7c9d4b6f1
Create Date: 2026-09-04 23:00:00.000000+00:00

MEH-1287 chunk A (night session, 04/09): the storage for the editorial
"עכשיו בעונה" (in season now) homepage module. ONE nullable column:

  - `in_season_until`  DATE, nullable — the admin's date-bounded curation:
                       the business belongs in the seasonal module UNTIL this
                       date (inclusive, Israel calendar day). NULL = not
                       curated. Chunk B renders the module only when
                       count(in_season_until >= today) >= 3 (ADDENDUM-4).

WHY A DATE AND NOT A BOOLEAN: a boolean `in_season` needs a human to remember
to switch it off, and the failure mode is a flag left on in winter — exactly
the "seasonal farmer whose page looks dead" concern the card's 22/07 SYNC
raises. The marketplaces this imitates treat seasonality as a human-curated,
TIME-BOUND moment (Etsy merchandising moments, Instacart seasonal storefront
collections), not a permanent attribute. A date expires by itself: the reader
compares it to the Israel calendar day and the row simply stops qualifying.
It is also the shape MEH-1494 chose for the editor's pick (a clock, not a
flag) — one editorial pattern, not two.

WHY A COLUMN AND NOT A TABLE: no flag/tag/collection store exists on
producers today (measured — the only curation precedent, lib/featured-
producer.js, reuses is_recommended, which is already the editor's pick). A
`homepage_collections` table would be the right home once MEH-391 (editorial
rotation) opens, but a new table needs an EXPECTED_TABLES bump in the
PR-checks workflow, which is CC-deny; this column migrates into that table
trivially when the time comes.

NOT owner-writable: seasonality is an editorial decision of the admin, not a
declaration by the business (same principle as ADR-030 for the editor's pick).
The guard test asserts `in_season_until` is absent from ProducerUpdate.

Expand-only per ADR-007 — one additive nullable column, no default, no
backfill, zero behaviour change at the schema layer; nothing reads it in this
chunk. EXPECTED_TABLES unchanged. Downgrade drops the column; the dates are
recomputable editorial input, not user data.

# DO NOT add in_season_until to ProducerUpdate — owners do not curate the
#        homepage.
# DO NOT read it without the >= israel_today() bound, or the module will
#        show last year's harvest.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "f5b8d2c7a3e9"
down_revision: Union[str, None] = "e2a7c9d4b6f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("producers", sa.Column("in_season_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("producers", "in_season_until")
