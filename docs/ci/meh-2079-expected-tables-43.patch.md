# MEH-2079 chunk A — `EXPECTED_TABLES` 42 → 43 (one line, Sapir applies)

`.github/workflows/**` is CC-deny (MEH-671). The deny is a **local PreToolUse
hook**, not a GitHub permission, so `GH_WORKFLOW_TOKEN` does not lift it: the
token would let CC *push* the file, but the hook blocks *writing* it, and rule
32 says a deny is a decision rather than an obstacle to route around.

## The change

`.github/workflows/pr-checks.yml`, in the step named
**"Verify alembic schema (36 tables)"**:

```diff
-          EXPECTED_TABLES=42
+          EXPECTED_TABLES=43
```

Optionally, on the comment block directly above it (which records every prior
bump):

```
          # MEH-2079 chunk A: producer_analytics_daily (anonymous daily
          # roll-up so the raw analytics tables can be pruned) — 42 -> 43.
```

## Why the PR is red until it is applied

The step runs `alembic upgrade head` against a CI Postgres and counts base
tables. Revision `c4a9e2b7d3f8` creates `producer_analytics_daily`, so the
count becomes 43 and the step exits 1 with
`::error::Table count=43, expected 42`. That failure is **correct** — it is the
gate doing its job — and it clears the moment this line lands.

**Apply it on the PR branch** (`feature/meh-2079-analytics-daily-aggregate`),
not on `staging`: on `staging` alone it would mean the gate expects a table
that does not exist there yet, and every other open PR would go red instead.

Nothing else in the workflow changes.
