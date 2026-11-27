# MEH-3933: `EXPECTED_TABLES` 70 to 71

MEH-3933 adds one table, `product_order_repeats` (revision `a4c8e2f6b0d1`): a
buyer's weekly repeat of an order, from which an hourly job makes each week's
order. With it, `alembic upgrade head` on a local Postgres 16 ends with 71
base tables besides `alembic_version` (measured 27/11). Staging is at 70
(`meh-3896-expected-tables-70`).

`.github/workflows/**` is denied to CC's Edit/Write (security.md). The change
is committed on `feature/meh-3933-weekly-repeat-orders` through the GitHub web
editor (Claude in Chrome), then checked byte for byte against the prepared
file.

## The change

```diff
@@ -505,7 +505,8 @@
           # MEH-3839: email_events (what Resend reports for each email) — 67 -> 68.
           # MEH-3526: producer_staff (who handles a business's orders) — 68 -> 69.
           # MEH-3896: share_links (short preview / claim links) — 69 -> 70.
-          EXPECTED_TABLES=70
+          # MEH-3933: product_order_repeats (a buyer's weekly repeat) — 70 -> 71.
+          EXPECTED_TABLES=71
 
           TABLE_COUNT=$(psql -h localhost -U postgres -d mehamakor_test -tAc \
             "SELECT COUNT(*) FROM information_schema.tables
```

Nothing else in the file changes. The result parses as YAML.

## How to check it

- `git diff origin/staging -- .github/` on the branch shows exactly the lines
  above.
- sha256 of the whole file after the change (against staging `e537d88a9`,
  27/11): `1a9b9820302b135ea25255911e30807376e29a039b36bb7396fc55f43938d34c`.
  If staging's `pr-checks.yml` moves before this is committed, re-make the
  file and the hash; don't restore this one.
- MEH-3932 (PR #5424) adds no table, so the two PRs do not race on this line.
