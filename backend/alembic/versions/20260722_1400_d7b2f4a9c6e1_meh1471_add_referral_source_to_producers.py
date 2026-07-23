"""meh1471_add_referral_source_to_producers

Revision ID: d7b2f4a9c6e1
Revises: d51508a7c9e2
Create Date: 2026-07-22 14:00:00.000000+00:00

MEH-1471 (self-reported attribution — "מאיפה שמעת עלינו?"): adds two nullable
columns to `producers` capturing how a business found מהמקור, chosen at the
final step of the producer registration wizard:

  - `referral_source`        VARCHAR(40), nullable — an English key from the
                             fixed allowed-keys set (business_referral,
                             friends_family, instagram, facebook, google,
                             whatsapp_group, other, prefer_not_to_say). The
                             Hebrew label is rendered from i18n; the DB stores
                             the stable English key. Validated against the
                             allowed set at the API boundary (422 on an unknown
                             value) — no DB CHECK/enum (app-layer enforcement,
                             mirroring availability_state / verification_doc_type).
  - `referral_source_other`  VARCHAR(120), nullable — the optional free-text
                             answer revealed only when `referral_source` ==
                             "other". Bleach-sanitised at the API boundary.

Both nullable with NO server_default and NO backfill: existing producer rows
predate the field and stay NULL (admin detail renders "—"). Required-ness is a
front-end registration gate only (the DB column is not tightened), so the MEH-143
upgrade path and every existing test that omits the field keep working.

Expand-only per ADR-007 — two additive nullable columns, no behaviour change at
the schema layer. EXPECTED_TABLES unchanged (columns, not a table).

# DO NOT tighten to NOT NULL or add a server_default without a separate
#        Expand-Contract ticket (ADR-007). Alembic is the sole schema
#        authority since MEH-267.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d7b2f4a9c6e1"
# MEH-1471: originally chained onto b3f1a9c7e2d4 (MEH-1457); rebased once onto
# a9f2c7d41b6e (MEH-1490) after that forked the tree, and rebased again onto
# d51508a7c9e2 (MEH-1508, dietary_scope) after the 2026-07-23 staging merge
# forked it a second time (both branched off a9f2c7d41b6e). Chaining onto the
# current head d51508a7c9e2 restores a single linear head (single-head
# discipline, MEH-267). All three are independent additive `producers` columns;
# order is immaterial.
down_revision: Union[str, None] = "d51508a7c9e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "producers",
        sa.Column("referral_source", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "producers",
        sa.Column("referral_source_other", sa.String(length=120), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("producers", "referral_source_other")
    op.drop_column("producers", "referral_source")


# MEH-1471 re-trigger note: the marker line was removed from the PR body, but an
# empty commit did not fire a CI run, so the required marker gate never re-read
# the corrected body. This comment is the minimal real diff that regenerates the
# event. Comment only, no behaviour change.
