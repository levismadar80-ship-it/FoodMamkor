# API Contract Audit + Deployment Verification — MEH-245

> **Note:** recipes feature removed in MEH-587 (15.5.2026). See CHANGELOG.


> Tool: [`scripts/check_api_contract.py`](../scripts/check_api_contract.py)
> First run: 2026-04-22 on branch `staging`
> CI: `.github/workflows/deploy.yml` → `api-contract-static` + `api-contract-probe`

---

## Post-mortem — why this PR exists

The original MEH-245 premise was "frontend ↔ backend contract drift is
causing 404s in `/admin`." We started by grepping for orphan frontend calls
on `staging` and found **zero**. Re-examining the three endpoints flagged in
MEH-244:

| Endpoint | Exists on `staging`? | Real cause |
|---|---|---|
| `GET /holiday-mode` | ✅ `backend/app/main.py:407` | **Deploy drift** — production is behind staging on commit `663e3b7`. |
| `GET /admin/group-buys` | ✅ `backend/app/routers/group_buys.py:19` registered at `backend/app/main.py:395` | **Deploy drift** — same reason. |
| `GET /auth/profile-image` | ❌ — no route, no caller in any merged branch | Feature in flight on MEH-243 branch, never hit `staging`. Out of scope for MEH-245. |

**Conclusion:** two of the three console 404s were code-present on staging.
A code-only contract audit cannot catch them — the drift is between
**environments**, not between **layers**. The scope of this PR therefore
expanded to a deployment verification tool that catches both.

**Prior attempt:** branch `claude/audit-api-contracts-qm2Rd` (not merged)
ran a human-guided grep + cross-reference, not a script, and correctly
reported zero static orphans. This PR keeps that finding and adds the two
dynamic modes plus an executable script so the audit is repeatable and
CI-integrated.

---

## Modes

| Mode | Command | What it catches | Exit non-zero when |
|---|---|---|---|
| `static` (default) | `python scripts/check_api_contract.py` | Frontend calls with no backend route; method mismatches; dead backend routes. | Orphan frontend calls exist or a method mismatch is found. |
| `probe` | `python scripts/check_api_contract.py --probe https://…` | Runtime 404 against a running instance — including deploy drift. | Any probed path returns `404`. |
| `cross-env` | `python scripts/check_api_contract.py --cross-env --staging https://… --prod https://…` | Deploy drift: routes that respond on staging but 404 on production. | Any probe result differs between the two environments. |

All three modes are standalone; `requests` is imported lazily and is only
needed for `--probe` / `--cross-env`.

### Assumptions and limits

- Only URL-literal calls are captured — anything fully dynamic (e.g.
  `api.get(urlFromConfig)`) is skipped by design. Grep siblings the same
  way a human reviewer would.
- Path params on both sides are normalised to `{_}`, so
  `/producers/${id}` matches `/producers/{producer_id}`.
- Dynamic verb segments like `` api.post(`/admin/experiences/${id}/${endpoint}`) ``
  are handled via an explicit allowlist in the script (`KNOWN_DYNAMIC_EXPANSIONS`).
  One entry today — add more only when the variable is constrained to a
  finite set of known literals in the same file.
- `fetch()` reads the HTTP method from the balanced `{...}` options object
  that follows the URL and comma. Missing option defaults to `GET`.
  `navigator.sendBeacon()` is treated as `POST`.
- Probe mode cannot distinguish a missing route from a missing resource —
  handlers that raise `HTTPException(404)` on unknown IDs (e.g.
  `POST /producers/{_}/whatsapp-click`) will show up as `404` in
  `--probe` output even though the route exists. Cross-env mode is not
  affected for the MEH-244 endpoints because both `/holiday-mode` and
  `/admin/group-buys` are parameter-free. For parameter-based routes,
  rely on static mode + cross-env drift, not the raw probe status.
- Rate-limited endpoints (`@limiter.limit(...)`) can return `429` during
  a probe burst. `429` is not `404` so the tool still exits `0`; treat
  any `429` in output as "inconclusive, re-probe later".

---

## Static audit — current staging

| Metric | Count |
|---|---|
| Frontend call sites | 178 |
| Frontend unique paths | 101 |
| Backend routes | 154 |
| Orphan frontend (404 risk) | **0** ✅ |
| Method mismatches | **0** ✅ |
| Known dynamic expansions matched | 1 |
| Orphan backend (dead code candidates) | 23 |

A static run on `staging` is expected to exit 0 until a PR removes a
backend route or changes a path a caller still uses.

### Dead backend routes — triage (MEH-244, 2026-04-25)

Keep or schedule for deletion. No routes are deleted by this PR.

**Infra-only / intentionally uncalled by the browser client — KEEP FOREVER**

| Route | Location | Decision |
|---|---|---|
| `GET /health` | `backend/app/main.py:434` | ✅ Keep — Railway healthcheck. |
| `HEAD /health` | `backend/app/main.py:434` | ✅ Keep — same. |

**v2 features — tables and endpoints exist, no UI yet — KEEP (v2 scope)**

