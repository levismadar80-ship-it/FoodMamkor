"""meh1577_producer_delivery_fee_fields

Revision ID: c7e2a4b91f38
Revises: b9d3f1a7c2e4
Create Date: 2026-07-27 14:00:00.000000+00:00

MEH-1577 (שדות משלוח מובנים — chunk 1/3): adds two nullable money columns to
`producers` so a business can state its delivery cost and its free-delivery
threshold as STRUCTURED data rather than free text:

  - `delivery_fee`          INTEGER, nullable — the whole-shekel cost of a
                            delivery. NULL = not stated (the public page
                            renders nothing). 0 is a MEANINGFUL value,
                            distinct from NULL: "delivery is free".
  - `free_delivery_above`   INTEGER, nullable — order value at or above which
                            delivery costs nothing. NULL = no such threshold.

PRODUCER-level, not per-`delivery_areas` row (Phase 0 decision, MEH-1577 §4
`<intent>`): the competitor evidence (Wolt per-venue fee, DoorDash card-level
fee) is one fee per business, and `delivery_areas.min_order` (models.py:605)
already owns the per-city dimension — a per-area fee would duplicate that
complexity for no observed use. The `delivery_areas` table is untouched here.

INTEGER, matching `delivery_areas.min_order` (models.py:605) — the closest
analogous field in the schema and the same conceptual cluster (delivery money,
display-only). The schema's OTHER money columns are NUMERIC(10,2)
(`products.price` :848, `price_min/price_max` :546-547, `price_per_person`
:1044, `price_per_unit_*` :1316-1317), and matching those instead was the
initial proposal — rejected by Sapir 27/07: two adjacent delivery-money fields
with different types fork serialization (`Decimal` vs `int` in the same Pydantic
response), rendering, and fixtures. Israeli delivery fees and free-delivery
thresholds are whole shekels, and these fields are display-only — no checkout,
no transaction, no cent-level arithmetic anywhere downstream.

Nullable with NO server_default and NO backfill: existing producer rows predate
the fields and stay NULL, so nothing changes on any public page until an owner
fills them in. Expand-only per ADR-007 — two additive nullable columns, no
behaviour change at the schema layer. EXPECTED_TABLES is unchanged (columns,
not a table), so the CI workflow file needs no edit.

NO DB CHECK constraint. The value rules — both >= 0, `free_delivery_above` > 0
when set — are enforced at the API boundary in `schemas.ProducerUpdate`
(chunk 2), mirroring `order_window` (f4a1e9c3b7d2) and `availability_state`.
App-layer enforcement keeps a bad payload a clean 422 instead of a 500 from a
constraint violation.

Chain note: `b9d3f1a7c2e4` is the MEH-1541/MEH-1543 merge revision and is the
SINGLE head as of this file. Verified by parsing every `down_revision` in
backend/alembic/versions/ (45 revisions) with module docstrings stripped — a
naive scan reports extra heads because prose lines such as
`down_revision = a9f2c7d41b6e (MEH-1490 ...)` inside a docstring
(20260723_1000_d51508a7c9e2:24) match a bare `^down_revision` pattern.

# DO NOT tighten to NOT NULL, add a server_default, or add a CHECK without a
#        separate Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "c7e2a4b91f38"
down_revision: Union[str, None] = "b9d3f1a7c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("delivery_fee", sa.Integer(), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("free_delivery_above", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "free_delivery_above")
    op.drop_column("producers", "delivery_fee")
