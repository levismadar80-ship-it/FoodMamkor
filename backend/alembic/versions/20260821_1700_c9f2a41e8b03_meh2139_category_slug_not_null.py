"""meh2139_category_slug_not_null

Revision ID: c9f2a41e8b03
Revises: c3e9a1f7b204
Create Date: 2026-08-21 17:00:00.000000+00:00

MEH-2139 chunk 2 — the tightening half. `a7c3e91d5f28` added
`categories.slug` UNIQUE but **nullable**, and this applies the NOT NULL it
deliberately deferred.

## Why it was deferred, and why it is safe now

The ticket originally put NOT NULL in chunk 1. Measured then: **11 writers**
constructed a `Category` with no slug — `admin_extra.py` in production,
`seed_data.py`'s upsert, and nine sites under `tests/` — so the constraint
would have failed every one of them for the whole window between the two
merges (`NotNullViolation`, reproduced). Sapir approved the deferral on 21/08
with this tightening pre-approved **at exactly this scope**.

What changed in the same PR that carries this file: `categories.slug` now has a
**column default** (`models.py` → `services/category_slug._column_default`)
that derives the slug from the row's own `name`. That covers every writer,
including the ones nobody edited — which is the property that makes the
constraint safe rather than merely intended.

## It refuses loudly rather than half-applying

`ALTER COLUMN … SET NOT NULL` on a table containing NULLs fails on its own, but
with a Postgres error naming a constraint and not a cause. The explicit count
below turns that into a sentence a reader can act on, and prints the offending
ids — a migration that stops with "23 rows" and no identifiers wastes the next
hour.

**This is a guard, not a fixer. It does NOT backfill.** Reaching this revision
with NULL rows means something wrote one AFTER a7c3e91d5f28's backfill, i.e. a
writer that bypasses the default — and inventing slugs for those rows here would
paper over exactly the bug worth finding.

# DO NOT widen this revision. Sapir's 21/08 approval covers `SET NOT NULL` on
#        `categories.slug` and nothing else; any addition needs its own gate.

EXPECTED_TABLES unchanged (a constraint, not a table).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c9f2a41e8b03"
# Chains after c3e9a1f7b204 (MEH-2072), NOT directly after chunk-1's
# a7c3e91d5f28 — that revision landed on staging first and already claimed
# a7c3e91d5f28 as its parent, so pointing there too would fork the chain into
# two heads (alembic-head-guard catches exactly this). Nothing here depends on
# MEH-2072; the order is bookkeeping, not a data dependency. rtl-ok
down_revision: Union[str, None] = "c3e9a1f7b204"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    offenders = bind.execute(
        sa.text("SELECT id, name FROM categories WHERE slug IS NULL ORDER BY id")
    ).fetchall()

    if offenders:
        listed = ", ".join(f"{r.id}:{r.name!r}" for r in offenders[:20])
        more = "" if len(offenders) <= 20 else f" (+{len(offenders) - 20} more)"
        raise RuntimeError(
            f"[MEH-2139] refusing to set NOT NULL: {len(offenders)} categories "
            f"still have slug IS NULL — {listed}{more}. "
            "a7c3e91d5f28 backfilled every row that existed, so a NULL here "
            "means a writer created a category AFTER it and bypassed the column "
            "default in models.py. Find that writer; do NOT backfill by hand."
        )

    print("[MEH-2139] slug IS NULL count = 0 — applying NOT NULL")
    op.alter_column("categories", "slug", existing_type=sa.String(50), nullable=False)


def downgrade() -> None:
    op.alter_column("categories", "slug", existing_type=sa.String(50), nullable=True)
