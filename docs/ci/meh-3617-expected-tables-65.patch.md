# MEH-3617 — `EXPECTED_TABLES` 64 → 65

> **Superseded** by [meh-3617-expected-tables-66.patch.md](./meh-3617-expected-tables-66.patch.md): MEH-3535 took 65 on staging first.

The migration `c5f7a9b1d3e4` adds one table, `product_variants` (a product's
sizes or flavours). The step **"Verify alembic schema"** in
`.github/workflows/pr-checks.yml` counts the tables after `alembic upgrade
head` and fails while the number in the file is 64.

`.github/workflows/**` is denied to CC's Edit/Write (security.md), so this
change is applied on the PR branch through the GitHub web editor (Claude in
Chrome) and then checked byte for byte against this file.

## The change

```diff
           # producer_order_windows, product_order_notifications,
           # product_order_phone_codes (MEH-3296, #4640) — 58 -> 64.
-          EXPECTED_TABLES=64
+          # MEH-3617: product_variants (a product's sizes or flavours) — 64 -> 65.
+          EXPECTED_TABLES=65
```

Nothing else in the file changes. MEH-3618 (the same release) adds a column,
not a table, so it does not move the number.

## How to check it

`git show <commit>:.github/workflows/pr-checks.yml | grep -n "EXPECTED_TABLES="`
prints `EXPECTED_TABLES=65`, and `git diff origin/staging -- .github/` shows
exactly the two lines above.
