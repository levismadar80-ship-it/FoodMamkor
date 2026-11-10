> **Status: NOT APPLIED — as-of 10/11/2026.** Measured against `origin/staging`: `e2e.yml:542` reads `group: e2e-staging-backend-webkit`.

# `e2e.yml`: both E2E jobs in one concurrency group (MEH-2886 chunk 5)

CC cannot write `.github/workflows/**` (`.claude/rules/security.md`), so this doc carries the exact change for **Sapir** to commit.

## Why

Both E2E jobs, Chromium `e2e` and the WebKit shadow `e2e-webkit`, run their browser against **the one Railway staging backend** (`NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app`, `e2e.yml:171`). Its DB pool has 15 connections (`pool_size 10 + max_overflow 5`, `backend/app/database.py:43-46`).

- The Chromium job is in `group: e2e-staging-backend` (`e2e.yml:103`). The WebKit job is in its own group, `e2e-staging-backend-webkit` (`e2e.yml:542`).
- So the two can run **at the same time**, and two suites hammering one backend is what exhausted the pool on staging. Sentry shows 424 `db_pool_exhausted` events in October (`docs/audits/2026-11-quota-inventory.md` §2).
- `e2e-staging-backend` was named for exactly this purpose: "one run at a time repo-wide (the shared Railway staging backend)" (`e2e.yml:123-124`). The WebKit job, added later (MEH-1788), got a group of its own.

## The change: one line, plus a comment

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -538,8 +538,12 @@
     runs-on: ubuntu-latest
     timeout-minutes: 20
     needs: filter
+    # MEH-2886 chunk 5: the SAME group as the Chromium `e2e` job. Both jobs hit
+    # the one Railway staging backend (10+5 DB connections); in separate groups
+    # a Chromium and a WebKit run could load it at once, and that is what
+    # exhausted the pool on staging (db_pool_exhausted, 424 events in Oct).
     concurrency:
-      group: e2e-staging-backend-webkit
+      group: e2e-staging-backend
       cancel-in-progress: false
       queue: max
     # Never fails the workflow. See property 1 above.
```

### How it was checked (10/11/2026)

- `git apply --check` of the diff above against `origin/staging:.github/workflows/e2e.yml` (copied into a scratch path) → OK.
- The patched file is byte-identical to the intended result (`cmp`), and parses as YAML (`yaml.safe_load`).

## What it costs

- With `queue: max`, the two jobs now **wait for each other** instead of running in parallel. On a staging push both start together. One runs and the other waits, about 20 minutes (WebKit) or 30 minutes (Chromium), so the full E2E run for one push takes up to twice as long.
- **The required check can get slower.** If the WebKit job takes the queue first, `E2E gate` (which needs only the Chromium job) waits for it. The WebKit job is shadow and non-blocking (`continue-on-error: true`, `e2e.yml:546`), so the wait buys nothing for the gate. It is the price of not loading the backend twice.
- **The alternative, if that wait is too much:** keep two groups and shrink the WebKit job's load instead, for example `workers: 1` for the WebKit project. That still hits the backend twice at once, only more lightly. I recommend the one group: it is the only change that guarantees one suite at a time.

## How to apply (Sapir)

1. GitHub → `.github/workflows/e2e.yml` → ✏️ (edit), on a new branch `feature/meh-2886-db-release-chunk-5-apply`.
2. Line 542: `e2e-staging-backend-webkit` → `e2e-staging-backend`. Paste the 4 comment lines above `concurrency:` too, or skip them; they change nothing at runtime.
3. Open a PR to `staging`. CC compares the diff byte for byte against the one above, then merges.

## How to verify after applying

On the next push to `staging`, in the Actions run: the second of the two jobs shows **"Waiting for a pending job in this concurrency group"** (or "queued") while the first runs, and the two never show "in progress" at the same time.
