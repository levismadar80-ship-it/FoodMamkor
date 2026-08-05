"""meh1909_backfill_offers_delivery

Revision ID: 9b9ccccae323
Revises: e4b1c72d9a35
Create Date: 2026-08-05 12:30:00.000000+00:00

MEH-1909 release-#2 prep: sets `offers_delivery = true` on every producer that
holds at least one `delivery_areas` row while declaring it does not deliver.

DATA ONLY. No column added, dropped, altered or renamed; no table created; no
index. `EXPECTED_TABLES` is unchanged and cannot move — the drift gate counts
BASE TABLEs, and this revision creates none.

WHY THIS EXISTS — a regression that is certain, not hypothetical
----------------------------------------------------------------
MEH-1848 made `offers_delivery` a conjunct on BOTH delivery predicates in
`producer_listing.py`. `_has_delivery_condition()` (`producer_listing.py:271`)
now reads:

    offers_delivery IS true AND (EXISTS delivery_areas OR delivery_nationwide)

Before that change the flag was not consulted, so a business with live
`delivery_areas` rows and `offers_delivery = false` still matched the משלוח
chip. After it, the same business silently disappears from that filter. Four
production rows were measured in this state (MEH-1878). They are not bad data
in the sense of being wrong about the world — they *do* deliver, they have the
zones to prove it — they are rows whose intent flag was never set because
nothing used to require it.

DIRECTION OF THE REPAIR, and why it is this way round
-----------------------------------------------------
`offers_delivery = true`, never "delete the delivery_areas rows". A zone row is
a deliberate act: somebody typed a city, and often a delivery day, into the
owner dashboard. `offers_delivery = false` is this column's DEFAULT. When the
two disagree, the configured thing is the evidence and the default is the
omission — so repairing toward the default would delete a real capability,
while repairing away from it makes an existing capability consistent.

This is the same rule, and the same reasoning, as MEH-1849's in-migration
repair (`d8c3f1a75e29`, docstring "Direction of the repair"). Zones are the
source of truth; the flag follows them. Shopify's market+zone model is the
industry precedent cited there.

WHY A MIGRATION AND NOT A CHECK CONSTRAINT
------------------------------------------
Because a CHECK cannot span tables. MEH-1849 says so explicitly in its
LIMITATION section: "rows in `delivery_areas` while `offers_delivery = false`"
lives across two tables and is therefore not expressible as a CHECK on
`producers`. That contradiction is enforced today ONLY in the query layer, and
a direct INSERT can still create it. This revision repairs the rows that exist;
it does not and cannot prevent new ones. Closing that hole for good needs a
trigger or a derived column, and both are out of scope here — the same verdict
MEH-1849 reached.

WHAT THIS DOES NOT DO
---------------------
It does not touch `delivery_nationwide`. The nationwide contradiction is a
DIFFERENT pair, already repaired and then constrained by `d8c3f1a75e29`. Rows
caught by that one may also be caught by this one; the UPDATE is idempotent and
order-independent either way, since both only ever set the same column to the
same value.

downgrade() IS A DELIBERATE NO-OP, AND THE REASON IS NOT LAZINESS
------------------------------------------------------------------
Two independent reasons, either sufficient:

1. The backfilled value is CORRECT. The business does deliver. Un-setting the
   flag would restore exactly the contradiction this revision removes, and
   would re-hide four real businesses from the משלוח filter. A downgrade should
   undo a structure, not re-introduce bad data.
2. It is not reversible even in principle. After the UPDATE, a repaired row is
   byte-for-byte indistinguishable from a row that was always consistent, so
   there is nothing to target. Recording the ids to make it reversible was
   considered and rejected: it would mean a new table (moving EXPECTED_TABLES,
   for a release-prep migration) to preserve the ability to restore a state
   nobody wants.

Identical shape and identical rationale to `d8c3f1a75e29.downgrade()`.

THE COUNT IS OBTAINABLE ONLY BEFORE THIS RUNS
---------------------------------------------
Same property as reason 2 above, stated as an operational instruction because
it has a deadline. Run the scan in MEH-1909 §5ב against PRODUCTION before this
merges to `main`:

    SELECT count(*) FROM producers p
    WHERE p.offers_delivery = false
      AND EXISTS (SELECT 1 FROM delivery_areas da WHERE da.producer_id = p.id);

Expected: 4. If it is NOT 4, this revision was written against a stale picture
and the number must be re-measured and reported before the release cut — the
migration is still safe to run, but "4 rows" would then be a claim about the
past presented as a claim about the present.

The CC sandbox cannot reach Railway (`*.up.railway.app` egress is blocked,
MEH-360), so that number cannot be taken from here. The `logger.info` below
prints the real count at apply time in the Railway deploy log, which is the
second-best record and the one that cannot be forgotten.

# DO NOT convert this into a CHECK constraint on `producers` — it spans two
#        tables and is not expressible as one (MEH-1849 LIMITATION).
# DO NOT reverse it in downgrade() — see above.
"""
from typing import Sequence, Union

