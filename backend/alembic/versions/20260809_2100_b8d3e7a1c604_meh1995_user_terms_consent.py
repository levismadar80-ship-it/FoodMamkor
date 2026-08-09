"""MEH-1995 — record terms acceptance on users (terms_accepted_at + terms_version)

Persists the consent event that the registration form already collects and then
throws away: today the checkbox in RegisterClient.jsx only sets `disabled` on
the submit button, and nothing about the acceptance reaches the database. The
result is that the platform holds NO evidence any user ever accepted the terms.

Why this is a compliance column and not bookkeeping (MEH-1981): Amendment 13 to
the Privacy Protection Law allows a claim for statutory damages WITHOUT proof of
damage for defective notice. The defence against "no terms were ever shown to
me" is a timestamped row naming the version accepted. A timestamp alone proves
that someone agreed; pairing it with the version proves WHAT they agreed to,
which is what matters once the wording is edited.

Shape is copied deliberately from producers.declared_at / declaration_version
(MEH-759) rather than invented — same purpose, same nullability, same
Expand-only treatment under ADR-007.

NO BACKFILL, and that is the substantive decision in this migration. Every
existing user gets NULL, because NULL is the honest statement: we hold no
record of their acceptance. Stamping a retroactive timestamp would assert they
agreed at a moment we cannot evidence — which manufactures exactly the proof
this column exists to provide, and would be worse than holding nothing. The
same reasoning is already recorded on the producers pair ("Both nullable,
Expand-only (ADR-007, no backfill)", models.py).

Scope note carried from the ticket: only the two PASSWORD registration paths
write these columns. The three OAuth account-creation paths (Google consumer,
Apple consumer, OAuth producer step-0) present no terms checkbox at all, so
there is no consent event to record on them. Their rows stay NULL until that
product gap is closed — see MEH-1995.

Reversibility: downgrade drops both columns. No other data is touched, so a
re-upgrade lands on the same schema. Consent records captured between deploy
and downgrade ARE lost — acceptable only because downgrade exists to revert a
failed staging deploy, not to roll back production history.

Revision ID: b8d3e7a1c604
Revises: a2f7d4c8e153
Create Date: 2026-08-09 21:00:00+00:00

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b8d3e7a1c604'
down_revision: Union[str, None] = 'a2f7d4c8e153'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # timezone=True to match producers.declared_at and password_changed_at.
    # The stamping sites use now(timezone.utc), never the naive utcnow().
    op.add_column(
        'users',
        sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True),
    )
    # VARCHAR(10) mirrors producers.declaration_version; constants.TERMS_VERSION
    # must stay within it ("2026-08-v1" = 10 chars exactly).
    op.add_column(
        'users',
        sa.Column('terms_version', sa.String(length=10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('users', 'terms_version')
    op.drop_column('users', 'terms_accepted_at')
