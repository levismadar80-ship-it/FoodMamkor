"""meh1898_custom_offer_type

Revision ID: e4b1c72d9a35
Revises: d8c3f1a75e29
Create Date: 2026-08-04 10:00:00.000000+00:00

MEH-1898: adds a fifth member, `custom`, to the `producer_offer_type` CHECK on
`producer_offers`. Nothing else about the table changes — no column, no index,
no table, so `EXPECTED_TABLES` is untouched.

`custom` is the owner wording her own offer. The other four types each carry a
platform-authored sentence (`producer.offer.text.*` in the i18n bundles), so
the owner's `headline` sits UNDER that sentence as a secondary line. `custom`
has no such sentence, so its `headline` IS the offer text on every consumer
surface. That is a rendering rule and it is enforced where rendering happens
(frontend/components/OfferBadge.jsx), not here.

WIDENING, not narrowing. Every row that satisfied the old condition satisfies
the new one, so this takes no backfill and cannot orphan an existing row —
which is why ADR-007 Expand-Contract does not apply (it governs DROP / RENAME /
type change / NOT NULL on an existing column, none of which happen here).

DROP + ADD, because Postgres has no `ALTER TABLE ... ALTER CONSTRAINT` for a
CHECK condition. The re-ADD scans the whole table to validate; `producer_offers`
holds at most one row per business and takes an ACCESS EXCLUSIVE lock only for
the duration of that scan, which at this table's size is not an availability
concern. `NOT VALID` + `VALIDATE CONSTRAINT` would avoid even that, and is
deliberately not used: it would leave the constraint unvalidated if the second
step were ever skipped, buying nothing measurable on a table this small.

The condition text is kept BYTE-IDENTICAL to `ProducerOffer.__table_args__` in
backend/app/models/models.py, including the string-literal line break. Both
places declare it — the defence-in-depth CHECK precedent, and the same choice
revision b6e1d94a3f27 made when it created the table — because `alembic check`
does NOT
diff CHECK conditions. A drift between the two would therefore be invisible to
CI: a fresh `create_all` test DB would accept `custom` while a migrated
staging DB rejected it, and only a production 500 would say so.

# DO NOT re-order the four original values while editing this list — the
#        condition is compared by eye against models.py, and a reordered
#        equivalent is exactly the kind of "same meaning, different text"
#        drift the byte-identical rule exists to make checkable.

DOWNGRADE FAILS LOUDLY if any `custom` row exists, and that is the intended
behaviour rather than an oversight. Re-adding the four-value CHECK runs a
validating scan, so Postgres raises `check constraint ... is violated by some
row` and the migration aborts with the table untouched. The alternative — a
`DELETE` or an `UPDATE` of the offending rows inside `downgrade()` — would
silently destroy offers a business owner wrote. A human rolling back past this
revision must decide what happens to those rows first; the failure is the
prompt to make that decision.
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "e4b1c72d9a35"
# Chain head derived by AST-parsing the module-level `revision` /
# `down_revision` assignments across backend/alembic/versions/ and taking the
# revision nothing points back to — d8c3f1a75e29
# (20260803_1200_d8c3f1a75e29_meh1849_nationwide_requires_delivery.py). Cited
# by filename rather than by bare Linear identifier: this docstring is pasted
# verbatim into the PR body, where an identifier auto-links and flips an
# already-Done issue back to In Progress (rule 29). AST and not a regex, for the
# reason b6e1d94a3f27 records: several revisions quote `down_revision = ...`
# inside their DOCSTRINGS, and a text regex counts those as real edges and
# mis-reports the graph as having two heads. SINGLE head, so this extends the
# chain linearly and needs no merge revision.
down_revision: Union[str, None] = "d8c3f1a75e29"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Byte-identical to models.py `ProducerOffer.__table_args__`. Named so the two
# call sites below (upgrade re-ADD) cannot drift from each other either.
_TYPE_CHECK_WITH_CUSTOM = (
    "offer_type IN ('free_delivery_above', 'gift_above', "
    "'first_order', 'pickup_discount', 'custom')"
)

# The pre-MEH-1898 condition, restored by downgrade(). Kept byte-identical to
# revision b6e1d94a3f27, so a downgrade returns the table to a state that
# string-matches the revision that created it.
_TYPE_CHECK_ORIGINAL = (
    "offer_type IN ('free_delivery_above', 'gift_above', "
    "'first_order', 'pickup_discount')"
)


def upgrade() -> None:
    op.drop_constraint("producer_offer_type", "producer_offers", type_="check")
    op.create_check_constraint(
        "producer_offer_type", "producer_offers", _TYPE_CHECK_WITH_CUSTOM
    )


def downgrade() -> None:
    # Aborts if a `custom` row exists — see the DOWNGRADE note in the module
    # docstring. That is deliberate; do not add a cleanup DELETE here.
    op.drop_constraint("producer_offer_type", "producer_offers", type_="check")
    op.create_check_constraint(
        "producer_offer_type", "producer_offers", _TYPE_CHECK_ORIGINAL
    )