import logging

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9b9ccccae323"
# Chains onto e4b1c72d9a35 (MEH-1898 custom_offer_type), the single head as of
# 2026-08-05. Head read with `alembic heads`, not with grep: several revision
# files in this repo mention `down_revision` inside their docstrings as prose,
# and a regex matches the docstring line first and reports a phantom second
# head (documented in docs/MIGRATIONS.md, "count alembic heads with alembic").
down_revision: Union[str, None] = "e4b1c72d9a35"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

logger = logging.getLogger("alembic.runtime.migration")

# Mirrors `_has_delivery_condition()`'s first operand exactly
# (producer_listing.py:274 `Producer.delivery_areas.any()`), which is a bare
# EXISTS with no further qualification — delivery_areas carries no active/
# enabled column, so there is no "active row" subset to filter down to. Written
# as EXISTS rather than a JOIN so a producer with several zone rows is counted
# and updated once.
# REUSES: backend/app/services/producer_listing.py:271 — the read-path
# predicate this write is making consistent with.
BACKFILL_SQL = """
UPDATE producers SET offers_delivery = true
WHERE offers_delivery = false
  AND EXISTS (
    SELECT 1 FROM delivery_areas da WHERE da.producer_id = producers.id
  )
"""

COUNT_SQL = """
SELECT count(*) FROM producers
WHERE offers_delivery = false
  AND EXISTS (
    SELECT 1 FROM delivery_areas da WHERE da.producer_id = producers.id
  )
"""


def upgrade() -> None:
    bind = op.get_bind()

    # BEFORE count, logged separately from rowcount on purpose. rowcount alone
    # cannot distinguish "there was nothing to do" from "the UPDATE matched
    # nothing because the predicate is wrong" — two very different states that
    # both print 0. Logging the count the predicate sees BEFORE the write, and
    # again after, makes the pair readable: before=N, updated=N, after=0 is a
    # complete story; before=0 is a different one.
    before = bind.execute(sa.text(COUNT_SQL)).scalar_one()

    result = bind.execute(sa.text(BACKFILL_SQL))

    after = bind.execute(sa.text(COUNT_SQL)).scalar_one()

    logger.info(
        "MEH-1909: offers_delivery backfill — before=%s updated=%s after=%s "
        "(producers with delivery_areas rows but offers_delivery=false)",
        before,
        result.rowcount,
        after,
    )
    if after != 0:
        # Cannot happen with the predicate above, which is why it is worth
        # asserting: if it ever does, the UPDATE and the COUNT have drifted
        # apart and the migration is reporting a repair it did not perform.
        logger.warning(
            "MEH-1909: %s row(s) still violate after the backfill — the UPDATE "
            "and the COUNT predicates have drifted. Investigate before release.",
            after,
        )


def downgrade() -> None:
    # Intentionally empty. See the docstring: the backfilled value is correct,
    # and a repaired row is indistinguishable from an always-consistent one, so
    # there is nothing to target even if reversing it were desirable.
    pass
