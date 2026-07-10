"""meh766_drop_is_verified

Revision ID: d4e7a92c81b5
Revises: b8f3d21a9c47
Create Date: 2026-07-10 21:30:00.000000+00:00

MEH-766 ch6 (Contract, final step of the Expand-Contract retirement):
DROP `producers.is_verified`. Every consumer was retired first:

- ch1 (#1403): FE seals read `verification_tier` (computed, ADR-022).
- ch2 (#1414): trust tier + `?verified` filter read `verified_at`.
- ch3 (#1420): every writer retired (admin create/PUT, import, seed, form).
- ch5 (#1578): field removed from the serialized contract (ProducerListOut)
  + FE Zod schema; contract locked by tests.
- ch4 is a locked NO-op: no auto-backfill. The prod-promotion decision
  (admin re-grants `verified_at` for keepers vs accepting the doc-verified
  shrink) stays with Sapir before staging→main — dropping the column here
  does not change production data semantics, since nothing has read the
  column since ch2 landed.

Downgrade restores the column nullable (matching the ef8fb1858f5b baseline
definition); values are NOT restorable — the legacy axis is gone by design.

# DO NOT re-add readers/writers of is_verified — the verification surface
#        is verification_tier/verified_at only (ADR-022, MEH-762/766).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d4e7a92c81b5"
down_revision: Union[str, None] = "b8f3d21a9c47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("producers", "is_verified")


def downgrade() -> None:
    op.add_column("producers", sa.Column("is_verified", sa.Boolean(), nullable=True))
