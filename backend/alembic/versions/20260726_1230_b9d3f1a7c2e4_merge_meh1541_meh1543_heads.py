"""merge MEH-1541 + MEH-1543 heads

Revision ID: b9d3f1a7c2e4
Revises: e4a9c1f7b2d3, f4a1e9c3b7d2
Create Date: 2026-07-26 12:30:00.000000+00:00

Alembic MERGE revision — rejoins the migration DAG after two independent
heads formed on `staging`:

  - e4a9c1f7b2d3  (MEH-1541) — producers.established_year (INTEGER, nullable)
  - f4a1e9c3b7d2  (MEH-1543) — producers.order_window

Both branched off the same parent d7b2f4a9c6e1 (MEH-1471 referral_source)
and landed on `staging` in parallel, so `alembic upgrade head` began failing
with "Multiple head revisions are present" on every backend PR (and would
fail the Railway boot, which runs `alembic upgrade head`).

NO schema change: the two branches add disjoint nullable columns to the SAME
table (`producers`), with nothing to reconcile — this revision only unifies
the two heads into one so the linear `head` selector resolves again.
`upgrade()` / `downgrade()` are intentionally empty (ADR-025 amendment —
empty merge-revision exception). Alembic is the sole schema authority since
MEH-267.
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "b9d3f1a7c2e4"
down_revision: Union[str, Sequence[str], None] = ("e4a9c1f7b2d3", "f4a1e9c3b7d2")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Merge-only revision — no DDL. The two merged branches are independent.
    pass


def downgrade() -> None:
    # Splitting back into two heads is never desired; no-op.
    pass
