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
| `feature/*` | New work | Vercel preview URL only |

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

> **The preview is not always there to send (measured 2026-08-02/03, MEH-1861).**
> The instruction above is normative and unchanged; this note dates its
> *premise*. Two states observed on real PRs:
>
> - **Rate-limited.** PRs #2541 and #2542 (02/08) got
>   `Resource is limited - try again in 24 hours (more than 100, code:
>   "api-deployments-free-per-day")` — the Hobby-tier daily deployment cap,
>   an account quota, not a repo or diff problem. No preview URL exists to send.
> - **Ignored.** PRs #2494 and #2547 show the deployment as `Ignored`
>   (Vercel's ignore-build-step), with a preview link listed but no fresh build
>   behind it.
>
> When there is no preview, say so in the PR and name which of the two it was —
> do not silently drop rule 9, and do not report a stale or ignored URL as if it
> rendered the diff. This is an as-of observation on a quota that resets daily;
> re-check rather than quoting it.
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
