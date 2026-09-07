"""meh1889_producer_special_hours

Revision ID: c4e81b7a2f96
Revises: 9849fab1637a
Create Date: 2026-09-04 21:30:00.000000+00:00

MEH-1889 chunk A (שעות מיוחדות לחגים — RED-prep): adds ONE nullable JSONB
column to `producers` holding per-DATE overrides above the weekly hours axes:

  - `special_hours`  JSONB, nullable — date-keyed overrides, shape
                     {"2026-09-22": {"ranges": [{"open": "09:00",
                                                 "close": "13:00"}],
                                     "note": "ערב ראש השנה"}}
                     with `"ranges": []` meaning CLOSED on that date.
                     Keys are ISO `YYYY-MM-DD`. Validated at the API boundary
                     (schemas: date keys, then the SAME per-day range rules as
                     `order_window` — HH:MM 24h, close>open, ascending and
                     non-overlapping, ≤3 ranges -> 422). No DB CHECK/constraint
                     — app-layer enforcement, mirroring `order_window`
                     (f4a1e9c3b7d2) and `availability_state`.

WHY A COLUMN AND NOT A TABLE, and why the ORDER axis is the authoritative one
--------------------------------------------------------------------------
The two weekly axes are NOT symmetric, and the asymmetry is in their types:

  * `producers.order_window` is JSONB and structured (models.py:399) — a date
    override above it is COMPUTABLE.
  * `producers.opening_hours` is an unbounded free-text String (models.py:380,
    MEH-102), as is `producer_locations.opening_hours` (models.py:1047) —
    there is no arithmetic to do against free text.

The repo already ruled these are different facts and that the computed
surfaces read the ORDER axis deliberately, not the store axis:
`services/producer_listing.py:508-514` ("match on the DECLARED ordering
window, not on opening_hours … `opening_hours` is when the shop is staffed;
`order_window` is when the owner said she takes orders") and the same call at
`routers/producers.py:146`.

So this column is ORDER-AXIS AUTHORITATIVE: `special_hours[date].ranges`
overrides `order_window` for that date. `note` is DISPLAY ONLY — the store-hours
surface renders it as text and derives nothing from it. A design that claimed to
override both axes would be half-real, and the unreal half is the half JSON-LD
reads (`frontend/lib/seo.js:311` builds `openingHoursSpecification` from
`resolveStoreHours()`, the free-text store axis).

A column rather than a `producer_special_hours` table: the `EXPECTED_TABLES=42`
step lives in the PR-checks workflow, and `.github/workflows/**` is CC-deny
(MEH-671), so a new table cannot ship without a workflow edit. Precedent for the
column form is f4a1e9c3b7d2 (MEH-1543), which added `order_window` the same way
and records "EXPECTED_TABLES unchanged (a column, not a table)". Per-LOCATION
special hours stay with MEH-1580, which owns the per-location hours question as
a whole.

Nullable with NO server_default and NO backfill: every existing producer row
predates the field and stays NULL (NULL = feature unused -> nothing rendered,
no precedence to apply). Expand-only per ADR-007 — one additive nullable
column, zero behaviour change at the schema layer. EXPECTED_TABLES unchanged
(a column, not a table).

Downgrade drops the column. The VALUES are not restorable — stated here in the
same posture as d4e7a92c81b5 (MEH-766) and 9849fab1637a (MEH-1855).

# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c4e81b7a2f96"
down_revision: Union[str, None] = "9849fab1637a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column(
            "special_hours", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
    )


def downgrade() -> None:
    op.drop_column("producers", "special_hours")
