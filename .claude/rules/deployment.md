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
| `staging` | Pre-production testing | staging.mehamakor.co.il + Railway staging env |
| `feature/*` | New work | Vercel preview only for a commit whose message contains `[preview]` (MEH-2845, 08/11); every other push is cancelled by the `ignoreCommand` **but still spends one of the 100 deployments/day** — see «PR approval flow» below |

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

After every PR, send the Vercel preview URL when one exists
(`בדיקי על: https://food-mamkor-[hash].vercel.app`).

- **Previews are opt-in.** `frontend/vercel.json` builds a feature branch only
  for a commit whose message contains `[preview]` (MEH-2845); every other push
  is `CANCELED` by the `ignoreCommand`. `main` always builds; `staging` builds
  only when something that ships changed (`scripts/vercel-ignore-build.sh`,
  MEH-3094).
- **Every feature push spends one of Hobby's 100 deployments a day**, built or
  cancelled (MEH-2062), and a spent quota blocks `staging` and `main` too. Keep
  feature pushes few. `dependabot/*` and `vrt-regen/*` are off in
  `git.deploymentEnabled`.
- **No preview → say which state in the PR:** `Ignored` (no `[preview]` in the
  message) or rate-limited (`api-deployments-free-per-day`, resets daily; no
  commit fixes it). Never report a stale or ignored URL as rendered.

History of the preview config (MEH-1900, MEH-2062, MEH-2845):
[docs/rules-history/2026-11-21/deployment.md](../../docs/rules-history/2026-11-21/deployment.md).

**Merging to staging is CC's, after its checks** (ADR-032; workflow rules 21
and 38–41). Staging → main waits for Sapir's «go merge». The check per PR type
is the table in workflow.md «PR approval guide».
