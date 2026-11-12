"""meh2952_mcp_reader_is_test

Revision ID: c05dbc247ca1
Revises: b8cb5480552f
Create Date: 2026-11-11 18:00:00.000000+00:00

MEH-2952 (chunk 1b): the chat's read-only role may read `producers.is_test`,
so its four tools (app/services/chat_db_tools.py) can hide seeded test
businesses the way every other public reader does.

- Role: `mcp_reader` (NOLOGIN, created by a29c7a4a41e7). Nothing else changes
  for it.
- Exactly one column is added: SELECT (is_test) ON producers. Its other
  column grants (id, name, city, slug, status, kind) stay as they are; no
  other table is touched. `users.is_test` is NOT granted: mcp_reader has no
  access to `users` at all, and keeps none.
- Column-level, like every grant this role holds: the privilege layer still
  keeps producers.phone / contact_email / contact_name / address /
  whatsapp_group out of reach.

No table or column changes: EXPECTED_TABLES and `alembic check` are
unaffected. Needs b8cb5480552f (the column must exist before it can be
granted). Must be on staging before MEH-2952 chunk 4, the first writer of
is_test.

# DO NOT grant INSERT/UPDATE/DELETE here, ever — read-only is the point.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c05dbc247ca1"
down_revision: Union[str, None] = "b8cb5480552f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ROLE = "mcp_reader"
GRANT = "GRANT SELECT (is_test) ON producers TO mcp_reader"


def upgrade() -> None:
    op.execute(GRANT)


def downgrade() -> None:
    # Column-level REVOKE removes only this column's privilege; the six
    # columns granted by a29c7a4a41e7 are untouched.
    op.execute(f"REVOKE SELECT (is_test) ON producers FROM {ROLE}")
