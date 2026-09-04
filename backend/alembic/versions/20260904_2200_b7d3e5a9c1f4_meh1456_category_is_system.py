"""meh1456_category_is_system

Revision ID: b7d3e5a9c1f4
Revises: c4e81b7a2f96
Create Date: 2026-09-04 22:00:00.000000+00:00

MEH-1456 chunk A (night session, 04/09): declared ownership on the seeded
category rows.

  - `categories.is_system`  BOOLEAN NOT NULL server_default false — TRUE for
                            exactly the rows `seed_data.CATEGORIES` owns, FALSE
                            for every admin-created row. Backfilled here for
                            existing databases; written by `seed_categories`
                            itself for fresh ones (see below).

WHY (the card's §2.6, five sources, zero contradiction): `slug` is the stable
KEY (MEH-2139, a7c3e91d5f28 + c9f2a41e8b03), but a key alone leaves "two
authorities over the same row" open — the admin panel can still rename a
seeded category out from under the code that seeded it (MEH-1104 duplicate,
MEH-1530 positional overwrite). Industry puts ownership ON THE ROW: Oracle
Siebel `Protect Seed Data`, IBM RDU `WRITE_PROTECTED`, and — measured tonight
— Google Business Profile ships a closed taxonomy no business can extend, Etsy
keys listings on an immutable numeric `taxonomy_id` and treats the name as
display. Chunk 2b makes `update_category` / `delete_category` refuse a rename
or delete when `is_system` is TRUE. This revision only creates the fact.

WHY THE BACKFILL IS KEYED ON NAME, AND WHY THAT IS SAFE WITHOUT THE PROD
MEASUREMENT THE CARD ASKED FOR: `categories.name` is UNIQUE (models.py:860)
and is the seed's own conflict target today (`CATEGORY_CONFLICT_KEY = "name"`,
seed_data.py:283). Therefore any row carrying a seed name IS the seed row —
there is no second row it could be. The 18 names below are a SNAPSHOT of
`seed_data.CATEGORIES` at this revision's date, hardcoded on purpose: a
migration must not import live application code, or it changes meaning every
time the list does. A rename in CATEGORIES after this date is a new migration's
problem (rule: renames of seeded categories are migrations, never seed edits).

WHY NOT NULL + server_default rather than nullable: ownership is two-state.
Siebel and IBM both model it as a flag with no "unknown"; a NULL would force
chunk 2b's guard into three-way logic for a state that has no meaning.
server_default makes the ADD safe on a populated table (ADR-007 expand-only:
additive column with a default, zero behaviour change at the schema layer).

FRESH-DATABASE PATH, the part a migration-only backfill would miss: on a new
environment `alembic upgrade head` runs BEFORE the boot seed inserts the 18
rows, so this UPDATE matches nothing there. `seed_categories` therefore writes
`is_system=True` on its own INSERT (same PR). Both paths are needed; neither
alone is correct. The guard below distinguishes "empty table" (fresh DB — fine)
from "rows exist but none matched" (a rename drifted — fail loud).

EXPECTED_TABLES unchanged (a column, not a table). Downgrade drops the column;
the ownership values are recomputable from CATEGORIES, so nothing is lost.

# DO NOT read `is_system` from a hardcoded list in application code —
#        the whole point (IBM RDU) is that ownership lives on the row.
# DO NOT make it editable from the admin UI. A flag the second authority
#        can clear is not a lock.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "b7d3e5a9c1f4"
down_revision: Union[str, None] = "c4e81b7a2f96"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Snapshot of seed_data.CATEGORIES names on 2026-09-04 (18 rows). Deliberately
# NOT imported — see the docstring.
SEED_CATEGORY_NAMES: tuple[str, ...] = (
    "בשר",
    "חלב וגבינות",
    "ביצים",
    "לחמים ואפייה",
    "שמנים",
    "ירקות",
    "פירות",
    "מותססים וכבושים",
    "מוצרים מוכנים",
    "צמחי מרפא ותוספים",
    "סבונים טבעיים",
    "קוסמטיקה טבעית",
    "נרות וארומה",
    "יין, בירה ומשקאות",
    "תבלינים וצמחי תיבול",
    "שוקולד וממתקים בוטיק",
    "דבש",
    "דגים",
)


def upgrade() -> None:
    op.add_column(
        "categories",
        sa.Column(
            "is_system", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )

    bind = op.get_bind()
    total = bind.execute(sa.text("SELECT count(*) FROM categories")).scalar_one()
    marked = bind.execute(
        sa.text("UPDATE categories SET is_system = true WHERE name = ANY(:names)"),
        {"names": list(SEED_CATEGORY_NAMES)},
    ).rowcount

    print(f"[MEH-1456] categories total={total} · marked is_system=true: {marked}")
    if total > 0 and marked == 0:
        # A populated table with no seed name present means CATEGORIES was
        # renamed after this snapshot, or the seed never ran here. Either way
        # the ownership flag would be silently wrong for every row.
        raise RuntimeError(
            f"[MEH-1456] refusing: {total} categories exist but none carries a "
            "seed name — CATEGORIES drifted from this revision's snapshot. "
            "Reconcile by migration, do not backfill by hand."
        )


def downgrade() -> None:
    op.drop_column("categories", "is_system")
