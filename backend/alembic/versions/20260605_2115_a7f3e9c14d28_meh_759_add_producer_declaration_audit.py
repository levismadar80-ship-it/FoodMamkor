"""meh_759_add_producer_declaration_audit

Revision ID: a7f3e9c14d28
Revises: 92afa3cb76e2
Create Date: 2026-06-05 21:15:00.000000+00:00

MEH-759 (ADR-022 gate 2, Chunk A): adds two declaration-audit columns to
`producers`, both nullable:

  - `declared_at`          TIMESTAMP WITH TIME ZONE — when the binding
                           tier-2 declaration was made (Brief Q1.4: a
                           timestamp + version strengthens the platform's
                           good-faith reliance defense).
  - `declaration_version`  VARCHAR(10) — which declaration-text version
                           the seller agreed to (forward-compat for
                           re-consent when the lawyer-locked copy changes).

Expand-only per ADR-007 — additive nullable columns, NO backfill, NO
behavior change in this chunk. Stamping (`POST /auth/register/producer`
writing declared_at=now() + a constant version) lands in Chunk B;
Pydantic admin-only exposure follows the MEH-530 privacy-first precedent.

# DO NOT tighten either column to NOT NULL or add a backfill here without a
#        separate Expand-Contract ticket (ADR-007) — existing producer rows
#        predate the declaration audit trail. Alembic is the sole schema
#        authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7f3e9c14d28'
# MEH-759: chains onto the current head 92afa3cb76e2 (MEH-509 PR3
# producer_risk). Chain tail: d4046deb0dc1 (MEH-509 pr2b inbound_messages)
# → 92afa3cb76e2 (MEH-509 pr3 producer_risk) → THIS.
down_revision: Union[str, None] = '92afa3cb76e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('declared_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('declaration_version', sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'declaration_version')
    op.drop_column('producers', 'declared_at')
