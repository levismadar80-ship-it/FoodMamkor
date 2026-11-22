# MEH-3592 — `EXPECTED_TABLES` +1 for `group_buy_waitlist`

`.github/workflows/**` is CC-deny and the sandbox proxy refuses Contents-API
writes there (security.md, MEH-2486). This file is the prepared change; it is
applied with Claude in Chrome on the PR branch and checked byte for byte.

## The change

`.github/workflows/pr-checks.yml`, step «Verify alembic schema»:

```diff
+          # MEH-3592: group_buy_waitlist (a full group buy's waitlist) — +1.
-          EXPECTED_TABLES=64
+          EXPECTED_TABLES=65
```

**Ordering with MEH-3535.** `feature/meh-3535-email-outbox` (commit
`99592bf1b`) bumps the same line 64 → 65 for `email_outbox`. Whichever lands
second takes the number one higher: if MEH-3535 is on staging first, this line
reads `EXPECTED_TABLES=66`. Count from the migrations on the branch
(`SELECT COUNT(*) … table_schema='public' … <> 'alembic_version'` after
`alembic upgrade head`), never from this file.

## Why the PR is red until it is applied

The revision `2189efe602b9` creates one table, so the schema job counts 65 on
a staging of 64 and fails `CI gate`.

Applied 21/11/2026 in b02df96e (committed in Chrome). The value matches. The comment line reads `— 64 -> 65.` where this doc had `— +1.`.
