# MEH-3526 — `EXPECTED_TABLES` +1 for `producer_staff`

`.github/workflows/**` is CC-deny and the sandbox proxy refuses Contents-API
writes there (security.md, MEH-2486). This file is the prepared change; it is
applied with Claude in Chrome on the PR branch and checked byte for byte.

## The change

`.github/workflows/pr-checks.yml`, step «Verify alembic schema»:

```diff
           # MEH-3592: group_buy_waitlist (a full group buy's waitlist) — 66 -> 67.
+          # MEH-3526: producer_staff (who handles a business's orders) — 67 -> 68.
-          EXPECTED_TABLES=67
+          EXPECTED_TABLES=68
```

Prepared file sha256 `29da71de2267d3effc37481aacdf44054f3a69901d7f7b14fd09632586a49321`
(against the workflow at staging `68d4e942c`'s merge base). Measured:
`alembic upgrade head` on a fresh database counts 68 base tables (alembic_version excluded) at revision
`c6e8a0b2d4f5`.

## Why the PR is red until it is applied

The revision creates one table, so the schema job counts 68 on a staging of
67 and fails `CI gate`. If another table lands on staging first, count again
from the migrations; never from this file.

Not applied yet on 24/11: Claude in Chrome was not connected.
