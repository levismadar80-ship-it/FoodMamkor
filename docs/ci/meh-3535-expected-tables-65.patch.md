# MEH-3535 — `EXPECTED_TABLES` 64 → 65 (`email_outbox`)

Revision `c5e7a9b1d3f6` adds one table, `email_outbox` (the durable email
queue). The schema-drift step in `pr-checks.yml` counts tables after
`alembic upgrade head`, so the PR is red until the number moves with it.

`.github/workflows/**` is CC-deny (security.md, MEH-2486): this change is
committed on the MEH-3535 branch through the GitHub web editor (Claude in
Chrome), and CC checks the PR diff byte for byte.

## The change

`.github/workflows/pr-checks.yml`, the comment block above the count and the
count:

```diff
           # product_order_phone_codes (MEH-3296, #4640) — 58 -> 64.
-          EXPECTED_TABLES=64
+          # MEH-3535: email_outbox (the durable email queue) — 64 -> 65.
+          EXPECTED_TABLES=65
```

## If another table lands first

If staging already reads `EXPECTED_TABLES=65` (or more) from another PR when
this one merges, the right number is that value + 1, and the comment line
names both. Merge staging into the branch first and re-count.
