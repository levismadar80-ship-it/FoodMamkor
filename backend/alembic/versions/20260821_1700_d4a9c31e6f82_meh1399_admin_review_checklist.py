"""meh1399_admin_review_checklist

Revision ID: d4a9c31e6f82
Revises: c9f2a41e8b03

Re-parented from c3e9a1f7b204 to c9f2a41e8b03 (MEH-2139, category_slug NOT NULL)
after that revision landed on staging off the SAME parent, forking the chain into
two heads. Re-parented rather than merged because this revision has never been
applied anywhere — it is not on staging, and CI builds its database from scratch
on every run — so moving its parent rewrites nothing that exists. A merge revision
would have been the answer had it ever run against a real database; here it would
only add a permanent empty node to the chain.

c9f2a41e8b03 adds no tables (constraint change only), so the EXPECTED_TABLES
40 -> 42 bump this migration needs is unchanged by the re-parent.
Create Date: 2026-08-21 17:00:00.000000+00:00

MEH-1399 Phase 2: the pre-approval review checklist moves from a static
frontend config to the database, and every tick becomes an audit record.

Phase 1 (MEH-1396) put the knowledge from docs/VERIFICATION.md in front of the
admin at approval time, but left two gaps: editing an item required a deploy,
and the ticks evaporated with the session, so nothing recorded WHAT was checked
before a given business went live.

Two tables:

* `admin_checklist_items` — the editable list. Seeded here with the same 7
  items `frontend/lib/admin-review-checklist.js` already ships, so the switch
  is a change of source, not of content.
* `producer_review_checks` — one row per (producer, item) that was ticked,
  carrying who ticked it and when.

## Why `label_snapshot` exists, and why it is NOT redundant with the FK

The check row stores the item's label AS IT READ when it was ticked, alongside
the FK to the item. That looks like duplication and is the opposite: the whole
point of the audit trail is to answer "what did the admin actually attest to",
and an admin editing an item's wording later would otherwise silently rewrite
the meaning of every historical tick. The FK says which item; the snapshot says
what it said.

Same reasoning the sibling `producer_name_change_requests.current_name`
(b7d3e1a94c26) records the name as it stood at filing rather than reading it
back at review time.

## The three delete behaviours are each deliberate

* `producer_review_checks.producer_id` -> **CASCADE**. The checks describe a
  business; if the business row is gone there is nothing left to attest about.
* `producer_review_checks.item_id` -> **RESTRICT**. This is the ticket's
  "no delete — deactivate only" rule enforced in the schema rather than trusted
  to the router: a DELETE against an item that has ever been ticked fails at
  the database, so audit history cannot be destroyed by removing its subject.
  `active = false` is the sanctioned retirement path.
* `producer_review_checks.checked_by` -> **SET NULL**, nullable. Deleting an
  admin account must not delete the record that a check happened. The row
  survives with a null actor, which is a weaker record than a named one and a
  far better one than no record. Matches the existing `users.id SET NULL`
  precedent at models.py:1414.

## `updated_at` is not `created_at`

`admin_checklist_items` carries only `updated_at` (server default now, refreshed
on edit) because the question anyone asks of a config row is when it last
changed, not when it was first written. The audit surface is the other table.

## Two new tables -> EXPECTED_TABLES 40 -> 42

The workflow file holding that constant is CC-deny (MEH-671), so this revision
cannot make that edit. The one-line diff is presented alongside for Sapir to
apply; without it the migration-drift gate fails on a table count of 42 against
an expected 40.

## Seeding

Seven INSERTs of reference data, executed inline. This is NOT the ADR-007
backfill case — nothing is being read or rewritten across existing rows; a new
config table is being given its initial contents, and an empty checklist would
render an empty admin surface. `position` values are spaced 10 apart so a later
insertion between two items needs no renumbering.

`downgrade()` drops both tables, children first — the checks table holds the FK.

# DO NOT delete a checklist item — the RESTRICT above is load-bearing.
#        Retire it with `active = false`, or the audit trail loses its subject.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd4a9c31e6f82'
down_revision: Union[str, None] = 'c9f2a41e8b03'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# The 7 items as they stand in frontend/lib/admin-review-checklist.js today.
# Copied rather than imported for the obvious reason: a migration must keep
# producing the same rows years from now, whatever that file has become.
_SEED_ITEMS = [
    (10, "פרטים בסיסיים תקינים", "שם, עיר, טלפון, קטגוריות, תיאור ברמת מגזין"),
    (20, "תמונות שייכות לעסק ואיכותיות", "חשד לתמונת סטוק — בדקי חיפוש הפוך"),
    (30, "רישיון הוצלב מול מאגר משרד הבריאות", "שם תואם, מספר תואם, תוקף בתוקף"),
    (40, "כשרות: תעודה נבדקה (אם הוצהרה)", None),
    (50, "סימני חיים: אתר / אינסטגרם / גוגל תואמים לעסק", None),
    (60, "שיחה קצרה בוצעה (רק אם risk גבוה או ספק)", None),
    (70, "החלטה מנומקת: אישור / השלמה / דחייה", None),
]


def upgrade() -> None:
    items = op.create_table(
        'admin_checklist_items',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
            nullable=False,
        ),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('label', sa.Text(), nullable=False),
        sa.Column('hint', sa.Text(), nullable=True),
        sa.Column(
            'active',
            sa.Boolean(),
            server_default=sa.text('true'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
    )
    op.create_index(
        'ix_admin_checklist_items_position', 'admin_checklist_items', ['position']
    )

    op.bulk_insert(
        items,
        [
            {'position': position, 'label': label, 'hint': hint}
            for position, label, hint in _SEED_ITEMS
        ],
    )

    op.create_table(
        'producer_review_checks',
        sa.Column(
            'id',
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text('gen_random_uuid()'),
            nullable=False,
        ),
        sa.Column(
            'producer_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('producers.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'item_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('admin_checklist_items.id', ondelete='RESTRICT'),
            nullable=False,
        ),
        sa.Column('label_snapshot', sa.Text(), nullable=False),
        sa.Column(
            'checked_by',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('users.id', ondelete='SET NULL'),
            nullable=True,
        ),
        sa.Column(
            'checked_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.UniqueConstraint(
            'producer_id', 'item_id', name='uq_producer_review_checks_producer_item'
        ),
    )
    op.create_index(
        'ix_producer_review_checks_producer_id',
        'producer_review_checks',
        ['producer_id'],
    )
    # item_id needs its OWN index, and the unique constraint above does not
    # provide it: (producer_id, item_id) leads with producer_id, so it cannot
    # serve a lookup keyed on item_id alone. Postgres enforces the RESTRICT on
    # every DELETE against admin_checklist_items by scanning for referencing
    # rows — unindexed, that is a sequential scan of the whole checks table.
    # The RESTRICT is the point of the design, so the index that makes it cheap
    # is not optional. (CI reviewer, MEH-1399.)
    op.create_index(
        'ix_producer_review_checks_item_id',
        'producer_review_checks',
        ['item_id'],
    )
    # checked_by is ON DELETE SET NULL, which makes Postgres locate every
    # referencing row on each admin-account DELETE — the same scan the RESTRICT
    # forces above, on the other FK. (CI reviewer, MEH-1399.)
    op.create_index(
        'ix_producer_review_checks_checked_by',
        'producer_review_checks',
        ['checked_by'],
    )


def downgrade() -> None:
    # Children first — producer_review_checks holds the FK into the items table.
    op.drop_index(
        'ix_producer_review_checks_checked_by', table_name='producer_review_checks'
    )
    op.drop_index(
        'ix_producer_review_checks_item_id', table_name='producer_review_checks'
    )
    op.drop_index(
        'ix_producer_review_checks_producer_id', table_name='producer_review_checks'
    )
    op.drop_table('producer_review_checks')
    op.drop_index(
        'ix_admin_checklist_items_position', table_name='admin_checklist_items'
    )
    op.drop_table('admin_checklist_items')
