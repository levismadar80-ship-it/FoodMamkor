"""MEH-1855 chunk 2 (Phase 1 of 2, per ADR-007): backfill producers.price_range
from the legacy producers.starting_price_label alias.

Data-only migration — does NOT drop starting_price_label. models.py:124-129
marks that column LEGACY(2026-09-01, MEH-1855): frontend chunk 1 (PR #2895)
already flips every public reader to price_range-first with alias fallback,
so the column drop itself is Phase 4 of ADR-007's Expand-Contract sequence
and requires a >=7-day staging soak with real traffic, an R2 backup check,
and a dual-write-divergence check before it can run — none of which can be
satisfied today, since chunk 1 has not even merged yet. This migration only
completes the data side so a follow-up Phase-4 drop (after the soak) has
nothing left to backfill.

Conflict rule (per the ticket spec): a row where BOTH columns are set to
DIFFERENT values is a conflict. The owner's price_range value wins by
OMISSION — such rows are simply not touched, so price_range keeps whatever
the owner already set. Only rows where price_range IS NULL and
starting_price_label IS NOT NULL are backfilled. The conflict count is
printed so it lands in the migration's own output (CI's `alembic upgrade
head` step, and Railway's boot log in production) rather than needing a
separate report.

Revision ID: 97669fe803f5
Revises: c1f4b8e27d35
Create Date: 2026-08-13 15:12:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "97669fe803f5"
down_revision: str | None = "c1f4b8e27d35"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    conflict_count = conn.execute(
        sa.text(
            """
            SELECT COUNT(*) FROM producers
            WHERE price_range IS NOT NULL
              AND starting_price_label IS NOT NULL
              AND price_range <> starting_price_label
            """
        )
    ).scalar_one()
    print(
        f"[MEH-1855] conflict rows (both set, different — owner's price_range "
        f"kept, NOT overwritten): {conflict_count}"
    )

    result = conn.execute(
        sa.text(
            """
            UPDATE producers
            SET price_range = starting_price_label
            WHERE price_range IS NULL
              AND starting_price_label IS NOT NULL
            """
        )
    )
    print(f"[MEH-1855] backfilled rows (price_range was NULL): {result.rowcount}")


def downgrade() -> None:
    # Data backfill, not schema — genuinely irreversible without a copy of
    # which rows this migration touched (not tracked). starting_price_label
    # itself is untouched by this revision either direction, so downgrading
    # only means "undo the copy," which would require distinguishing rows
    # this migration wrote from rows that already matched by coincidence.
    # No-op by design; documented rather than a silent pass.
    print(
        "[MEH-1855] downgrade is a documented no-op — this migration only "
        "copies data forward (price_range = starting_price_label where NULL); "
        "starting_price_label is untouched in both directions, so there is "
        "nothing destructive to revert."
    )
