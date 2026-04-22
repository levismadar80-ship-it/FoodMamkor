# API Contract Audit + Deployment Verification — MEH-245

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
- `fetch()` defaults to `GET`; an overridden method passed via
  `{ method: "POST" }` is not parsed. `navigator.sendBeacon()` is treated
  as `POST`.

---

## Static audit — current staging

| Metric | Count |
|---|---|
| Frontend call sites | 177 |
| Frontend unique paths | 100 |
| Backend routes | 153 |
| Orphan frontend (404 risk) | **0** ✅ |
| Method mismatches | **0** ✅ |
| Known dynamic expansions matched | 1 |
| Orphan backend (dead code candidates) | 23 |

A static run on `staging` is expected to exit 0 until a PR removes a
backend route or changes a path a caller still uses.

### Dead backend routes (flag only — deletion is a separate decision)

Grouped by likely reason. None are deleted by this PR.

**Infra-only / intentionally uncalled by the browser client**

| Route | Location | Notes |
|---|---|---|
| `GET /health` | `backend/app/main.py:434` | Railway healthcheck — never called from JS. |
| `HEAD /health` | `backend/app/main.py:434` | Same. |

**v2 features — tables and endpoints exist, no UI yet**

| Route | Location |
|---|---|
| `GET /recipes` | `backend/app/routers/recipes.py:15` |
| `GET /recipes/{_}` | `backend/app/routers/recipes.py:23` |
| `POST /recipes` | `backend/app/routers/recipes.py:36` |
| `GET /admin/recipes/pending` | `backend/app/routers/admin.py:454` |
| `POST /admin/recipes/{_}/approve` | `backend/app/routers/admin.py:459` |
| `POST /admin/recipes/{_}/reject` | `backend/app/routers/admin.py:469` |

**CRUD endpoints whose UI was never built**

| Route | Location |
|---|---|
| `GET /experiences/mine` | `backend/app/routers/experiences.py:142` |
| `GET /home-products/{_}` | `backend/app/routers/home_products.py:167` |
| `PUT /home-products/{_}` | `backend/app/routers/home_products.py:239` |
| `DELETE /home-products/{_}` | `backend/app/routers/home_products.py:260` |
| `GET /home-products/{_}/ratings` | `backend/app/routers/home_products.py:298` |
| `GET /users/me/following` | `backend/app/routers/producers.py:575` |
| `POST /producers/me/verify-phone` | `backend/app/routers/producer_me.py:498` |
| `POST /producers/me/verify-phone/confirm` | `backend/app/routers/producer_me.py:534` |
| `POST /producers/me/kashrut-request` | `backend/app/routers/producer_me.py:571` |

**Admin aliases the UI never adopted**

| Route | Location | Note |
|---|---|---|
| `GET /admin/producers/pending` | `backend/app/routers/admin.py:266` | UI uses `GET /admin/producers?status=pending`. |
| `POST /admin/producers/{_}/reject` | `backend/app/routers/admin.py:309` | No reject button wired in admin producers page. |
| `GET /admin/stats` | `backend/app/routers/admin.py:538` | UI uses `GET /admin/dashboard`. |
| `POST /admin/seed-cities` | `backend/app/routers/admin.py:556` | Seed-only; called from scripts, not the browser. |
| `GET /reviews` | `backend/app/routers/reviews.py:203` | Publicly-listable reviews endpoint with no consumer yet. |
| `PUT /admin/reviews/{_}/hide` | `backend/app/routers/reviews.py:361` | Admin hide-review action not wired. |

---

## The three known "404s" from MEH-244 — how the tool catches each

| Endpoint | Mode that catches it | What the output will show |
|---|---|---|
| `GET /holiday-mode` | `--probe https://mehamakor.online` or `--cross-env` | `404` on prod + `200` on staging → `← DEPLOY DRIFT`. |
| `GET /admin/group-buys` | same | same |
| `GET /auth/profile-image` | none of the above today | No caller in `staging`, no route in `staging`; MEH-243 owns the feature and will add both sides together. |

MEH-244 becomes a probe + diagnosis task after this PR merges:

```bash
python scripts/check_api_contract.py --cross-env \
  --staging https://staging.mehamakor.online \
  --prod    https://mehamakor.online
```

If the two paths above show `200 / 404`, the fix is a Railway redeploy of
production, not a code change — the routes are already in `main`.

---

## CI integration

Both steps are wired in `.github/workflows/deploy.yml` and are
**warn-only** (`continue-on-error: true`) until MEH-244 confirms production
is clean. Flip to hard failure after.

| Step | Trigger | Mode |
|---|---|---|
| `api-contract-static` | Every push and PR to `main` / `staging`. | Static — always runs, no network. |
| `api-contract-probe` | Staging redeploy job (`push` to `staging`). | Probe against `https://staging.mehamakor.online` after redeploy. |

Cross-env mode is manual (`workflow_dispatch`) for now; promote to scheduled
once staging + prod probe baselines are stable.

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
