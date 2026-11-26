# MEH-3896: `EXPECTED_TABLES` 69 to 70

MEH-3896 adds one table, `share_links` (revision `d2f4b6a8c0e1`): the hashed
short code behind the `/v/<code>` preview link and the `/c/<code>` claim link.
With it, `alembic upgrade head` on a local Postgres 16 ends with 70 base tables
besides `alembic_version` (measured 26/11). Staging is at 69
(`meh-3526-expected-tables-69`).

`.github/workflows/**` is denied to CC's Edit/Write (security.md). The change
is committed on `feature/meh-3896-short-links` through the GitHub web editor
(Claude in Chrome), then checked byte for byte against the prepared file.

## The change

```diff
@@ -504,7 +504,8 @@
           # MEH-3592: group_buy_waitlist (a full group buy's waitlist) — 66 -> 67.
           # MEH-3839: email_events (what Resend reports for each email) — 67 -> 68.
           # MEH-3526: producer_staff (who handles a business's orders) — 68 -> 69.
-          EXPECTED_TABLES=69
+          # MEH-3896: share_links (short preview / claim links) — 69 -> 70.
+          EXPECTED_TABLES=70
 
           TABLE_COUNT=$(psql -h localhost -U postgres -d mehamakor_test -tAc \
             "SELECT COUNT(*) FROM information_schema.tables
```

Nothing else in the file changes. The result parses as YAML.

## How to check it

- `git diff origin/staging -- .github/` on the branch shows exactly the lines
  above.
- sha256 of the whole file after the change (against staging `c8ea4a434`,
  26/11): `f2f395de57f310d3c46b9ddacfb7df284432e2de2153bf6e6a02eef24725d94d`.
  If staging's `pr-checks.yml` moves before this is committed, re-make the
  file and the hash; don't restore this one.
