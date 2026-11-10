# MEH-2903 — `EXPECTED_TABLES` 49 → 50 (the `alembic_lineage` table)

> **Not applied.** `.github/workflows/**` is Sapir's. She applies this one line
> in the same PR as the `alembic_lineage` revision (`19ac967d78fb`), once she has
> OK'd that revision. Until then the PR's table-count gate is red by design:
> the revision adds a 50th table, and the gate still expects 49.

## Why

`alembic_lineage` is one new base table in `public`. The table-count step in
the CI gate workflow counts base tables excluding `alembic_version` only, so it
must move from 49 to 50. `scripts/ci/backup-restore-verify.sh` reads the same
value at run time (`--expect-table-count auto`), so it needs no change.

## The diff

```diff
--- a/.github/workflows/pr-checks.yml
+++ b/.github/workflows/pr-checks.yml
@@ -480,7 +480,8 @@
           # rescue_typical_items (rescue-bags pilot) — 44 -> 48.
           # MEH-2763: registrations (on-site sign-ups for events and
           # experiences) — 48 -> 49.
-          EXPECTED_TABLES=49
+          # MEH-2903: alembic_lineage (boot bookkeeping) — 49 -> 50.
+          EXPECTED_TABLES=50
 
           TABLE_COUNT=$(psql -h localhost -U postgres -d mehamakor_test -tAc \
             "SELECT COUNT(*) FROM information_schema.tables
```

Line 483 on `origin/staging` as of 11/11/2026. Re-check the line number before
applying: other table migrations move it.
