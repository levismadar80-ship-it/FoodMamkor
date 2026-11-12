"""meh2974_producer_owner_invite

Revision ID: a7f3c2e94d18
Revises: c05dbc247ca1
Create Date: 2026-11-12 20:00:00.000000+00:00

MEH-2974 (הזמנת בעלים לעסק שהועלה ע״י אדמין): eleven nullable columns on
`producers` holding ONE outstanding owner invite per business.

(Eight when first written; the card's v3 revision added the three
`owner_invite_code_*` columns. They join THIS revision rather than chaining a
second one because it has not shipped — nothing has run `upgrade head` against
it outside a scratch database, so there is no deployed schema to expand FROM.
A follow-up revision would have been the right answer the moment it merges.)

  - `owner_invite_email`        VARCHAR(200) — where the invite was sent
  - `owner_invite_name`         VARCHAR(200) — the addressee, for «היי {name}»
  - `owner_invite_token_hash`   VARCHAR(64), indexed — sha256 HEX of the link
                                token. NEVER the token itself.
  - `owner_invite_expires_at`   TIMESTAMPTZ  — 7 days from the mint
  - `owner_invite_sent_at`      TIMESTAMPTZ  — when the latest invite was sent
  - `owner_invite_accepted_at`  TIMESTAMPTZ  — set once, at acceptance
  - `owner_invite_consent_note` TEXT         — the admin's record of the
                                written consent («אישור בוואטסאפ, 12/11»)
  - `owner_invite_created_by`   UUID FK users.id ON DELETE SET NULL — which
                                admin minted it
  - `owner_invite_code_hash`    VARCHAR(64)  — sha256 HEX of the 6-digit email
                                verification code. NEVER the code itself.
  - `owner_invite_code_expires_at` TIMESTAMPTZ — 10 minutes from the send
  - `owner_invite_code_attempts`   INTEGER  — wrong guesses against the current
                                code; the code dies at the cap, so a 6-digit
                                secret cannot be walked

WHY COLUMNS AND NOT A TABLE
---------------------------
The `EXPECTED_TABLES` step lives in the PR-checks workflow, and
`.github/workflows/**` is CC-deny (MEH-671), so a new table cannot ship from a
CC session without a workflow edit. Precedents for taking the column form for
exactly this reason: `f4a1e9c3b7d2` (MEH-1543, `order_window`) and
`c4e81b7a2f96` (MEH-1889, `special_hours`). EXPECTED_TABLES unchanged — these
are columns, not a table.

The shape also says something true about the domain: a business has at most ONE
outstanding invite. Re-inviting REPLACES the row's token (which is how an
outstanding link is revoked), and there is deliberately no invite history in v1.
The same holds for the email code: one live code per business, replaced by the
next send and cleared by a resend, a cancel or an acceptance.

WHY THE HASH AND NOT THE TOKEN
------------------------------
`owner_invite_token_hash` is the sha256 hex digest (64 chars) of a
`secrets.token_urlsafe(32)`. The raw token exists only in the response to the
creating admin and in the email. A reader of the database — a restored dump, a
support query, the admin's own MCP reader — therefore cannot accept an invite
on someone's behalf. The lookup hashes the candidate and matches on this column;
it never compares raw strings.

Indexed because that lookup is the hot path of the public endpoint, and because
an unindexed scan on a growing table is how a timing side channel gets built by
accident. The index is `ix_producers_owner_invite_token_hash` (SQLAlchemy's
`index=True` name for this column), and it is NOT unique: a unique index would
turn the astronomically unlikely hash collision into a 500 on the admin side
rather than a 404 on the public one, and uniqueness is not what makes the token
safe — 256 bits of entropy is.

NULLABLE, NO server_default, NO BACKFILL
----------------------------------------
Expand-only per ADR-007. Every existing producer row predates the feature and
stays NULL, which reads as "never invited" — the state every self-registered
business is in and stays in. Zero behaviour change at the schema layer.

The `ON DELETE SET NULL` on `owner_invite_created_by` matches every other
`users.id` audit reference in the schema (models.py:1591, :1756, :2216, :2335,
:2481): deleting an admin account must not delete the businesses she created,
and must not fail on the FK. The audit then degrades to "an admin, no longer on
the system", which is the honest answer.

The FK carries an EXPLICIT NAME, `fk_producers_owner_invite_created_by_users`,
rather than Postgres's `producers_owner_invite_created_by_fkey` default, and the
model side pairs it with `use_alter=True`. That is not cosmetic: `users.producer_id`
already references `producers`, so this reference closes a producers <-> users
cycle, and SQLAlchemy cannot order a `drop_all` across an unnamed one. The repo
has the same pair on `producers.top_product_id` (models.py:295-302) for the
products <-> producers cycle; this follows it. Measured: with a bare
`ForeignKey("users.id", ondelete="SET NULL")` the whole pytest suite errored at
`conftest._bootstrap_schema` with CircularDependencyError, not just this
feature's tests. The name here and the name in the model must stay equal.

DOWNGRADE drops the index, the FK and the eight columns. The VALUES are not
restorable — same posture as `c4e81b7a2f96` (MEH-1889) and `d4e7a92c81b5`
(MEH-766). Dropping them invalidates every outstanding invite link, which is
the correct outcome for a rollback: the tokens' only store is gone.

# DO NOT tighten any of these to NOT NULL or add a server_default without a
#        separate Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
# DO NOT add the raw token as a column "for debugging" — see above.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a7f3c2e94d18"
down_revision: Union[str, None] = "c05dbc247ca1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "ix_producers_owner_invite_token_hash"
_FK = "fk_producers_owner_invite_created_by_users"


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("owner_invite_email", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_name", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_token_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column(
            "owner_invite_accepted_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "producers", sa.Column("owner_invite_consent_note", sa.Text(), nullable=True)
    )
    op.add_column(
        "producers",
        sa.Column(
            "owner_invite_created_by", postgresql.UUID(as_uuid=True), nullable=True
        ),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_code_hash", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column(
            "owner_invite_code_expires_at", sa.DateTime(timezone=True), nullable=True
        ),
    )
    op.add_column(
        "producers",
        sa.Column("owner_invite_code_attempts", sa.Integer(), nullable=True),
    )
    op.create_index(_INDEX, "producers", ["owner_invite_token_hash"], unique=False)
    op.create_foreign_key(
        _FK,
        "producers",
        "users",
        ["owner_invite_created_by"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "producers", type_="foreignkey")
    op.drop_index(_INDEX, table_name="producers")
    op.drop_column("producers", "owner_invite_code_attempts")
    op.drop_column("producers", "owner_invite_code_expires_at")
    op.drop_column("producers", "owner_invite_code_hash")
    op.drop_column("producers", "owner_invite_created_by")
    op.drop_column("producers", "owner_invite_consent_note")
    op.drop_column("producers", "owner_invite_accepted_at")
    op.drop_column("producers", "owner_invite_sent_at")
    op.drop_column("producers", "owner_invite_expires_at")
    op.drop_column("producers", "owner_invite_token_hash")
    op.drop_column("producers", "owner_invite_name")
    op.drop_column("producers", "owner_invite_email")
