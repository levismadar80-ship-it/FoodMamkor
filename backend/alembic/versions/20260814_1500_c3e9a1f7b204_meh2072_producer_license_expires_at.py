"""meh2072_producer_license_expires_at

Revision ID: c3e9a1f7b204
Revises: 97669fe803f5
Create Date: 2026-08-14 15:00:00.000000+00:00

MEH-2072: adds `producers.license_expires_at` — one nullable column.

- `license_expires_at` (DATE, nullable) — the expiry date read off the
  business licence document by the admin at approval time.

**DATE, not TIMESTAMPTZ, and that is deliberate.** A licence is valid
through a calendar day, not to an instant; storing a timestamp would force
every reader to pick a time-of-day and a zone, and would make "expires
today" ambiguous across the Israel/UTC boundary. This differs from the
sibling `kashrut_expires_at` (DateTime) whose reminder pattern this ticket
otherwise mirrors — the divergence is intentional, not an oversight.

Nullable / Expand-only (ADR-007, no backfill): every existing producer
predates the capture, and there is no source to backfill from — the date
lives on a document only the admin can read. NULL therefore means "not
captured yet", NOT "no expiry", and readers must treat the two the same
way (the 30-day reminder query filters `IS NOT NULL`, so a NULL row is
simply never reminded about rather than silently treated as expired).

**No enforcement in this revision or this ticket.** v1 policy is capture +
remind only: nothing hides a producer whose licence has lapsed, because
auto-hiding a live business on a typo is more dangerous than the gap it
closes. Enforcement (hide / re-verify / queue) is a future decision.

Admin-owned: exposed on ProducerAdminOut, never on the public
ProducerDetailOut/ListOut, and never writable through PUT /producers/me
(it is not in _PRODUCER_WRITABLE_FIELDS, and a test asserts that).

No new table, so the CI table-count gate's expected total is unchanged.

# DO NOT change nullability without an explicit MEH ticket + backfill —
#        Alembic is the sole schema authority since MEH-267, and there is
#        no source to backfill this column from.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e9a1f7b204'
down_revision: Union[str, None] = '97669fe803f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('license_expires_at', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'license_expires_at')
