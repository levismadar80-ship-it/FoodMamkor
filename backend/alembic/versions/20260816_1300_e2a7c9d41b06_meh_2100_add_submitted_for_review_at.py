"""meh2100_add_submitted_for_review_at

Revision ID: e2a7c9d41b06
Revises: 97669fe803f5
Create Date: 2026-08-16 13:00:00.000000+00:00

MEH-2100: adds ONE nullable TIMESTAMP WITH TIME ZONE column on `producers`
recording the moment the owner pressed "שליחה לבדיקה" and the row moved
`draft` -> `pending`. That instant — not registration — is when the
3-business-day review SLA starts under the new state machine.

`NULL` is HONEST, not a placeholder: it means "this producer never went
through the submit endpoint". Two populations carry it legitimately and
forever — a producer still sitting in `draft`, and any row seeded before
this revision (staging fixtures; production has no existing businesses,
confirmed by Sapir 16/08). Readers that need a submission instant use
`submitted_for_review_at or created_at`, which is why no backfill is
required to make the fallback correct.

Mirrors d3b7f1a92c64 (MEH-1818) and b504e4be4225 (MEH-539) in style and in
every schema property — nullable=True, no server_default, no index of its
own. No new index is needed: nothing filters or sorts on this column; it is
read per-row off an already-loaded producer.

EXPECTED_TABLES unchanged (a column, not a table) — the CI drift gate stays
where it is.

# DO NOT add backfill SQL here — a backfill would invent a submission that
#        never happened and would stamp every existing draft as submitted,
#        which is the exact state this ticket exists to keep separable.
#        Alembic is the sole schema authority since MEH-267.

Expand-only: ADD COLUMN nullable with no default is not a rewrite and takes
no long lock on Postgres, so ADR-007 Expand-Contract does not apply (that
governs DROP / RENAME / type change / NOT NULL on an existing column — none
of which happen here). The paired `status` value "draft" needs no migration
at all: `Producer.status` is a free String(20) with no enum and no DB CHECK
(models.py), so a new value is data, not schema.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e2a7c9d41b06"
# MEH-2100: chain head re-derived by parsing the `revision` / `down_revision`
# assignment in all 58 files under backend/alembic/versions/ and taking the
# revision nothing points back to — 97669fe803f5 (MEH-1855 price_range
# backfill, 20260813_1512). All 58 parsed (none returned empty), so the
# "single head" claim rests on a complete read, not a partial one. SINGLE
# head, so this revision extends the chain linearly and needs no merge
# revision. rtl-ok
down_revision: Union[str, None] = "97669fe803f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("submitted_for_review_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "submitted_for_review_at")
