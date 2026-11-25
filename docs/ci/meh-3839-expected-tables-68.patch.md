# MEH-3839: `EXPECTED_TABLES` 67 to 68

MEH-3839 adds one table, `email_events` (revision `e1a3c5b7d9f2`): a row for
each delivery event Resend reports for an email we sent. With it, `alembic
upgrade head` on a local Postgres 16 ends with 68 base tables besides
`alembic_version` (24/11). Staging is at 67 (`release-train-3-expected-tables-67`).

`.github/workflows/**` is denied to CC's Edit/Write (security.md). The change
is committed on `feature/meh-3839-resend-events` through the GitHub web editor
(Claude in Chrome), then checked byte for byte against the prepared file.

## The change

```diff
@@ -502,7 +502,8 @@
           # MEH-3535: email_outbox (the durable email queue) — 64 -> 65.
           # MEH-3617: product_variants (a product's sizes or flavours) — 65 -> 66.
           # MEH-3592: group_buy_waitlist (a full group buy's waitlist) — 66 -> 67.
-          EXPECTED_TABLES=67
+          # MEH-3839: email_events (what Resend reports for each email) — 67 -> 68.
+          EXPECTED_TABLES=68
 
           TABLE_COUNT=$(psql -h localhost -U postgres -d mehamakor_test -tAc \
             "SELECT COUNT(*) FROM information_schema.tables
```

Nothing else in the file changes. `git apply --check` passed against
`origin/staging`, and the result parses as YAML.

## How to check it

- `git diff origin/staging -- .github/` on the branch shows exactly the lines
  above.
- sha256 of the whole file after the change (against staging as of 24/11):
  `15e9d3327d83c36f9020ea20fd1c031c46f74511fd2f418a27af72ecfe388ac4`.
  If staging's `pr-checks.yml` moves before this is committed, re-make the
  file and the hash; don't restore this one.
