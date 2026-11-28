"""meh3977_partner_stores

Revision ID: b2d4f6a8c0e3
Revises: a4c8e2f6b0d1
Create Date: 2026-11-27 21:30:00.000000+00:00

MEH-3977 (haziza-agriculture, 27/11): a business that does not ship and has
no pickup of its own, and is sold nationwide through other stores (פארמרים,
הענתיות, עלה הביתה). The admin form had only «איסוף במקום» or «משלוחים», and
the CHECK producer_location_mode required one of them, so every save made a
claim the business never made. Sapir chose this plan 27/11 23:04 (card).

- producers.partner_stores: TEXT[] NOT NULL DEFAULT '{}' — store names, shown
  on the page as «נמכר גם דרך: …». Empty = not sold through other stores.
- CHECK producer_partner_stores_cap: at most 10 names (Pydantic caps each
  name's length; MEH-3022 "nothing grows without bound").
- CHECK producer_location_mode is widened: physical OR delivery OR at least
  one partner store.

Expand-only (ADR-007): a constant default, so Postgres adds the column
without rewriting the table, and every existing row reads '{}'. Widening a
CHECK rejects nothing the old one accepted, so the previous container keeps
working against the new schema.

downgrade() refuses while any business relies on partner stores alone: the
narrow CHECK cannot hold for it, and a NOT VALID constraint would still fail
every later UPDATE of that row. Give such a business a pickup or delivery
setting first (admin form), then roll back. Otherwise it restores the narrow
CHECK, then drops the cap and the column.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2d4f6a8c0e3"
down_revision: Union[str, None] = "a4c8e2f6b0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE producers "
        "ADD COLUMN partner_stores TEXT[] NOT NULL DEFAULT '{}'::text[];"
    )
    op.execute(
        "ALTER TABLE producers ADD CONSTRAINT producer_partner_stores_cap "
        "CHECK (cardinality(partner_stores) <= 10);"
    )
    op.execute("ALTER TABLE producers DROP CONSTRAINT IF EXISTS producer_location_mode;")
    op.execute(
        "ALTER TABLE producers ADD CONSTRAINT producer_location_mode "
        "CHECK (has_physical_location OR offers_delivery "
        "OR cardinality(partner_stores) > 0);"
    )


def downgrade() -> None:
    partner_only = op.get_bind().execute(
        sa.text(
            "SELECT count(*) FROM producers "
            "WHERE NOT has_physical_location AND NOT offers_delivery"
        )
    ).scalar()
    if partner_only:
        raise RuntimeError(
            f"{partner_only} producers rely on partner_stores alone; give each a "
            "pickup or delivery setting before downgrading MEH-3977."
        )
    op.execute("ALTER TABLE producers DROP CONSTRAINT IF EXISTS producer_location_mode;")
    op.execute(
        "ALTER TABLE producers ADD CONSTRAINT producer_location_mode "
        "CHECK (has_physical_location OR offers_delivery);"
    )
    op.execute("ALTER TABLE producers DROP CONSTRAINT IF EXISTS producer_partner_stores_cap;")
    op.execute("ALTER TABLE producers DROP COLUMN IF EXISTS partner_stores;")
