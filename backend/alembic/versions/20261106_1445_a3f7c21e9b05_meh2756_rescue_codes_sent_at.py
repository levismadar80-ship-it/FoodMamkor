"""MEH-2756: rescue_offers.codes_sent_at — the digest's idempotency stamp.

Revision ID: a3f7c21e9b05
Revises: e4c71b9a2f68
Create Date: 2026-11-06 14:45:00

One nullable timestamp, and it is the whole duplicate-send guarantee for the
pickup_start WhatsApp digest: NULL means "this offer's codes have not been sent
to the business", any value means they have. The scheduler stamps it in the same
transaction as the send, so a crash between the two leaves the offer unstamped
and the next tick retries rather than losing the message.

Why NULL-able with no default and no backfill: offers that already exist were
never digested, and NULL says exactly that. A `server_default now()` would
declare every historical offer already notified, which is the one wrong answer
here — the business would never receive codes for a bag already published when
this deploys.

TIMESTAMPTZ, not the naive `DateTime` the rest of this table uses
(`pickup_start`, `pickup_end`, `created_at` are all naive-UTC). That is
deliberate and matches the stamp it is modelled on,
`producers.email_pending_nudge_sent_at`, which is also `DateTime(timezone=True)`:
a send-stamp is read by humans in logs and compared against `utc_now()`, never
rendered on the Israel clock the way a pickup window is. The mixed-tz table is
noted in docs/DATA.md so the next reader does not take it for an accident.

# DO NOT add a CHECK tying this to pickup_start — a stamp may legitimately
# post-date the window by a whole tick interval, and by more after a pause.

No table added or dropped → EXPECTED_TABLES is unchanged.

History: MEH-2756 (creation).
"""

import sqlalchemy as sa
from alembic import op

revision = "a3f7c21e9b05"
down_revision = "e4c71b9a2f68"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rescue_offers",
        sa.Column("codes_sent_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rescue_offers", "codes_sent_at")
