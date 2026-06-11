"""meh_762_add_verified_at_doc_type

Revision ID: f1c7b9a3e264
Revises: a7f3e9c14d28
Create Date: 2026-06-06 18:50:00.000000+00:00

MEH-762 (ADR-022 public tier contract, Chunk 1): adds the two tier-1
"מאומת" verification columns to `producers`, both nullable:

  - `verified_at`             TIMESTAMP WITH TIME ZONE — when the admin
                              checked the qualifying licensing/exemption
                              document. Timezone-aware (stamping in Chunk 2
                              uses `datetime.now(timezone.utc)`, mirroring
                              MEH-759 — NOT `utcnow`). Exposed publicly only
                              at DATE granularity (Chunk 3), feeding the
                              S12 badge `{date}` tooltip.
  - `verification_doc_type`   VARCHAR(20) — which document granted the
                              badge. By-convention values
                              'license' | 'exemption' | 'cosmetics'
                              (1:1 with VERIFICATION.md §3 document_type).
                              No DB enum/CHECK — enforced at the app layer,
                              consistent with `availability_state`.

The public `verification_tier` ("verified" | "declared") is COMPUTED in
the Pydantic layer (Chunk 3) from `verified_at` + the category's
licensing requirement — it is NEVER stored as a column.

Expand-only per ADR-007 — additive nullable columns, NO backfill, NO
behavior change in this chunk. Admin stamping lands in Chunk 2; the
public resolver + exposure land in Chunk 3. No `verified_by` column in
V1 (single admin — MEH-762 D1).

# DO NOT tighten either column to NOT NULL or add a backfill here without a
#        separate Expand-Contract ticket (ADR-007) — existing producer rows
#        predate the verification trail. Alembic is the sole schema
#        authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1c7b9a3e264'
# MEH-762: chains onto the current head a7f3e9c14d28 (MEH-759 declaration
# audit). Chain tail: 92afa3cb76e2 (MEH-509 pr3 producer_risk) →
# a7f3e9c14d28 (MEH-759 declared_at/declaration_version) → THIS.
down_revision: Union[str, None] = 'a7f3e9c14d28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'producers',
        sa.Column('verification_doc_type', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'verification_doc_type')
    op.drop_column('producers', 'verified_at')
