"""meh1772_delivery_area_fee

Revision ID: a4f7c2e91b58
Revises: e8d4a2f6c9b3
Create Date: 2026-07-29 12:00:00.000000+00:00

MEH-1772 (עלות משלוח פר-אזור — chunk 1/3): adds ONE nullable money column to
`delivery_areas` so a business can override its delivery cost per area:

  - `delivery_fee`  INTEGER, nullable — the whole-shekel cost of delivering to
                    THIS area. NULL = no override; the public page inherits
                    `producers.delivery_fee` (c7e2a4b91f38, MEH-1577). 0 is a
                    MEANINGFUL value, distinct from NULL: "משלוח חינם" to this
                    area specifically.

WHY THIS REVERSES MEH-1577's EXPLICIT DECISION. The c7e2a4b91f38 docstring
states the fee is producer-level and that "a per-area fee would duplicate that
complexity for no observed use". That was correct on 27/07 — the qualifier was
*observed use*, not the design. Observed use arrived 29/07 (Sapir, DeliveryCard
dashboard screenshot): a business delivering to ת"א at ₪20 and חיפה at ₪40 today
has to either leave the field empty or publish one wrong number. This revision
does not remove the producer-level column; it adds an override BELOW it, which
is the Shopify zone-rates shape (default rate per shipping profile, per-zone
rates overriding it) confirmed against Shopify / DoorDash / Wolt on 29/07.

INTEGER, matching BOTH `delivery_areas.min_order` (models.py:620) — the column
directly above it in the same table and the same conceptual cluster — and
`producers.delivery_fee` (c7e2a4b91f38). The type must match the producer-level
column it overrides: a NULL-coalescing read (`area.delivery_fee ??
producer.delivery_fee`) that forked `Decimal` against `int` would serialize two
different JSON shapes for the same rendered "₪" string. Sapir's 27/07 type
ruling on MEH-1577 (whole shekels, display-only, no checkout arithmetic) applies
unchanged here and is the reason this is not NUMERIC(10,2).

Nullable with NO server_default and NO backfill: every existing `delivery_areas`
row predates the column and stays NULL, which is exactly the inherit-from-
producer case. Nothing changes on any public page until an owner fills a row in.
Expand-only per ADR-007 — one additive nullable column, no behaviour change at
the schema layer.

EXPECTED_TABLES is unchanged. This adds a COLUMN to an existing table, not a
table, so the table count stays 38 and the CI workflow file needs no edit —
which matters because `.github/workflows/**` is CC-deny (MEH-671) and a
table-count change would have made this chunk Sapir-only. (Counter lives at
line 354 of the pr-checks workflow.)                                  # rtl-ok

NO DB CHECK constraint. The value rules (>= 0, <= MAX_DELIVERY_MONEY) are
enforced at the API boundary in chunk 2, mirroring `_validate_delivery_fee`
(schemas.py:1604, MEH-1577) and the same choice made by `order_window`
(f4a1e9c3b7d2) and `availability_state`. App-layer enforcement keeps a bad
payload a clean 422 with Hebrew copy instead of a 500 from a constraint
violation.

`free_delivery_above` is deliberately NOT mirrored here — it stays
producer-level only (MEH-1772 Phase 0 over-engineering guard). `min_order`
already carries the per-area threshold dimension.

Chain note: `e8d4a2f6c9b3` (20260727_1500, the MEH-1651/MEH-1577 merge revision)
is the SINGLE head as of this file. Verified by parsing `revision` /
`down_revision` out of all 48 revisions in backend/alembic/versions/ with module
docstrings STRIPPED FIRST — a naive grep for a line beginning with the
down-revision token reports phantom extra heads, because prose lines inside
these docstrings (e.g. 20260723_1000_d51508a7c9e2:24) begin with that literal
token. Result: exactly one head, e8d4a2f6c9b3.

# DO NOT tighten to NOT NULL, add a server_default, or add a CHECK without a
#        separate Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267 — never add this column via main.py.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "a4f7c2e91b58"
down_revision: Union[str, None] = "e8d4a2f6c9b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "delivery_areas",
        sa.Column("delivery_fee", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("delivery_areas", "delivery_fee")
