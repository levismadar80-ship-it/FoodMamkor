"""MEH-2782: move rows off the two removed availability values.

Revision ID: f2b8d4c61a07
Revises: a3f7c21e9b05
Create Date: 2026-11-07 17:00:00

Data only, no schema change. MEH-2758 made `available_today` and
`full_this_week` unwritable, and MEH-2782 removes them from the enum. Prod
has no real businesses yet, but staging demo rows may still hold either value,
and once they leave the enum nothing would read them correctly. Every such row
becomes `accepting_orders`, the state they rendered as.

downgrade() is a no-op: the old value of each row is not recorded, and moving
rows back would bring back a state no code path supports any more.

No table added or dropped, so EXPECTED_TABLES is unchanged.

History: MEH-2782 (creation).
"""

from alembic import op

revision = "f2b8d4c61a07"
down_revision = "a3f7c21e9b05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "UPDATE producers SET availability_state = 'accepting_orders' "
        "WHERE availability_state IN ('available_today', 'full_this_week')"
    )


def downgrade() -> None:
    pass
