"""meh3911_english_category_slugs

Revision ID: b3d5f7a9c1e2
Revises: b4d6f8a0c2e3
Create Date: 2026-11-26 22:00:00.000000+00:00

MEH-3911. Data only — no table, column or constraint changes. Three categories
were created from /admin, so `resolve_unique_slug` gave them a letter-by-letter
transliteration of the Hebrew name. The slug is public (the landing page
/producers/<category>/<region>), and site URLs are in English (Sapir 26/11).
Sapir chose on a decision card (26/11 23:58 Israel) to rename all three:

    kph               -> coffee
    byshvl-lpy-hzmnh  -> cooked-to-order
    avgvt-vkynvchym   -> cakes-desserts

Keyed by the OLD SLUG, never by id (ids differ between staging and production)
and never by name (an admin can rename). A row that does not exist (a fresh
database where the category was never created) is simply not matched — the
UPDATE touches 0 rows, which is the correct outcome there.

Fail-loud guard: if the target slug is already held by ANOTHER row, the UNIQUE
constraint `uq_categories_slug` would abort the upgrade with an IntegrityError;
the explicit check below raises first with a message that names the slug.

Downgrade renames back, guarded the same way. Producer links are by
category_id, so neither direction touches producer_categories.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b3d5f7a9c1e2"
down_revision: Union[str, None] = "b4d6f8a0c2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# DO NOT import app code here — a migration must keep running after the app
# moves on (same reason as a7c3e91d5f28's private copy of NAME_TO_SLUG).
RENAMES: tuple[tuple[str, str], ...] = (
    ("kph", "coffee"),
    ("byshvl-lpy-hzmnh", "cooked-to-order"),
    ("avgvt-vkynvchym", "cakes-desserts"),
)


def _rename(pairs: Sequence[tuple[str, str]]) -> None:
    conn = op.get_bind()
    for old, new in pairs:
        holder = conn.execute(
            sa.text("SELECT slug FROM categories WHERE slug = :new"), {"new": new}
        ).first()
        source = conn.execute(
            sa.text("SELECT id FROM categories WHERE slug = :old"), {"old": old}
        ).first()
        if holder is not None and source is not None:
            raise RuntimeError(
                f"meh3911: cannot rename category slug {old!r} -> {new!r}: "
                f"{new!r} is already taken by another row"
            )
        conn.execute(
            sa.text("UPDATE categories SET slug = :new WHERE slug = :old"),
            {"new": new, "old": old},
        )


def upgrade() -> None:
    _rename(RENAMES)


def downgrade() -> None:
    _rename([(new, old) for old, new in RENAMES])
