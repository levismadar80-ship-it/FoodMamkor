"""meh2642_clear_unverified_suggester_emails

Revision ID: e4b8d2f6a913
Revises: c3e7a1f5d829
Create Date: 2026-11-14 15:30:00.000000+00:00

MEH-2642 — data-only, no schema change. Until PR #4498, POST
/business-suggestions took any typed address plus a "send me an update" tick
with no proof the address belonged to whoever typed it. #4498 stops new ones
(the update goes only to a signed-in, verified account) and refuses to thank
an address that is not one. This revision clears what the old form left
behind: on a community lead whose address is NOT the address of a verified
account, `suggested_by_email` becomes NULL and `suggester_wants_update`
becomes false. Leads whose address IS a verified account keep both.

Recorded: the number of rows cleared is logged on upgrade (a count only,
never an address). Reversal point: the database backup taken before the
release that applies this revision. Downgrade is a no-op on purpose; putting
the addresses back would mean storing them somewhere else first, which is
the PII this revision exists to drop.

Sapir approved the cleanup 14/11 («מאשרת את הכל לפי ההמלצות»).

# DO NOT add schema changes here — this revision is data-only.
"""

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e4b8d2f6a913"
down_revision: Union[str, None] = "c3e7a1f5d829"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")

# Shared with tests/test_meh2642_clear_unverified_suggester_emails.py, which
# runs this exact statement against seeded rows.
CLEANUP_SQL = sa.text(
    """
    UPDATE outreach_leads AS l
       SET suggested_by_email = NULL,
           suggester_wants_update = false
     WHERE l.source = 'community'
       AND l.suggested_by_email IS NOT NULL
       AND NOT EXISTS (
             SELECT 1 FROM users u
              WHERE lower(u.email) = lower(trim(l.suggested_by_email))
                AND u.email_verified IS TRUE
           )
    """
)


def upgrade() -> None:
    result = op.get_bind().execute(CLEANUP_SQL)
    log.info("MEH-2642: cleared %s unverified suggester address(es)", result.rowcount)


def downgrade() -> None:
    # No-op on purpose: see the module docstring.
    pass
