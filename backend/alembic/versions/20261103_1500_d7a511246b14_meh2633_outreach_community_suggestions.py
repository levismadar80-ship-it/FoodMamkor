"""meh2633_outreach_community_suggestions

Revision ID: d7a511246b14
Revises: 4b7e1d2c9a60
Create Date: 2026-11-03 15:00:00.000000+00:00

MEH-2633 chunk A — community business suggestions ride the EXISTING
`outreach_leads` pipeline. Five additive columns on that table, no new table
and no backfill:

  - `suggested_by_name`       VARCHAR(100)  NULL — the suggester's display
                              name, optional by design (the form asks, it
                              does not require).
  - `suggested_by_email`      VARCHAR(254)  NULL — the suggester's address.
                              254 = the RFC 5321 maximum for a full address.
                              PII: never returned by any public endpoint and
                              never logged unmasked (services/email.py:47
                              `_mask`). Retention is an OPEN decision for
                              Sapir (card § "החלטות פתוחות", proposal: 180
                              days via retention_purge) — deliberately NOT
                              implemented here.
  - `suggester_wants_update`  BOOLEAN NOT NULL DEFAULT false — opt-in for the
                              "the business joined" thank-you mail. NOT NULL +
                              server_default, not nullable: consent has no
                              "unknown" state, and the default is the safe
                              one (no mail). Same shape as categories.is_system
                              (b7d3e5a9c1f4) and producers.resubmission_count.
  - `suggestion_reason`       TEXT NULL — free text, "מה מיוחד שם?".
  - `suggester_thanked_at`    TIMESTAMP NULL — stamped by
                              POST /admin/outreach/{id}/thank-suggester on a
                              successful send; the idempotency key for that
                              endpoint. NULL means "never thanked", which is
                              true for every pre-existing row.

`source` is NOT touched — the column already exists (models.py:902, default
"manual") and community suggestions simply write the new value "community".

Expand-only per ADR-007, following the producers.claim_link_sent_at precedent
(8600916f1942): every column is either nullable or carries a server_default,
so the previous container keeps serving while this runs — none of its code
names any of them.

Plain `sa.DateTime()` (no timezone) for `suggester_thanked_at`, matching this
table's existing timestamps — `created_at`, `updated_at` and
`prefill_token_expires_at` are all TIMESTAMP WITHOUT TIME ZONE in the baseline
(ef8fb1858f5b:72-74) and the model declares them as bare `DateTime`
(models.py:908-912). `alembic/env.py:53` sets `compare_type=True`, so a
`timezone=True` column here against a bare `DateTime` in the model would red
the drift gate.

EXPECTED_TABLES unchanged (columns, not a table) — the count stays 43
(.github/workflows/pr-checks.yml:468).

# DO NOT add column changes for outreach_leads in main.py — Alembic is the
#        sole schema authority since MEH-267 (root cause of the MEH-265
#        production-login incident).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d7a511246b14"
# MEH-2633: chains onto the single head measured with `alembic heads` on
# 2026-11-03 (4b7e1d2c9a60 = MEH-2612 rabanut_code_backfill), not guessed.
down_revision: Union[str, None] = "4b7e1d2c9a60"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "outreach_leads",
        sa.Column("suggested_by_name", sa.String(length=100), nullable=True),
    )
    op.add_column(
        "outreach_leads",
        sa.Column("suggested_by_email", sa.String(length=254), nullable=True),
    )
    op.add_column(
        "outreach_leads",
        sa.Column(
            "suggester_wants_update",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "outreach_leads",
        sa.Column("suggestion_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "outreach_leads",
        sa.Column("suggester_thanked_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("outreach_leads", "suggester_thanked_at")
    op.drop_column("outreach_leads", "suggestion_reason")
    op.drop_column("outreach_leads", "suggester_wants_update")
    op.drop_column("outreach_leads", "suggested_by_email")
    op.drop_column("outreach_leads", "suggested_by_name")
