# MEH-1754 item 5 — `pr-checks.yml` builds without `NEXT_PUBLIC_API_URL`, and the code half that needs it is NOT on staging

> **`.github/workflows/**` is CC-deny (MEH-671). This file is the paste-ready block for Sapir.**
> It is copied verbatim from the body of PR #2831, where it sat since 12/08 — the card's
> 31/08 ruling asked CC to move it here so it stops living in a PR thread. Measured 01/09 night:
> `grep -c NEXT_PUBLIC_API_URL .github/workflows/pr-checks.yml` → **0** (the `wake-when.sh`
> row `MEH-1754 item5` watches exactly this number).

## ⚠️ The state is worse than the card's 31/08 table says — read this before applying

The card's canonical table (31/08) lists item 5 as *"approved and implemented — PR #2831,
blocked on DO-NOT-MERGE until Sapir pastes the two workflow lines."* **Measured 01/09:**

| claim | measured |
|---|---|
| PR #2831 is waiting on the workflow paste | **#2831 is CLOSED, not merged** — closed 2026-08-28T09:09:58Z, label `stale`, `mergeable_state: behind` |
| the code half is on staging | **No.** `frontend/lib/env.client.js:27` is still `NEXT_PUBLIC_API_URL: z.string().url().optional()` and `:53-54` still falls back to `http://localhost:8000` |
| the branch is gone | **No** — `feature/meh-1754-env-fail-fast` is still on `origin` at `5b339fc3` (3 commits: the two-file change + tests) |

So item 5 has **two halves, and neither has landed**. This file carries the workflow half.
The code half needs a fresh PR re-cut from `5b339fc3` (or cherry-picked onto a new
`feature/meh-1754-*` branch off current `staging`) **after** the workflow half is on staging —
in that order, because the code half makes `npm run build` fail without the variable, and two
`pr-checks.yml` jobs build without it today. Applying the workflow block first is a pure
expand step: harmless on its own, and it is what lets the code PR go green instead of red.

## The paste — two steps, not one

The value is the one `e2e.yml:142` already uses (Railway staging). `e2e.yml` and
`vrt-update.yml` already set it and need **no change**; `pr-checks.yml` is the only workflow that
builds without it. `NEXT_PUBLIC_*` is inlined into the browser bundle, so it is public by
definition — plain `env:`, deliberately not `secrets.*`.

### 1 · job `build` — "Frontend build (Next.js)", the `Build` step

```yaml
      - name: Build
        run: npm run build
        env:
          # Silence telemetry noise in CI logs.
          NEXT_TELEMETRY_DISABLED: "1"
          # MEH-1754 item 5: NEXT_PUBLIC_API_URL is required by
          # lib/env.client.js and the build now fails without it. Same Railway
          # staging value the E2E build uses (e2e.yml:142) — build-time only,
          # public by definition (NEXT_PUBLIC_* ships in the browser bundle),
          # so plain env and deliberately not `secrets.*`.
          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
```

### 2 · job `ai-artifact-scan` — "AI artifact scan (build output)", the `Build (scan target)` step

**This is the one that is easy to miss.** It runs its own independent `npm run build` (jobs do
not share workspaces), so it fails identically without the variable and would keep `CI gate`
red even after step 1 is fixed.

```yaml
      - name: Build (scan target)
        run: npm run build
        env:
          NEXT_TELEMETRY_DISABLED: "1"
          # MEH-1754 item 5: required by lib/env.client.js — this job builds
          # independently of the `build` job, so it needs its own copy.
          NEXT_PUBLIC_API_URL: https://foodmamkor-staging.up.railway.app
```

> Line numbers are deliberately not quoted: the two PR-body citations (`:192-196`, `:243-246`)
> were measured on 12/08 and `pr-checks.yml` has moved since. Find the steps by `name:`.

## After pasting

1. Branch + PR to `staging` (never direct). Both jobs keep passing — the variable is unused
   until the code half lands, so this PR cannot go red on its own account.
2. `bash scripts/wake-when.sh` → the `MEH-1754 item5` row flips from `parked` to `OPEN`.
   That is the signal for CC to re-cut the code half from `5b339fc3`.
3. The code-half PR carries the proof both ways from #2831's body (control build on old code
   without the var → exit 0; new code without → exit 1; new code with → exit 0) — re-run, not
   quoted, because the tree has moved.

## Provenance

- Workflow block: PR #2831 body (CC, 12/08), verbatim apart from the dropped line numbers.
- State measurements: drain יט', 01/09 night — `pull_request_read #2831`, `git ls-remote`,
  `git show origin/staging:frontend/lib/env.client.js`.
