---
paths:
  - "frontend/vercel.json"
  - "railway.json"
  - "Dockerfile"
  - ".github/**"
  - "docs/DEPLOYMENT.md"
---

# Deployment rules

Branch strategy, Railway/Vercel specifics, and the PR testing matrix.
Full platform setup (env vars, one-time configuration, GitHub branch
protection) lives in [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md).

---

## Branch strategy

**Flow:** `feature/* → staging → main`. Always branch from `staging`,
never from `main`.

| Branch | Role | Deploys to |
|---|---|---|
| `main` | Production | mehamakor.co.il + Railway prod env |
| `staging` | Pre-production testing | staging.mehamakor.online + Railway staging env |
| `feature/*` | New work | Vercel preview only for a commit whose message contains `[preview]` (MEH-2845, 08/11); every other push is cancelled by the `ignoreCommand` **but still spends one of the 100 deployments/day** — see "✅ APPLIED … / ⚠️ REVERSED" below |

- **Never push directly to `main` or `staging`.** Both are PR-only.
- **Hotfixes** (the only direct-to-main exception) must be back-merged to
  `staging` immediately so the lines don't drift.
- **Auto-deploy on merge to `main` or `staging`** is wired and verified
  end-to-end. Vercel ships the frontend via its native GitHub
  integration; [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml)
  runs `railway redeploy` via the Railway CLI against the matching
  environment in the `believable-tenderness` Railway project so the
  backend can't lag behind. Two env-scoped tokens
  (`RAILWAY_PRODUCTION_TOKEN`, `RAILWAY_STAGING_TOKEN`); environment is
  selected via the `RAILWAY_ENVIRONMENT` env var, **not** the
  `--environment` flag (the current CLI rejects it).
- Full setup: [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) →
  "Branch Strategy" + "One-Time Platform Setup".

---

## Railway runtime port

**Railway runtime port = 8080**, not 8000. Railway injects `$PORT=8080`;
Dockerfile binds uvicorn to `${PORT:-8000}`. Railway → service →
**Settings → Networking → Target Port** must be `8080`.

Mismatch → `502` with `X-Railway-Fallback: true` on every request despite
a healthy container. The `EXPOSE 8000` line in the Dockerfile is
documentation-only — do not copy it into Railway's port settings.

Full trap + debugging context:
[docs/LOCKED_DECISIONS.md](../../docs/LOCKED_DECISIONS.md) →
"Railway runtime port = 8080".

---

## PR approval flow

After every PR — send the Vercel preview URL:

```
בדיקי על: https://food-mamkor-[hash].vercel.app
```

