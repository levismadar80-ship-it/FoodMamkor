"""merge MEH-1651 + MEH-1577 heads

Revision ID: e8d4a2f6c9b3
Revises: c7e2a4f9b1d6, c7e2a4b91f38
Create Date: 2026-07-27 15:00:00.000000+00:00

Alembic MERGE revision — rejoins the migration DAG after two independent
heads formed on `staging`:

  - c7e2a4f9b1d6  (MEH-1651) — group_buys.funded_notified_at
  - c7e2a4b91f38  (MEH-1577) — producers.delivery_fee, free_delivery_above

Both branched off the same parent b9d3f1a7c2e4 (merge of MEH-1541 + MEH-1543)
and landed on `staging` within the same window, so `alembic upgrade head`
began failing with "Multiple head revisions are present" on any branch synced
after both.

NO schema change: the two branches add disjoint nullable columns to different
tables (`group_buys` vs `producers`), with nothing to reconcile — this
revision only unifies the two heads into one so the linear `head` selector
resolves again. `upgrade()` / `downgrade()` are intentionally empty (ADR-025
amendment — empty merge-revision exception, same pattern as b9d3f1a7c2e4).
Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "e8d4a2f6c9b3"
down_revision: Union[str, Sequence[str], None] = ("c7e2a4f9b1d6", "c7e2a4b91f38")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
