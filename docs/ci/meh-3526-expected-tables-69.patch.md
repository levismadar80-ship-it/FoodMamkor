# MEH-3526 — `EXPECTED_TABLES` +1 for `producer_staff`

`.github/workflows/**` is CC-deny and the sandbox proxy refuses Contents-API
writes there (security.md, MEH-2486). This file is the prepared change; it is
applied with Claude in Chrome on the PR branch and checked byte for byte.

## The change

`.github/workflows/pr-checks.yml`, step «Verify alembic schema»:

```diff
           # MEH-3839: email_events (what Resend reports for each email) — 67 -> 68.
+          # MEH-3526: producer_staff (who handles a business's orders) — 68 -> 69.
-          EXPECTED_TABLES=68
+          EXPECTED_TABLES=69
```

Prepared file sha256 `e1337e8cbf136771a5eb91acf0f6b3fdfeb0dd065f57603e6146c2848870b873`
(against the workflow at staging `d206c32`, after MEH-3839 raised the count
to 68). Measured: `alembic upgrade head` on a fresh database counts 69 base
tables (alembic_version excluded) at revision `c6e8a0b2d4f5`, which follows
`e1a3c5b7d9f2`.

## Why the PR is red until it is applied

The revision creates one table, so the schema job counts 69 on a staging of
68 and fails `CI gate`. If another table lands on staging first, count again
from the migrations; never from this file.

Applied 25/11 via the web editor (Claude in Chrome) in `97fa9f100`; the committed
file's sha256 matches the prepared one.
