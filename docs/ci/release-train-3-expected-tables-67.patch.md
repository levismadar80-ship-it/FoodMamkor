# Release train 3: `EXPECTED_TABLES` 65 to 67

Release train 3 (#5063's follow-up, MEH-3606) brings two PRs that each add a
table on top of MEH-3535's `email_outbox` (65, on staging): MEH-3617
(`product_variants`, #5087) and MEH-3592 (`group_buy_waitlist`, #5055). Each
PR moved the count on its own branch (66 and 65). With both, the schema has
67 tables: `alembic upgrade head` on a local Postgres 16 ends with 67 base
tables besides `alembic_version` (21/11). The train keeps staging's file, so
this patch is the one change to `pr-checks.yml` in the train. It replaces
`meh-3617-expected-tables-66` and `meh-3592-expected-tables`.

`.github/workflows/**` is denied to CC's Edit/Write (security.md). The change
is committed on `feature/meh-3606-release-train-3` through the GitHub web
editor (Claude in Chrome), then checked byte for byte against the file below.

## The change

```diff
@@ -489,7 +489,9 @@
           # producer_order_windows, product_order_notifications,
           # product_order_phone_codes (MEH-3296, #4640) — 58 -> 64.
           # MEH-3535: email_outbox (the durable email queue) — 64 -> 65.
-          EXPECTED_TABLES=65
+          # MEH-3617: product_variants (a product's sizes or flavours) — 65 -> 66.
+          # MEH-3592: group_buy_waitlist (a full group buy's waitlist) — 66 -> 67.
+          EXPECTED_TABLES=67
 
           TABLE_COUNT=$(psql -h localhost -U postgres -d mehamakor_test -tAc \
             "SELECT COUNT(*) FROM information_schema.tables
```

Nothing else in the file changes.

## How to check it

- `git diff origin/feature/meh-3606-release-train-2 -- .github/` on the train
  shows exactly the three lines above (against staging, train 2's own
  `.github` changes show too).
- sha256 of the whole file after the change:
  `706529a0b9c3caf38f880c84cc5d8653a98e8f963e9d490c634ea926c6c38d6c`.
