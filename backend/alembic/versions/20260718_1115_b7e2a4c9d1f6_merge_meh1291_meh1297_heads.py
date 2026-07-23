"""merge MEH-1291 + MEH-1297 heads

Revision ID: b7e2a4c9d1f6
Revises: a3f1c9d2e4b7, f3a8c2d61e9b
Create Date: 2026-07-18 11:15:00.000000+00:00

Alembic MERGE revision — rejoins the migration DAG after two independent
heads formed on `staging`:

  - a3f1c9d2e4b7  (MEH-1291, PR #1885) — producers.updated_at
  - f3a8c2d61e9b  (MEH-1297, PR #1882) — producer_categories.position

Both branched off the same parent c5e1a9d7f2b4 (MEH-1266 report lifecycle)
and merged to `staging` in parallel, so `alembic upgrade head` began failing
with "Multiple head revisions are present" on every backend PR (and would
fail the Railway boot, which runs `alembic upgrade head`).

NO schema change: the two branches touch disjoint tables (a nullable column
on `producers` vs a column on `producer_categories`), so there is nothing to
reconcile — this revision only unifies the two heads into one so the linear
`head` selector resolves again. `upgrade()` / `downgrade()` are intentionally
empty. Alembic is the sole schema authority since MEH-267.
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "b7e2a4c9d1f6"
down_revision: Union[str, Sequence[str], None] = ("a3f1c9d2e4b7", "f3a8c2d61e9b")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Merge-only revision — no DDL. The two merged branches are independent.
    pass


def downgrade() -> None:
    # Splitting back into two heads is never desired; no-op.
    pass
