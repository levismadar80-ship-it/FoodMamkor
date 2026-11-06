"""meh2703_rescue_qty_donated

Revision ID: b7d2e4f1a903
Revises: f1c7a2b9d4e6
Create Date: 2026-11-06 07:00:00.000000+00:00

MEH-2703 — «נמסרו בחינם»: after a bag's pickup window closes, the business
records how many uncollected bags it gave away free (never reserved, or
reserved and nobody came). Owner-reported; drives a dashboard line and the
pilot metrics only.

Expand-only per ADR-007: one NOT NULL integer with a server default of 0, so
existing rows read "nothing reported" (the truth for them) and the previous
container, which never names the column, inserts through the default. The
CHECK bounds it at qty_total; the tighter cap (leftover = qty_left + no-show
bags) needs rescue_orders and is enforced in the API. No new table →
EXPECTED_TABLES unchanged.

downgrade() drops the CHECK and the column; any counts reported since are lost.

Chained on f1c7a2b9d4e6 (MEH-2693 reservist_owned, staging head on 06/11).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7d2e4f1a903"
down_revision: Union[str, None] = "f1c7a2b9d4e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rescue_offers",
        sa.Column(
            "qty_donated",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.create_check_constraint(
        "rescue_offers_qty_donated_check",
        "rescue_offers",
        "qty_donated >= 0 AND qty_donated <= qty_total",
    )


def downgrade() -> None:
    op.drop_constraint(
        "rescue_offers_qty_donated_check", "rescue_offers", type_="check"
    )
    op.drop_column("rescue_offers", "qty_donated")
