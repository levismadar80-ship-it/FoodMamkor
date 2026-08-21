"""meh2137_add_top_product_id

Revision ID: f4b1c8e0a297
Revises: e2a7c9d41b06
Create Date: 2026-08-21 04:00:00.000000+00:00

MEH-2137, expand step: the featured-product vote moves from a STRING to an
IDENTITY. `producers.top_product_name` is a free-text `String(200)`, so the
dashboard decides "is this the featured product?" by comparing names — and
two products legitimately named «לחם» (₪44 and ₪57) therefore BOTH carry the
badge. Observed by Sapir on 20/08. Renaming a product also silently severs
the link, and deleting one of a duplicate pair leaves the survivor featured
by accident. None of those are bugs in the comparison; they are consequences
of storing a vote as a name.

Adds `producers.top_product_id` — nullable UUID FK -> `products.id`,
ON DELETE SET NULL. Deleting the featured product must clear the vote, not
cascade to the producer and not leave a dangling id; SET NULL is the only
one of the three that says "there is no featured product any more", which is
exactly true. Same shape as the `locations` / `google_place_id` FK precedent
in models.py.

## The backfill, and what it deliberately refuses to guess

For each producer carrying a non-empty `top_product_name`, the name is
matched (trimmed, exact) against that producer's own products:

  * exactly ONE match  -> `top_product_id` is set to it.
  * TWO OR MORE        -> left NULL. This is the ticket's whole subject: if
                          the name cannot pick one product, neither can a
                          backfill. Guessing (MIN(id), oldest, cheapest)
                          would silently ratify the very ambiguity being
                          removed, and it would look identical afterwards to
                          a correct choice.
  * ZERO               -> left NULL. The name points at nothing — a renamed
                          or deleted product. There is no id to record.

`NULL` here is HONEST: it means "no product identity is known", and the
serializer keeps falling back to the legacy `top_product_name` column, so a
producer whose backfill came out ambiguous keeps rendering exactly the text
she has today. Nothing regresses; the id simply is not available for her
until she re-picks in the dashboard.

Row counts for all four populations are printed at upgrade time (see
`_report`), because a backfill that reports nothing cannot be distinguished
from a backfill that matched nothing.

## Why this is not Expand-Contract's problem yet (ADR-007)

Expand-only: ADD COLUMN nullable, no default, no rewrite, no long lock. The
FK is created while every row is still NULL, so its validation scan has
nothing to check. `top_product_name` is NOT dropped, NOT renamed and NOT
made non-writable here — it is marked LEGACY in models.py at the switch step
and dropped under its own ticket, per the MEH-2064 drop-after-soak pattern.

# DO NOT add a UNIQUE constraint on (producer_id, name) here — duplicate
#        product names are legitimate (Shopify and Etsy both allow them; a
#        sourdough and a spelt loaf can share a shelf label). The fix is to
#        stop identifying by name, not to forbid the names.

No index: nothing filters or sorts producers by `top_product_id`. The only
read is "fetch the product with this id", which uses the products primary
key. Adding one would cost writes and buy nothing.

EXPECTED_TABLES unchanged (a column, not a table).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "f4b1c8e0a297"
# MEH-2137: chain head verified with scripts/checks/alembic-head-guard.sh,
# which AST-parses the `revision` / `down_revision` assignment in all 59
# files under backend/alembic/versions/ and reports the revision nothing
# points back to. It printed: `single head: e2a7c9d41b06`. All 59 parsed —
# the guard fails loudly on an empty parse — so "single head" rests on a
# complete read. Linear extension, no merge revision needed. rtl-ok
down_revision: Union[str, None] = "e2a7c9d41b06"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


FK_NAME = "fk_producers_top_product_id_products"

# TRIM (not Postgres' btrim) so the same statement runs on any SQL backend a
# future test harness might point at. Exact match after trimming is the same
# comparison ProductsSection.jsx makes today — the backfill must reproduce
# the CURRENT rule, not a better one, or it would move the badge for people
# whose data was never ambiguous.
_MATCH = """
    SELECT COUNT(*) FROM products pr
     WHERE pr.producer_id = p.id
       AND TRIM(pr.name) = TRIM(p.top_product_name)
"""

_CANDIDATE = "p.top_product_name IS NOT NULL AND TRIM(p.top_product_name) <> ''"


def _report(bind) -> None:
    """Print the four populations. A silent backfill is not evidence."""
    counts = bind.execute(
        sa.text(
            f"""
            SELECT
              COUNT(*) AS candidates,
              SUM(CASE WHEN ({_MATCH}) = 1 THEN 1 ELSE 0 END) AS unique_match,
              SUM(CASE WHEN ({_MATCH}) > 1 THEN 1 ELSE 0 END) AS ambiguous,
              SUM(CASE WHEN ({_MATCH}) = 0 THEN 1 ELSE 0 END) AS no_match
            FROM producers p
            WHERE {_CANDIDATE}
            """
        )
    ).one()
    total = bind.execute(sa.text("SELECT COUNT(*) FROM producers")).scalar_one()
    print(
        "[MEH-2137 backfill] producers=%s · with top_product_name=%s → "
        "mapped=%s · ambiguous(2+ same name, left NULL)=%s · "
        "no matching product(left NULL)=%s"
        % (
            total,
            counts.candidates,
            counts.unique_match or 0,
            counts.ambiguous or 0,
            counts.no_match or 0,
        )
    )


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("top_product_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        FK_NAME,
        "producers",
        "products",
        ["top_product_id"],
        ["id"],
        ondelete="SET NULL",
    )

    bind = op.get_bind()
    _report(bind)
    result = bind.execute(
        sa.text(
            f"""
            UPDATE producers p
               SET top_product_id = (
                     SELECT pr.id FROM products pr
                      WHERE pr.producer_id = p.id
                        AND TRIM(pr.name) = TRIM(p.top_product_name)
                   )
             WHERE {_CANDIDATE}
               AND ({_MATCH}) = 1
            """
        )
    )
    print("[MEH-2137 backfill] rows updated: %s" % result.rowcount)


def downgrade() -> None:
    op.drop_constraint(FK_NAME, "producers", type_="foreignkey")
    op.drop_column("producers", "top_product_id")
