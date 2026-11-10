> **Status: NOT APPLIED — as-of 10/11/2026.** Measured against `origin/staging`: `e2e.yml:542` reads `group: e2e-staging-backend-webkit`.

> ⛔ **Superseded by `docs/ci/e2e-two-shards.patch.md` (MEH-2895, 10/11/2026) — do
> not paste this after it.** It still applies cleanly on top of the sharded
> file. But it would move WebKit into `e2e-staging-backend`, a group no job
> uses once the Chromium job is sharded (`e2e-staging-backend-1` / `-2`): a
> no-op that looks like serialization. If the sharded runs exhaust the pool,
> that patch's fallback (א) is the replacement: WebKit joins
> `e2e-staging-backend-2`.

# `e2e.yml`: both E2E jobs in one concurrency group (MEH-2886 chunk 5)

CC cannot write `.github/workflows/**` (`.claude/rules/security.md`), so this doc carries the exact change for **Sapir** to commit.

## Why: a precaution, not a measured cause

Both E2E jobs, the Chromium `e2e` and the WebKit shadow `e2e-webkit`, run against **the one Railway staging backend** (`NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app`, `e2e.yml:171`; WebKit `:598`/`:606`). Its DB pool has 15 connections (`pool_size 10 + max_overflow 5`, `backend/app/database.py:43-46`).

- **What is measured:** parallel E2E runs from several PRs filled that pool on 22–27/10, with 436 stored QueuePool events in Sentry, 100% on staging (`docs/audits/2026-11-quota-inventory.md` §2.1–2.2, MEH-2398). #3687 (27/10) fixed it by putting both jobs in **job-level** concurrency groups with `queue: max`. There have been no errors since 27/10.
- **What is not measured:** the two groups are **separate** (`e2e.yml:103` `e2e-staging-backend`, `:542` `e2e-staging-backend-webkit`), so one Chromium run and one WebKit run can still overlap, each with `workers: 2`. The audit names this as an open gap (§2.2 item 1). No such overlap has been observed causing errors.
- So this is a **precaution**: one suite at a time against the shared backend, which is what the `e2e-staging-backend` group says it is for (`e2e.yml:123-124`).

## The change: one line, plus a comment

```diff
--- a/.github/workflows/e2e.yml
+++ b/.github/workflows/e2e.yml
@@ -538,8 +538,13 @@
     runs-on: ubuntu-latest
     timeout-minutes: 20
     needs: filter
+    # MEH-2886 chunk 5: the SAME group as the Chromium `e2e` job. Both jobs hit
+    # the one Railway staging backend (10+5 DB connections). In separate groups
+    # a Chromium run and a WebKit run can overlap; parallel E2E runs are what
+    # filled that pool on 22-27/10 (MEH-2398). A precaution: no overlap of
+    # these two jobs was measured.
     concurrency:
-      group: e2e-staging-backend-webkit
+      group: e2e-staging-backend
       cancel-in-progress: false
       queue: max
     # Never fails the workflow. See property 1 above.
```

### How it was checked (10/11/2026)

- `git apply --check` of the diff above against `origin/staging:.github/workflows/e2e.yml` (copied into a scratch path) → OK.
- The patched file is byte-identical to the intended result (`cmp`). It parses as YAML, and both jobs read `{group: e2e-staging-backend, cancel-in-progress: false, queue: max}`.
- No deadlock: there is no `needs:` between `e2e` and `e2e-webkit`.

## What it costs: read this before applying

- **One FIFO queue for the whole repo, not per push.** `queue: max` makes a single queue per group. With one group, every queued WebKit job, from any run, sits ahead of the Chromium jobs behind it. While a backlog lasts, `E2E gate` (which needs only the Chromium job) waits about N × the WebKit duration. That wait buys nothing for the gate, because the WebKit job is non-blocking (`continue-on-error: true`, `e2e.yml:546`).
- **Each run puts two entries in the queue instead of one.** HANDOFF (06/11 section) records 43 pending runs at once (before MEH-2779 limited PR runs to the `run-e2e` label). At two entries per run that is about 86, close to the 100-entry cap the fresh reviewer cited from GitHub's changelog of 07/05/2026 (docs.github.com is blocked from the CC sandbox, so it was not read directly). Past the cap, GitHub cancels new entries, **Chromium ones included**.
- **Durations are not measured.** 30 and 20 minutes are the `timeout-minutes` caps (`e2e.yml:100`, `:539`), not real run times. I found no recent run where the Playwright jobs were not skipped.
- **The alternative, if the wait is too much:** keep two groups and lower the WebKit job's load (for example `workers: 1` for the WebKit project). It still hits the backend twice at once, only more lightly.
- **My recommendation:** apply it only if staging shows pool errors again with both jobs running. Since MEH-2779, PR runs are opt-in (`run-e2e`), so the backlog that made the cost bite is smaller. This is Sapir's call.

## How to apply (Sapir)

1. GitHub → `.github/workflows/e2e.yml` → ✏️ (edit), on a new branch `feature/meh-2886-db-release-chunk-5-apply`.
2. Line 542: change `e2e-staging-backend-webkit` → `e2e-staging-backend`. Paste the 5 comment lines above `concurrency:`, or skip them; they change nothing at runtime.
3. Open a PR to `staging`. CC compares the diff byte for byte against the one above. In the same PR, CC updates `docs/TESTING.md:49`, which names both groups: it should say both jobs share `e2e-staging-backend`. Then CC merges.

## How to verify after applying

On the next push to `staging`, in the Actions run, the second of the two jobs shows **"Waiting for a pending job in this concurrency group"** while the first runs, and the two are never "in progress" at the same time.
