"""merge MEH-1872 + MEH-1995 heads

Revision ID: c1f4b8e27d35
Revises: b7d3e1a94c26, b8d3e7a1c604
Create Date: 2026-08-10 13:45:00.000000+00:00

Alembic MERGE revision — rejoins the migration DAG after two independent heads
formed on `staging`:

  - b7d3e1a94c26  (MEH-1872) — creates table producer_name_change_requests
  - b8d3e7a1c604  (MEH-1995) — adds users.terms_accepted_at + terms_version

Both branched off the same parent a2f7d4c8e153 and landed in the same window,
so `alembic upgrade head` fails with "Multiple head revisions are present" on
any branch synced after both. That failure is not confined to CI: the
Dockerfile runs `alembic upgrade head` on every Railway boot, so a two-headed
chain reaching `staging` breaks the deploy, not just the migration gate.

NO schema change: the two branches are disjoint — one creates a new table, the
other adds two nullable columns to `users`, with nothing to reconcile. This
revision only unifies the heads so the linear `head` selector resolves again.
`upgrade()` / `downgrade()` are intentionally empty (ADR-025 amendment — empty
merge-revision exception, same pattern as b9d3f1a7c2e4, b7e2a4c9d1f6 and
e8d4a2f6c9b3). Alembic is the sole schema authority since MEH-267.

Caught by `scripts/checks/alembic-head-guard.sh` under the required Repo guards
job, on a sync — not by review. Worth recording, because the collision did not
exist when either PR was written: it was created by the OTHER branch merging
first. Nothing either author could have checked at authoring time would have
found it.
"""

from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "c1f4b8e27d35"
down_revision: Union[str, Sequence[str], None] = ("b7d3e1a94c26", "b8d3e7a1c604")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
