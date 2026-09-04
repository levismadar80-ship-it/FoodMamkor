"""MEH-1855 chunk 2 (Phase 2 of 2 — the CONTRACT step, ADR-007 Phase 4):
DROP the legacy `producers.starting_price_label` alias column.

Every reader and writer was retired first, in order:

- chunk 1 (PR #2895, `b90e917f`): all five public read sites
  (`ProducerSections.jsx`, `ProducerDetail.jsx`) flipped from alias-only to
  `price_range || starting_price_label` — canonical first, alias fallback.
- Phase 1 of this chunk (PR #2898, revision 97669fe803f5, `c8feb00d`): data
  backfill `price_range = starting_price_label WHERE price_range IS NULL`,
  owner's `price_range` kept on conflict. Logged its counts to the boot log.
- this PR (the same commit as this file): the alias left the ORM model, the
  `ProducerUpdate` / `ProducerListOut` / `ProducerDetailOut` contracts, the
  committed contract snapshot + openapi.json + generated Zod, the admin
  create/PUT mirror, the XLSX importer, the boot seed, `lib/schemas.js`, the
  e2e fixtures, and every frontend reader — which now consult `price_range`
  ALONE. The `LEGACY(2026-10-01, MEH-1855)` marker on the column went with
  it (docs/MIGRATIONS.md § LEGACY-expiry), 28 days before its expiry.

DESTRUCTIVE — class A (`drop_column`) in upgrade(), per the release-audit
taxonomy in docs/MIGRATIONS.md. NOT merged by CC. Sapir merges after the
ADR-007 Phase 4 preconditions are checked by hand, in particular R2 backup
≤ 24h (row 3), and after this query reads 0 on staging AND production:

    SELECT count(*) FROM producers
    WHERE price_range IS NULL AND starting_price_label IS NOT NULL;

A non-zero count means 97669fe803f5 did not run there, or a writer re-filled
the alias after it ran — either way, dropping would lose a label. Rows where
BOTH are set and DIFFER are, by 97669fe803f5's documented rule, the owner's
`price_range` winning; the alias value on those rows is discarded here, and
that is the intended outcome, not a loss.

Downgrade re-adds the column nullable, matching its ef8fb1858f5b baseline
definition (String(50)). The VALUES ARE NOT RESTORABLE — nothing keeps a copy
of the dropped column, and re-deriving it from `price_range` would invent a
history that never existed (the two were only equal on backfilled rows).
Same posture as d4e7a92c81b5 (MEH-766 ch6, `is_verified`).

# DO NOT re-add readers/writers of the alias — `price_range` is the single
#        price-label field (MEH-1855; ownership registry in
#        backend/app/data_ownership.py + docs/DATA_OWNERSHIP.md).

Revision ID: 9849fab1637a
Revises: 2c1033ca5745
Create Date: 2026-09-03 12:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9849fab1637a"
down_revision: str | None = "2c1033ca5745"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_column("producers", "starting_price_label")


def downgrade() -> None:
    # Schema only. Data is NOT restorable — see the module docstring: no copy
    # of the dropped values exists, and price_range is not a faithful source.
    op.add_column(
        "producers",
        sa.Column("starting_price_label", sa.String(length=50), nullable=True),
    )
