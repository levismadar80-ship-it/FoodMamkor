"""meh2752_rescue_allergens

Revision ID: e4c71b9a2f68
Revises: b7d2e4f1a903
Create Date: 2026-11-06 14:10:00.000000+00:00

MEH-2752: per-business allergens on the surprise bag.

Until now the bag section showed ONE fixed sentence to every business —
«מכיל: ייתכנו גלוטן, חלב, אגוזים ושומשום…» — which is a statement about food
that nobody made. Not the business, which never declared it, and not
mehamakor, which cannot know. Someone allergic to sesame was warned about a
bag that may not contain any; someone allergic to soy was not warned about one
that does.

NULL vs [] IS THE WHOLE POINT, and it is why this column is nullable rather
than defaulting to an empty array:
  NULL = the business filled nothing. The UI says so plainly and tells the
         buyer to ask before pickup.
  []   = "this bag contains none of the 14 major allergens" — a food-safety
         CLAIM. Nobody has made it, so it must not be storable by accident.
`normalize_allergens` (backend/app/allergens.py:29) already collapses both
`None` and `[]` to `None`, and raises ValueError on an unknown code (→ 422),
so a typo can never be stored as a claim about food. This revision only has to
keep the column nullable with no server_default; the writer does the rest.

ARRAY(Text) and not JSONB: it is a short closed list of codes, the same shape
`products.allergens` already uses (MEH-2662), and `= ANY(...)` stays cheap if
a future filter wants "bags without peanuts".

Adds no table -> EXPECTED_TABLES unchanged.

downgrade() drops the column. Every business's declaration is forgotten and
the bag section falls back to saying nothing was declared — which is the
honest pre-MEH-2752 state, not the old fixed sentence (that string is deleted
in this PR and does not come back on a rollback).

Chained on b7d2e4f1a903 (MEH-2703 qty_donated), the staging head measured with
scripts/checks/alembic-head-guard.sh on 06/11 — not taken from HANDOFF, which
still named the older b2e6d4a17c93.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4c71b9a2f68"
down_revision: Union[str, None] = "b7d2e4f1a903"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rescue_typical_items",
        sa.Column("allergens", sa.ARRAY(sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rescue_typical_items", "allergens")
