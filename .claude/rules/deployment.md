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
| `feature/*` | New work | Vercel preview URL only — **opt-in, and off by default**; see "PR approval flow" below (as of 2026-08-04, MEH-1900) |

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
> `staging` and `main` build unconditionally. **Every other branch builds only
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
> **OPEN QUESTION — does an `Ignored` deployment count against
> `api-deployments-free-per-day`? Unresolved as of 2026-08-04; do not write
> either answer into this rule until it is settled.** PR #2594 showed `Ignored`
> on one SHA and rate-limited on the next, which *looks* like the quota being
> consumed before the ignore step runs. But with ~17 open PRs pushing all day,
> the account could equally have crossed 100 deployments from **other branches'
> real builds** in between. Both explanations fit the observation, and nothing
> observed so far separates them. Weak support for "yes, it counts": each
> `Ignored` row still carries its own deployment ID and inspector URL, so a
> deployment *record* exists — but a record existing is not the same as it being
> counted. **Resolution method:** compare the Vercel dashboard's deployment list
> against the number of pushes over one day. That needs dashboard access and is
> **not resolvable from the repo**, so no CC session can settle it.
>
> **One thing the question IS now settled on (measured on PR #2603, 2026-08-04):
> the quota gate runs BEFORE the ignore step.** That PR carries no `[preview]`
> token, so it should have reported `Ignored` — and instead Vercel returned the
> `api-deployments-free-per-day` error outright. A deployment that reaches the
> `ignoreCommand` at all has therefore already been admitted past the quota
> check. **This still does not answer the question above:** being *checked
> against* a counter and *incrementing* it are different, and only the dashboard
> comparison separates them. Recorded because it narrows the search, not because
> it closes it.
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