| Route | Location | Decision |
|---|---|---|
| `GET /recipes` | `backend/app/routers/recipes.py:15` | ✅ Keep — v2 recipe feature. |
| `GET /recipes/{_}` | `backend/app/routers/recipes.py:23` | ✅ Keep — v2. |
| `POST /recipes` | `backend/app/routers/recipes.py:36` | ✅ Keep — v2. |
| `GET /admin/recipes/pending` | `backend/app/routers/admin.py:454` | ✅ Keep — v2 admin. |
| `POST /admin/recipes/{_}/approve` | `backend/app/routers/admin.py:459` | ✅ Keep — v2 admin. |
| `POST /admin/recipes/{_}/reject` | `backend/app/routers/admin.py:469` | ✅ Keep — v2 admin. |

**CRUD endpoints whose UI was never built — KEEP (needed when UI ships)**

| Route | Location | Decision |
|---|---|---|
| `GET /experiences/mine` | `backend/app/routers/experiences.py:142` | ✅ Keep — UI not yet built. |
| `GET /home-products/{_}` | `backend/app/routers/home_products.py:167` | ✅ Keep — needed for detail page. |
| `PUT /home-products/{_}` | `backend/app/routers/home_products.py:239` | ✅ Keep — edit flow not wired yet. |
| `DELETE /home-products/{_}` | `backend/app/routers/home_products.py:260` | ✅ Keep — delete flow not wired yet. |
| `GET /home-products/{_}/ratings` | `backend/app/routers/home_products.py:298` | ✅ Keep — ratings display not wired. |
| `GET /users/me/following` | `backend/app/routers/producers.py:575` | ✅ Keep — following list not built. |
| `POST /producers/me/verify-phone` | `backend/app/routers/producer_me.py:498` | ✅ Keep — OTP flow (MEH-51, shipped). |
| `POST /producers/me/verify-phone/confirm` | `backend/app/routers/producer_me.py:534` | ✅ Keep — OTP confirm. |
| `POST /producers/me/kashrut-request` | `backend/app/routers/producer_me.py:571` | ✅ Keep — kashrut badge flow (MEH-51). |

**Admin aliases the UI never adopted — CANDIDATES FOR DELETION (v2 cleanup)**

| Route | Location | Decision |
|---|---|---|
| `GET /admin/producers/pending` | `backend/app/routers/admin.py:266` | 🗑 Delete candidate — UI uses `?status=pending`. |
| `POST /admin/producers/{_}/reject` | `backend/app/routers/admin.py:309` | 🗑 Delete candidate — no reject button in admin UI. |
| `GET /admin/stats` | `backend/app/routers/admin.py:538` | 🗑 Delete candidate — UI uses `/admin/dashboard`. |
| `POST /admin/seed-cities` | `backend/app/routers/admin.py:556` | ✅ Keep — scripts-only, not a dead route. |
| `GET /reviews` | `backend/app/routers/reviews.py:203` | ✅ Keep — public listing, wire UI before deleting. |
| `PUT /admin/reviews/{_}/hide` | `backend/app/routers/reviews.py:361` | 🗑 Delete candidate — hide action not wired in admin. |

Delete candidates (4 routes): open a separate MEH ticket before removing — each needs a IDOR/test audit first.

---

## The three known "404s" from MEH-244 — how the tool catches each

| Endpoint | Mode that catches it | What the output will show |
|---|---|---|
| `GET /holiday-mode` | `--probe https://mehamakor.online` or `--cross-env` | `404` on prod + `200` on staging → `← DEPLOY DRIFT`. |
| `GET /admin/group-buys` | same | same |
| `GET /auth/profile-image` | none of the above today | No caller in `staging`, no route in `staging`; MEH-243 owns the feature and will add both sides together. |

**MEH-244 closed 2026-04-25** — cross-env probe returned **Drift count: 0**.
All routes return identical status codes on staging and production (403 on
auth-protected endpoints is expected; the probe runs without a token).

```
python scripts/check_api_contract.py \
  --cross-env \
  --staging https://foodmamkor-staging.up.railway.app \
  --prod    https://mehamakor.online
# Drift count: 0
```

---

## CI integration

Both steps are wired in `.github/workflows/deploy.yml` and are
**hard-failing** (`continue-on-error: false`) as of MEH-244 (2026-04-25).

| Step | Trigger | Mode |
|---|---|---|
| `api-contract-static` | Every push and PR to `main` / `staging`. | Static — always runs, no network. |
| `api-contract-probe` | Staging redeploy job (`push` to `staging`). | Probe against `https://staging.mehamakor.online` after redeploy. |

Cross-env mode is manual (`workflow_dispatch`). Run it after any
production-only change (e.g. direct hotfix to `main`) to confirm no drift.

---

## Runbook

```bash
# Every PR, every local dev loop
python scripts/check_api_contract.py

# Machine-readable (for piping into other checks)
python scripts/check_api_contract.py --json

# After a staging deploy — catches drift before production deploy
python scripts/check_api_contract.py --probe https://staging.mehamakor.online

# On demand — compare the two environments
python scripts/check_api_contract.py --cross-env \
  --staging https://staging.mehamakor.online \
  --prod    https://mehamakor.online
```

Add a new `KNOWN_DYNAMIC_EXPANSIONS` entry in the script when a legitimate
dynamic frontend path trips the orphan check, and link the call site in
the comment so the next reviewer can verify the expansion list still
holds.
