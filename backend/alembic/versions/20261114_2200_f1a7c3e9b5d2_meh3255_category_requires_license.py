"""meh3255_category_requires_license

Revision ID: f1a7c3e9b5d2
Revises: e4b8d2f6a913
Create Date: 2026-11-14 22:00:00.000000+00:00

MEH-3255 (grill retro D10), EXPAND step of ADR-007: whether a category needs a
manufacturer licence moves from a hard-coded NAME list onto the row.

  - `categories.requires_license`  BOOLEAN NOT NULL server_default false —
                                   TRUE for the nine names in
                                   app/constants.py LICENSE_REQUIRED_CATEGORIES
                                   on this revision's date, FALSE otherwise.

WHY: the licensing rule is keyed on the Hebrew name (constants.py tuple, plus
a hand-kept frontend mirror), so a category an admin creates is never asked
«דורשת רישיון?», and MEH-1571 had to forbid renaming the licensed rows. On the
row, a new category answers the question when it is created (CategoryCreate
makes the field required) and the name is free to be display text again.

This revision only creates and backfills the fact. Nothing reads it yet — the
CONTRACT PR switches license_validation / schemas / admin_extra / the three
frontend callers to the column and deletes both name lists. Until then the
tuple stays authoritative and tests/test_meh3255_requires_license_parity.py
holds the two equal.

The names are a SNAPSHOT, hard-coded on purpose (same reason as b7d3e5a9c1f4):
a migration must not import live application code. Fresh databases get the
flag from seed_categories on INSERT (same PR), because migrations run before
the seed there.

EXPECTED_TABLES unchanged. Downgrade drops the column; until the contract PR
the tuple still holds the same fact, so nothing is lost.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f1a7c3e9b5d2"
down_revision: Union[str, None] = "e4b8d2f6a913"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Snapshot of app/constants.py LICENSE_REQUIRED_CATEGORIES on 2026-11-14.
LICENSED_NAMES: tuple[str, ...] = (
    "לחמים ואפייה",
    "מותססים וכבושים",
    "מוצרים מוכנים",
    "בשר",
    "דגים",
    "חלב וגבינות",
    "שוקולד וממתקים בוטיק",
    "יין, בירה ומשקאות",
    "דבש",
)


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column(
            "requires_license", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )
    bind = op.get_bind()
    marked = bind.execute(
        sa.text(
            "UPDATE categories SET requires_license = true WHERE name = ANY(:names)"
        ),
        {"names": list(LICENSED_NAMES)},
    ).rowcount
    print(f"[MEH-3255] marked requires_license=true: {marked} of {len(LICENSED_NAMES)}")


def downgrade() -> None:
    op.drop_column("categories", "requires_license")
