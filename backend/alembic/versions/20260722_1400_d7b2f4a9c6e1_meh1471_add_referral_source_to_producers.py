"""meh1471_add_referral_source_to_producers

Revision ID: d7b2f4a9c6e1
Revises: b3f1a9c7e2d4
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
# MEH-1471: chains onto the current head b3f1a9c7e2d4 (MEH-1457 group_buy
# fulfillment_note).
down_revision: Union[str, None] = "b3f1a9c7e2d4"
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
