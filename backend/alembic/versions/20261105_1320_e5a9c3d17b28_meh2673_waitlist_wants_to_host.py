"""meh2673_waitlist_wants_to_host

Revision ID: e5a9c3d17b28
Revises: c4d8e1f05a27
Create Date: 2026-11-05 13:20:00.000000+00:00

MEH-2673: «אשמח לארח נקודת מסירה» — a visitor joining a business's per-city
delivery waitlist (MEH-2618) can also say she is willing to host a pickup
point in that city. Ticking it is her consent for this ONE business to see
her email; it only counts after she clicks the confirmation link mailed to
that address (POST /delivery-waitlist/host-confirm). The owner reads the list
on GET /producers/me/analytics → `pickup_hosts`. `host_confirm_sent_at` is
the per-entry resend cooldown for that mail. The form checkbox ships in the
frontend follow-up (MEH-2674).

Expand-only per ADR-007: one NOT NULL boolean with a server default of
false, and one nullable timestamp. Existing rows were never asked, so false is the truth for them, and
the previous container (which never names the column) inserts through the
server default. No new table → EXPECTED_TABLES unchanged.

downgrade() drops the column; any host opt-ins collected since are lost.

Chained on c4d8e1f05a27 (MEH-2665, staging head on 05/11).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5a9c3d17b28"
down_revision: Union[str, None] = "c4d8e1f05a27"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_waitlist",
        sa.Column(
            "wants_to_host",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # When the last host-confirmation mail went out: a per-entry resend
    # cooldown, so re-submitting the form cannot flood the address.
    op.add_column(
        "delivery_waitlist",
        sa.Column("host_confirm_sent_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("delivery_waitlist", "host_confirm_sent_at")
    op.drop_column("delivery_waitlist", "wants_to_host")
