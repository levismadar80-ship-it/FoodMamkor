"""meh1823_producer_offers

Revision ID: b6e1d94a3f27
Revises: d3b7f1a92c64
Create Date: 2026-08-02 14:00:00.000000+00:00

MEH-1823: creates `producer_offers` — ONE owner-declared, typed, expiring
offer per business.

Why a table and not columns on `producers`: the offer is a bounded, dated
object with its own lifecycle (it expires, it is replaced), not a property
of the business. The four types are closed, so the semantics live in a
CHECK rather than in prose:

  free_delivery_above  — free delivery over a threshold
  gift_above           — a gift with a purchase over a threshold
  first_order          — a first-order benefit
  pickup_discount      — a discount on self-pickup

`threshold_value` + `threshold_unit` exist because the evidence that opened
the ticket could not be expressed at all: "בהזמנה של 10 ליטרים ומעלה –
המשלוח חינם" was free text in the page body, because
`producers.free_delivery_above` is INTEGER **shekels** and a litres/units/kg
threshold has nowhere to go. The two are both-or-neither — a number with no
unit is unrenderable and a unit with no number is meaningless — and that is
a CHECK, not a convention.

`expires_at` is NOT NULL on purpose, and it is the one property here that
protects the business rather than the reader. Amazon coupon data across 240
brands: an always-on coupon converges on ~70% of redemptions coming from
buyers who would have paid full price. An offer that cannot expire is a
permanent discount nobody decided to give. NULL is therefore not available.

`starts_at` is nullable — NULL means "active now"; a future date is a
scheduled offer. Nothing in chunks 2-3 reads it yet.

FIVE CHECKs, not three (gate decision ג). The table is empty today, so a
constraint costs nothing; once rows exist the same constraint is a
migration plus a backfill decision plus app validation. That asymmetry is
the whole argument for adding them now, and it is the MEH-272 lesson in
its cheap direction rather than its expensive one:

  producer_offer_threshold_positive — a stated threshold is > 0. "Free
    delivery over 0" is not a threshold, it is unconditional free delivery,
    and NULL already spells that. Rejecting 0 removes a duplicate spelling,
    not a meaning.
  producer_offer_date_order — expires_at > starts_at when a start is given.
    A window that closes before it opens is unreachable on every date, so
    the row could never be active. Precedent: Shopify PriceRule requires
    ends_at after starts_at.

Deliberately NOT constrained here: no cross-constraint tying offer_type to
threshold presence, and no maximum duration. Both are product decisions
rather than data invariants — see the gate notes in the PR body.

INDEXES — one, not two. The ticket asked for a partial index on
(producer_id) WHERE is_active for lookup AND a unique partial index on the
same column and predicate for the at-most-one-active rule. Those are the
same index: a UNIQUE partial index enforces the rule and serves the lookup,
because Postgres scans it exactly as it would the non-unique twin. A second
identical index would double the write cost and the disk for no read
benefit, so this creates the unique one only. Raised at the chunk-1 gate
rather than silently resolved.

EXPECTED_TABLES: 38 -> 39. A new TABLE moves the CI drift gate at line 354
of .github/workflows/pr-checks.yml, unlike the column-only revisions before.
(rtl-ok — the RTL hook matches "pr-c" inside that filename; no CSS here.)

# DO NOT enforce the offer's business rules only in Pydantic — the CHECKs
#        below are the reason a seed, an import, or a psql session cannot
#        create an offer with no expiry or an unknown type. MEH-272 is the
#        precedent: two constraints lived in the app layer alone and every
#        direct-SQL path went unguarded until a migration added them.
#        Alembic is the sole schema authority since MEH-267.

Expand-only: CREATE TABLE touches no existing row and takes no lock on
`producers`, so ADR-007 Expand-Contract does not apply (it governs DROP /
RENAME / type change / NOT NULL on an existing column — none happen here).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b6e1d94a3f27"
# MEH-1823: chain head derived by AST-parsing the module-level `revision` /
# `down_revision` assignment in all 50 files under backend/alembic/versions/
# and taking the revision nothing points back to — d3b7f1a92c64 (MEH-1818
# pending_nudge_sent_at, 20260802_1200). AST and not a regex on purpose: a
# regex over the file text also matches `down_revision = ...` written inside
# the DOCSTRINGS several revisions carry, which mis-reports the graph — it
# reported two heads here before the parse was corrected. SINGLE head, so
# this extends the chain linearly and needs no merge revision.
down_revision: Union[str, None] = "d3b7f1a92c64"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "producer_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("producer_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("offer_type", sa.Text(), nullable=False),
        sa.Column("threshold_value", sa.Integer(), nullable=True),
        sa.Column("threshold_unit", sa.Text(), nullable=True),
        sa.Column("headline", sa.Text(), nullable=True),
        sa.Column("starts_at", sa.Date(), nullable=True),
        # NOT NULL — see the expiry rationale in the module docstring.
        sa.Column("expires_at", sa.Date(), nullable=False),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.ForeignKeyConstraint(
            ["producer_id"], ["producers.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "offer_type IN ('free_delivery_above', 'gift_above', "
            "'first_order', 'pickup_discount')",
            name="producer_offer_type",
        ),
        sa.CheckConstraint(
            "threshold_unit IN ('ils', 'units', 'liters', 'kg')",
            name="producer_offer_threshold_unit",
        ),
        # Both-or-neither. Written as an equality over two IS NULL tests
        # rather than as two OR'd implications: the equality form is total,
        # so neither direction can be added later and forgotten, and it has
        # no three-valued-logic edge (IS NULL always yields true or false).
        sa.CheckConstraint(
            "(threshold_value IS NULL) = (threshold_unit IS NULL)",
            name="producer_offer_threshold_pair",
        ),
        # Gate decision ג.1 — a stated threshold is a positive quantity.
        # "Free delivery over 0" is not a threshold, it is unconditional free
        # delivery, and that is already expressible as threshold_value NULL.
        # So rejecting 0 removes an ambiguous second spelling rather than a
        # meaning. Negatives are nonsense in every one of the four units.
        sa.CheckConstraint(
            "threshold_value IS NULL OR threshold_value > 0",
            name="producer_offer_threshold_positive",
        ),
        # Gate decision ג.2 — a dated window must run forwards. An offer whose
        # expiry precedes its start can never be active on any date, so it is
        # not a scheduled offer but an unreachable row. Strict `>` and not
        # `>=`: a same-day window would expire on the day it opens.
        # Precedent: Shopify PriceRule requires ends_at after starts_at.
        sa.CheckConstraint(
            "starts_at IS NULL OR expires_at > starts_at",
            name="producer_offer_date_order",
        ),
    )
    # At most ONE active offer per business — and the lookup index for that
    # active row, which is the same index. See the INDEXES note above for
    # why there is no second, non-unique twin.
    op.create_index(
        "uq_producer_offers_active_per_producer",
        "producer_offers",
        ["producer_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_producer_offers_active_per_producer", table_name="producer_offers"
    )
    op.drop_table("producer_offers")