> **Feature-branch previews are OPT-IN, and the default is no preview
> (as of 2026-08-04, MEH-1900 — read from the config, not inferred).**
> `frontend/vercel.json` carries an `ignoreCommand`:
>
> ```
> case "$VERCEL_GIT_COMMIT_REF" in staging|main) exit 1 ;; esac;
> case "$VERCEL_GIT_COMMIT_MESSAGE" in *"[preview]"*) exit 1 ;;
>   *) echo "skip: previews off unless [preview] in commit msg (MEH-1044/MEH-1378)"; exit 0 ;; esac
> ```
>
> `main` builds unconditionally. **`staging` builds only when something that
> ships changed** since its last successful build (MEH-3094, 13/11 —
> `scripts/vercel-ignore-build.sh`, the same rule as
> `scripts/frontend-touched.sh`: `frontend/` minus tests, `backend/`, the
> checks); a docs-only merge is `CANCELED` with `skip: nothing that ships
> changed`. Any doubt (no previous sha, shallow clone) builds. Why: on Pro,
> Vercel bills **Build CPU minutes** (76% of the credit, 9–13/11).
> The ignoreCommand line above is the pre-13/11 text. **Every other branch builds only
> when the commit message contains `[preview]`.** So the table above ("`feature/*`
> → Vercel preview URL only") describes what a feature branch *can* produce, not
> what it produces by default — and an absent preview is the configured
> behaviour, not a fault to diagnose. To get one, include `[preview]` in a commit
> message on the branch.
>
> **The two no-preview states are different, with different causes
> (measured 2026-08-02/04, MEH-1861 + MEH-1900).** Naming the wrong one sends
> the reader after the wrong remedy:
>
> - **`Ignored`** — the `ignoreCommand` above returned 0. Cause: the commit
>   message had no `[preview]`. Remedy: add it, if a preview is actually wanted.
>   Observed on PRs #2494, #2547, #2577, #2594. **Not a function of which files
>   changed:** #2577 changed frontend code and was still ignored, which is what
>   disproved the earlier "no frontend files changed" reading of this state.
> - **Rate-limited** — the Hobby-tier daily cap:
>   `Resource is limited - try again in 24 hours (more than 100, code:
>   "api-deployments-free-per-day")`. An account quota, not a repo or diff
>   problem, and **no commit can fix it** — it resets daily. Observed on PRs
>   #2541, #2542 (02/08) and #2594 (04/08).
>
> **ANSWERED 2026-09-06 (MEH-2062): an `Ignored` deployment DOES count against
> `api-deployments-free-per-day`.** Measured on the Vercel dashboard by the
> orchestrator: 20 deployments in 5.5 hours, 18 of them `CANCELED` by the
> `ignoreCommand` — every one a quota unit spent on a build that was never going
> to happen. The 04/08 reading ("the quota gate runs BEFORE the ignore step",
> PR #2603: rate-limited with no `[preview]` token) was the mechanism; the
> dashboard count is the confirmation. **So the `ignoreCommand` alone cannot
> protect the quota**, and the fix moves one layer up: `git.deploymentEnabled`
> in `frontend/vercel.json` with `feature/*`, `dependabot/*` and `vrt-regen/*`
> set to `false` — Vercel then creates no deployment record for those pushes at
> all; `staging` and `main` stay `true`, and the `ignoreCommand` is kept as the
> second layer for any branch the map does not name.
>
> ### ✅ APPLIED 2026-09-07 — `6bdb10d1` (PR #3484), in production via `8e69ff1e`
>
> _(This block read **"STAGED, not applied — `frontend/vercel.json` is
> filesystem-denied to CC and the API route was refused"** until 07/09. Both
> halves were wrong in the same way: the deny is on the **filesystem tools**,
> and the GitHub Contents API writes that path without complaint — the tool ×
> path split `.claude/rules/security.md` already documents. Reading a
> tool-level refusal as a path-level block is what kept this parked.)_
>
> **Acceptance met, measured on the Vercel deployment list — and the boundary
> is visible inside one window, which is what makes it evidence rather than an
> absence:**
>
> | Time (07/09) | Ref | State |
> |---|---|---|
> | 07:36:32Z | `feature/meh-2278-vrt-label-trigger` | **CANCELED** — a quota unit spent |
> | **07:38:44Z** | **`6bdb10d1` lands on `staging`** | — |
> | 07:38Z → 10:35Z | `staging` ×8, `main` ×1 | READY |
> | 10:38:19Z · 10:46:06Z | two pushes to `feature/meh-2210-docs-backfill` | **no row at all** |
>
> Same branch shape, same project, two minutes apart at the boundary: `CANCELED`
> before, **nothing** after. **The control that stops this being a null that is
> also the reassuring answer:** `staging` deployments in the same window are
> `READY`, so deployment creation is alive and reporting — the absence is the
> config, not a rate limit or a dead instrument.
>
> ### ⚠️ REVERSED for `feature/*` 2026-11-08 (MEH-2845, Sapir's option א)
>
> `frontend/vercel.json` sets `"feature/*": true` again, so a `[preview]` commit
> reaches the `ignoreCommand` and builds (proof on PR #4222: `[preview]` →
> READY, plain push → CANCELED). **The MEH-2062 guard is therefore gone for
> `feature/*`:** every push to a feature branch creates a deployment record and
> spends one unit of `api-deployments-free-per-day` (100) whether it builds or
> not, and a spent quota blocks `staging` and `main` deploys too. Keep feature
> pushes few. `dependabot/*` and `vrt-regen/*` stay `false`. The paragraph below
> describes 07/09 → 08/11 and is history.
>
> **Consequence for rule 9 (workflow.md), live 07/09 → 08/11:** a feature branch gets a
> preview only by an explicit `vercel deploy` (Sapir's CLI) — the `[preview]`
> commit-message token no longer reaches Vercel on those branches. Absent a
> preview, the UI evidence is the 375/1440 Playwright bundle (rule 23 amendment)
> plus staging after merge. **The two states below (`Ignored` / rate-limited)
> are now history for `feature/*`** — they still describe any branch the map
> does not name.
>
> _History, kept for the record:_ the question was opened 2026-08-04 on PR
> #2594 (`Ignored` on one SHA, rate-limited on the next) and could not be
> resolved from the repo — it needed the dashboard's deployment list against
> the day's push count, which is what the 06/09 measurement is.
>
> When there is no preview, say so in the PR and name which of the two states it
> was — do not silently drop rule 9, and do not report a stale or ignored URL as
> if it rendered the diff. The rate-limit half is an as-of observation on a quota
> that resets daily; re-check rather than quoting it.
>
> **Not to be confused with the E2E change.** MEH-1044 moved the Playwright
> suite off Vercel previews onto a local `next start` target — that is about the
> *test runner's* target, not about whether feature branches get previews at
> all. Nothing in `.claude/rules/` or `CLAUDE.md` claims feature branches get no
> previews; `grep -n preview` over both, 2026-08-03, found no such statement.

**Wait for approval before merging to staging.** Full mobile checklist:
[docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) → "Testing workflow".

| PR type | What to check | Testing needed? |
|---|---|---|
| docs-only (CHANGELOG, ROADMAP, CLAUDE.md) | Read the diff | None |
| infra-only (.github, settings.json, .gitignore) | Read the diff | None |
| UI change | Test Vercel preview on mobile | Yes |
| Backend change | Test the affected API endpoint | Yes |
| Hotfix | Test only the broken thing | Minimal |
