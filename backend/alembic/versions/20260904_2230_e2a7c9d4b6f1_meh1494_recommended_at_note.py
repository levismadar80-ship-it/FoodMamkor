"""meh1494_recommended_at_note

Revision ID: e2a7c9d4b6f1
Revises: b7d3e5a9c1f4
Create Date: 2026-09-04 22:30:00.000000+00:00

MEH-1494 chunk A (night session, 04/09): the editor's pick gets a DATE and a
REASON. Two nullable columns on `producers`, nothing else:

  - `recommended_at`    TIMESTAMPTZ, nullable — when the current editorial
                        pick was made. Chunk B stamps it on the admin toggle
                        (False→True writes now(), True→False clears it).
  - `recommended_note`  TEXT, nullable — the editor's reason. ADMIN-ONLY,
                        never serialized on a public schema. Chunk B adds it
                        to the admin form and the admin read model only.

WHY (card + tonight's research): `is_recommended` (MEH-18, models.py:182) is a
bare boolean — no date, no reason, no re-review. The editorial programmes it
imitates all work in cycles with a visible clock: TripAdvisor Travelers'
Choice is a 12-month review window with published thresholds; the MICHELIN
Guide re-inspects every starred restaurant every 12-18 months and withdraws
stars; Airbnb Guest Favorite is a rolling window over recent reviews. A pick
with no date cannot expire, and a pick with no reason cannot be defended
(ADR-030: the tag cannot be bought — the reason is what proves that).

NO BACKFILL, on purpose. Rows already `is_recommended = true` keep
`recommended_at = NULL`. Writing now() there would fabricate a date for a
decision made at an unknown time. NULL is read by chunk B's review list as
"stamped before the clock existed — due for review now", which is the honest
reading and matches how Michelin treats an un-revisited star: it is not
confirmed until it is looked at again.

Expand-only per ADR-007 — two additive nullable columns, no default, zero
behaviour change at the schema layer. EXPECTED_TABLES unchanged (columns, not
a table). Downgrade drops both; the note VALUES are not restorable and the
timestamp is not either — stated here, same posture as 9849fab1637a.

# DO NOT add recommended_note to ProducerListOut / ProducerDetailOut or any
#        public serializer — it is the editor's internal reasoning about a
#        real business. The guard test asserts its absence by name.
# DO NOT backfill recommended_at from created_at or updated_at "to be
#        helpful" — neither is the date the pick was made.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "e2a7c9d4b6f1"
down_revision: Union[str, None] = "b7d3e5a9c1f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("recommended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("producers", sa.Column("recommended_note", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("producers", "recommended_note")
    op.drop_column("producers", "recommended_at")
