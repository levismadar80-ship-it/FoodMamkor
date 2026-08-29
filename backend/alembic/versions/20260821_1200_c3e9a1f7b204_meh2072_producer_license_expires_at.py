"""meh2072_producer_license_expires_at

Revision ID: c3e9a1f7b204
Revises: a7c3e91d5f28
Create Date: 2026-08-21 12:00:00.000000+00:00

MEH-2072: adds `producers.license_expires_at` — one nullable column.

A business licence is checked exactly once, at approval time, and the check
leaves no trace: `producer_license_number` is a bare String(20) (models.py
:269) with no validity window anywhere. So the "licensed businesses only"
promise is verified on day one and never again — a business whose licence
lapsed a year ago is indistinguishable, in the data, from one whose licence
is current.

This revision stores the missing half: the expiry date the admin reads off
the licence document at approval.

## DATE, not TIMESTAMPTZ — deliberate, and it diverges from its sibling

The reminder pattern mirrored here is `kashrut_expires_at` (models.py:400),
which is `DateTime`. This column is `Date`, and the difference is not an
oversight:

A licence is valid *through a calendar day*, not to an instant. Storing a
timestamp would force every reader to invent a time-of-day and a timezone,
and would make "expires today" answer differently depending on whether the
comparison ran before or after 00:00 UTC — which in Israel is 02:00 or 03:00
local, i.e. inside the same working day. The reminder query pairs this
column with `israel_today()` (app/utils/clock.py:33), so the comparison is
calendar-day against calendar-day with no zone arithmetic at all.

## Nullable, Expand-only, no backfill (ADR-007)

There is nothing to backfill *from*: the date exists only on a document that
only the admin can read. Every existing producer row therefore predates the
capture and stays NULL.

NULL means "not captured yet". It does NOT mean "no expiry", and readers
must never conflate the two — the 30-day reminder query filters
`IS NOT NULL`, so a NULL row is simply never reminded about, rather than
being silently treated as expired (which would page the admin about every
producer on file) or as valid-forever.

## No enforcement here or anywhere in this ticket

v1 policy is capture + remind only. Nothing hides, downranks, or un-verifies
a producer whose licence has lapsed. Auto-hiding a live business on a
mistyped date is more dangerous than the gap it would close; enforcement
(hide / re-verify / queue) is a future decision once there is data to reason
about.

## Exposure

Admin-owned, following the `producer_license_number` privacy precedent
(MEH-530): exposed on `ProducerAdminOut`, never on the public
`ProducerDetailOut` / `ProducerListOut`, and never writable through
`PUT /producers/me` — it is withheld from `_PRODUCER_WRITABLE_FIELDS`
exactly as `google_place_id` is (MEH-1490), and a test asserts both.

## Gate notes

No new table is created, so the CI table-count gate's expected total is
unchanged.

Class A audit (docs/MIGRATIONS.md): zero `drop_table` / `drop_column` in
`upgrade()`. The single `drop_column` is in `downgrade()`, where it belongs.
No `op.execute`, so there is no raw SQL for a reviewer to read by eye.

# DO NOT change nullability without an explicit MEH ticket + backfill —
#        Alembic is the sole schema authority since MEH-267, and there is no
#        source to backfill this column from.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e9a1f7b204'
down_revision: Union[str, None] = 'a7c3e91d5f28'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'producers',
        sa.Column('license_expires_at', sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('producers', 'license_expires_at')
