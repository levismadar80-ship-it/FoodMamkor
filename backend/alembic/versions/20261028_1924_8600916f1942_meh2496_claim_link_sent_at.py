"""meh2496_claim_link_sent_at

Revision ID: 8600916f1942
Revises: 1cd44149cc20
Create Date: 2026-10-28 19:24:00.000000+00:00

MEH-2496 (MEH-2494 sub-card B) — when did an admin last mint an owner-claim
link for this draft? One additive column on `producers`, no backfill, no new
table (EXPECTED_TABLES unchanged):

  - `claim_link_sent_at`  TIMESTAMPTZ, NULL — stamped by
                          POST /admin/producers/{id}/claim-link
                          (producer_claim.py) in the same transaction that
                          mints, on success only. NULL means "no link minted
                          since this column existed", never "no link sent":
                          links minted before this revision left no trace
                          (the endpoint was stateless), so a backfill would
                          have nothing true to write.

Expand-only per ADR-007, the producers.resubmitted_at precedent
(2c1033ca5745): nullable, no server_default, safe while the previous
container still serves (it never names the column).

# DO NOT add column changes for producers in main.py — Alembic is the sole
#        schema authority since MEH-267 (root cause of the MEH-265
#        production-login incident).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8600916f1942"
# MEH-2496: chains onto the single head 1cd44149cc20 (MEH-2393 drop
# referral_code, 28/10). Verified with `alembic heads` before writing.
down_revision: Union[str, None] = "1cd44149cc20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("claim_link_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "claim_link_sent_at")
