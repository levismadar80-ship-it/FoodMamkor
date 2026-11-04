"""meh2644_rescue_bags

Revision ID: a1c9f3e8d204
Revises: 4b7e1d2c9a60
Create Date: 2026-11-04 00:20:00.000000+00:00

MEH-2644 (chunk 1/4 of the rescue-bags pilot, parent MEH-2643): the four tables a rescue bag
needs, plus the one counter the no-show rule reads. No endpoints, no UI, no
payment — the feature stays invisible behind RESCUE_BAGS_ENABLED.

PILOT SHAPE — this revision deliberately differs from the original chunk-1
spec, per Sapir's 03/11 ruling (no payment in the pilot; buyers pay at the
counter):
  - `rescue_orders` has NO `amount_agorot` and NO `paid_at`.
  - its status set is reserved | handed | no_show | cancelled — `paid` is
    absent, because nothing in the pilot can pay.
  - `users.rescue_no_show_count` is added in THIS revision, not a later one:
    the two-no-shows-in-30-days block is a pilot rule, not a follow-up.
Adding `paid` / `amount_agorot` later is an expand-phase change (new nullable
column, widened CHECK) and needs no rewrite of this file — see ADR-007.

Expand-only per ADR-007: four new, empty tables plus one NOT NULL column with
a server_default on `users`. No existing read path touches any of it, so the
previous container keeps serving unchanged while this runs. No backfill:
nothing could be reserved before this revision, and 0 is the correct no-show
count for every existing account.

Adds four tables -> EXPECTED_TABLES 43 -> 47 (.github/workflows/pr-checks.yml).
(The chunk-1 spec said "34->38"; 34 was the count in early 2026. Measured on
this branch: the live line reads 43.)

Shape notes, in the order the tables are created:

`rescue_offers` — one row per business location per day. `producer_location_id`
(not `producer_id`): a bag is collected at a physical point, and chunk 2 refuses
a location whose `location_precision` is not `exact`. `qty_left` is the
decremented counter chunk 2 locks with `with_for_update` (group_buys.py,
MEH-773); the CHECK `0 <= qty_left <= qty_total` is what makes an oversell a
failed transaction instead of a negative number. Money is integer agorot, never
float. `status` is active | cancelled only — a sold-out offer is `qty_left = 0`
and a finished one is `pickup_end` in the past, so neither needs a status value
of its own.

`rescue_orders` — one reservation. `pickup_code` is CHAR(4) and the buyer reads
it aloud at the counter; UNIQUE (offer_id, pickup_code) is what lets the
business type 4 digits and get exactly one order. It is unique per OFFER, not
globally: two businesses may both issue 0431 on the same day. `qty` is capped at
2 by CHECK, which is the pilot's "max 2 bags" rule held at the database rather
than only in a validator. `handed_by` is SET NULL, not CASCADE — deleting the
staff account that handed a bag over must not delete the record that it was
handed over.

`rescue_reviews` — `order_id` is UNIQUE: one review per reservation. The two
`*_tags` columns are JSONB (not JSON) so a later containment query stays cheap,
matching producers.order_window (models.py:434).

`rescue_typical_items` — "בדרך כלל: …", one row per business, hence
`producer_id` UNIQUE. Keyed on `producer_id` and not `producer_location_id`
because what a bakery typically packs does not change between its branches.

`users.rescue_no_show_count` — NOT NULL DEFAULT 0 with a server_default so the
existing rows get 0 without a backfill pass. It is a count, not a flag: the
30-day window is applied by chunk 2 reading `rescue_orders.status`, and this
column is the cheap denormalised counter the 422 gate checks first.

downgrade() drops all four tables and the column — every reservation, code and
review is forgotten, which is the pre-MEH-2644 state. Nothing outside these
four tables and that one column is touched.

Chained on 4b7e1d2c9a60 (MEH-2612, the staging head on 03/11 — verified by
grepping every revision file for a child, and it has none). PR #3908 carries
d4e7a1b2c3f5 on the same parent; whichever merges second must be re-chained
onto the other, or `alembic heads` returns two heads and CI reds.

# DO NOT create these tables anywhere else — Alembic is the sole schema
#        authority since MEH-267.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1c9f3e8d204"
down_revision: Union[str, None] = "4b7e1d2c9a60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rescue_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "producer_location_id", postgresql.UUID(as_uuid=True), nullable=False
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("qty_total", sa.Integer(), nullable=False),
        sa.Column("qty_left", sa.Integer(), nullable=False),
        sa.Column("price_agorot", sa.Integer(), nullable=False),
        sa.Column("value_min_agorot", sa.Integer(), nullable=True),
        sa.Column("value_max_agorot", sa.Integer(), nullable=True),
        sa.Column("pickup_start", sa.DateTime(), nullable=False),
        sa.Column("pickup_end", sa.DateTime(), nullable=False),
        sa.Column("cancel_until", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["producer_location_id"], ["producer_locations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "status IN ('active', 'cancelled')", name="rescue_offers_status_check"
        ),
        sa.CheckConstraint(
            "qty_total >= 1 AND qty_total <= 20", name="rescue_offers_qty_total_check"
        ),
        sa.CheckConstraint(
            "qty_left >= 0 AND qty_left <= qty_total",
            name="rescue_offers_qty_left_check",
        ),
        sa.CheckConstraint("price_agorot >= 0", name="rescue_offers_price_check"),
        sa.CheckConstraint(
            "pickup_end > pickup_start", name="rescue_offers_pickup_window_check"
        ),
    )
    # The public list is "today's offers at a location" — one composite index
    # serves it and the per-location dashboard query both.
    op.create_index(
        "ix_rescue_offers_location_date",
        "rescue_offers",
        ["producer_location_id", "date"],
    )

    op.create_table(
        "rescue_orders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("offer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("qty", sa.Integer(), nullable=False),
        sa.Column("pickup_code", sa.CHAR(length=4), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("handed_at", sa.DateTime(), nullable=True),
        sa.Column("handed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["offer_id"], ["rescue_offers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["handed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("offer_id", "pickup_code", name="uq_rescue_orders_code"),
        sa.CheckConstraint(
            "status IN ('reserved', 'handed', 'no_show', 'cancelled')",
            name="rescue_orders_status_check",
        ),
        sa.CheckConstraint("qty >= 1 AND qty <= 2", name="rescue_orders_qty_check"),
        sa.CheckConstraint(
            "pickup_code ~ '^[0-9]{4}$'", name="rescue_orders_pickup_code_check"
        ),
    )
    # "my reservations", and the no-show count over a 30-day window, both read
    # by user_id; the UNIQUE above leads with offer_id and cannot serve them.
    op.create_index("ix_rescue_orders_user_id", "rescue_orders", ["user_id"])

    op.create_table(
        "rescue_reviews",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("contents_tags", postgresql.JSONB(), nullable=True),
        sa.Column("highlight_tags", postgresql.JSONB(), nullable=True),
        sa.Column("photo_url", sa.String(length=500), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["rescue_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("order_id", name="uq_rescue_reviews_order"),
        sa.CheckConstraint(
            "rating >= 1 AND rating <= 5", name="rescue_reviews_rating_check"
        ),
    )

    op.create_table(
        "rescue_typical_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("items", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["producer_id"], ["producers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("producer_id", name="uq_rescue_typical_items_producer"),
    )

    op.add_column(
        "users",
        sa.Column(
            "rescue_no_show_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "rescue_no_show_count")
    op.drop_table("rescue_typical_items")
    op.drop_table("rescue_reviews")
    op.drop_index("ix_rescue_orders_user_id", table_name="rescue_orders")
    op.drop_table("rescue_orders")
    op.drop_index("ix_rescue_offers_location_date", table_name="rescue_offers")
    op.drop_table("rescue_offers")
