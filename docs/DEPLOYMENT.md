# מהמקור — Production Deployment Guide

> **Target stack:** Frontend → Vercel · Backend → Railway · Database → Railway Postgres (**stock, no PostGIS**)
> **Domain:** `mehamakor.online` (nameservers already point to Vercel)
>
> **Distance queries** use the Haversine formula directly in SQL against
> `producers.lat` / `producers.lng` float columns — no PostGIS extension is
> required. This is a hard requirement because Railway's default Postgres
> doesn't ship PostGIS and enabling it on their community template is
> unreliable.

This guide walks through a full cold-start deploy. Follow the steps in order
— each section ends with a ✅ **Verify** checkpoint. Do not move on until the
checkpoint passes.

---

## Branch Strategy

| Branch | Role | Deploys to | Who can push |
|---|---|---|---|
| `main` | Production | mehamakor.online (Vercel) + Railway production env | Nobody directly. PR-only, from `staging`. |
| `staging` | Non-prod testing | staging.mehamakor.online (Vercel) + Railway staging env | Nobody directly. PR-only, from `feature/*`. |
| `feature/*` | New features and fixes | None — local + Vercel preview URL | Branch owner. **Always created from `staging`**, never from `main`. |

### The flow

```
feature/your-thing  ──PR──▶  staging  ──PR──▶  main
       │                       │                 │
       │                       ▼                 ▼
   local + PR        staging.mehamakor.online   mehamakor.online
   preview                  (test here)           (live)
```

### Rules

1. **Always branch from `staging`**, not from `main`. `staging` is the
   integration line — branching from it means your feature merges back
   cleanly when you're done.
2. **Never push directly to `main` or `staging`.** Both are PR-only.
   The only path to `main` is `staging → main` via PR review.
3. **`feature/*` is the only naming convention for new work.** Use short,
   descriptive slugs: `feature/whatsapp-share`, `feature/event-rsvp`.
   Avoid `claude/*`, `wip/*`, personal-name prefixes — they litter the
   branch list and obscure intent.
4. **Test on `staging` before merging to `main`.** Open the change at
   `staging.mehamakor.online`, click through the flow you touched, then
   approve the PR to `main`.

### Day-to-day workflow

```bash
# 1. Start a new feature
git checkout staging
git pull --ff-only origin staging
git checkout -b feature/short-description

# 2. Work, commit, push
git add ...
git commit -m "feat: short description"
git push -u origin feature/short-description

# 3. Open PR: feature/short-description → staging
#    GitHub UI, or:  gh pr create --base staging

# 4. After the staging PR is merged, test on staging.mehamakor.online

# 5. When you're confident, open the promotion PR: staging → main
#    This is the "ship to production" step.
```

### Hotfixes

If something is broken in production and you need to ship a fix immediately:

```bash
git checkout main
git pull --ff-only origin main
git checkout -b hotfix/short-description
# fix, commit, push, open PR straight to main (skip staging)

# Then immediately back-merge main → staging so the two don't drift:
git checkout staging
git pull --ff-only origin staging
git merge origin/main
git push origin staging
```

Hotfixes are the only time direct-to-`main` is allowed. Use sparingly — every
hotfix is a story you'll have to tell during the post-mortem.

### Branch cleanup

The previous workflow created a wave of `claude/*` branches (one per session).
All work from those branches has been merged into `main` via PR #5, and they
have been deleted. Going forward:

- **Delete the feature branch immediately after the PR merges.** GitHub has a
  one-click button on the merged PR; use it.
- **Local branches:** `git fetch --prune` removes stale tracking refs;
  `git branch -d feature/foo` deletes the local branch (it refuses if there
  are unmerged commits — that's a feature).
- **Never create `claude/*` branches.** Use `feature/*`.

---

## Branching Strategy — One-Time Platform Setup

The `staging` branch was created in code (commit on this PR). The platform-side
configuration below requires manual clicks in the Railway, Vercel, and GitHub
UIs — there is no API access from the codebase to do it automatically.

### A. Railway — add a `staging` environment alongside production

The Railway production environment already exists and deploys from `main`.
Add a parallel `staging` environment that deploys from the `staging` branch.

1. Open <https://railway.app/dashboard> → mehamakor project.
2. Click the environment selector (top-left dropdown next to the project name)
   → **+ New environment**.
3. Name: `staging`. Choose **"Empty Environment"** — do **not** fork production,
   you want a clean DB so test data doesn't pollute real records.
4. Inside the new `staging` environment:
   - Click **+ New** → **Database** → **PostgreSQL** (gives you a
     `DATABASE_URL` for staging only — see §1 of this doc for the full
     PostgreSQL setup; same steps, separate instance).
   - Click **+ New** → **GitHub Repo** → select `levismadar80-ship-it/FoodMamkor`.
     - **Service settings → Source → Branch:** `staging`
     - **Build → Builder:** Dockerfile (same as production)
5. Copy these env vars from `production` → `staging` (Variables tab; "Add
   Reference" works for the DB URL, others need fresh values):

   | Variable | How to set on staging |
   |---|---|
   | `DATABASE_URL` | Auto-injected from the staging Postgres service via Add Reference — don't override. |
   | `JWT_SECRET_KEY` | **Generate fresh:** `python -c "import secrets; print(secrets.token_hex(32))"`. Do NOT reuse production. |
   | `ANTHROPIC_API_KEY` | Same key as production (it's the same Anthropic account). |
   | `CORS_ORIGINS` | `https://staging.mehamakor.online,http://localhost:3000` |
   | `FRONTEND_URL` | `https://staging.mehamakor.online` — **override per environment. NEVER copy from production.** Used by backend to build email links (verify-email, reset-password, welcome, producer-dashboard, admin notifications). Misconfiguration sends staging users to production (MEH-332). |
   | `ENV` | `staging` |
   | `CLOUDINARY_*` | Same as production for MVP (same media bucket). |
   | `WHATSAPP_PHONE_NUMBER_ID` | Phone Number ID from Meta WhatsApp Manager (see HANDOFF.md → "WhatsApp Cloud API"). Use staging value or leave unset to skip WhatsApp sends on staging. Replaces `TWILIO_WHATSAPP_FROM` (MEH-508). |
   | `WHATSAPP_ACCESS_TOKEN` | Never-expiring System User token from Meta Business Suite. Store in Railway variables, never in `.env` files. |
   | `WHATSAPP_BUSINESS_ID` | WhatsApp Business Account ID (WABA). |
   | `WHATSAPP_API_VERSION` | `v21.0` (hardcoded fallback; override only to pin a different Graph version). |
   | `GOOGLE_CLIENT_ID` / `APPLE_CLIENT_ID` | Same client IDs, but add `staging.mehamakor.online` to the OAuth app's authorized origins/redirect URIs in the Google + Apple consoles first. |

6. Production environment — verify the GitHub source is pinned to `main`.
   If it's pinned to anything else (e.g. `claude/setup-documentation-sQ6Sw`),
   change it to `main` now.

### B. Vercel — add `staging.mehamakor.online`

Vercel auto-deploys every branch to a preview URL. The two named deploys are:

- `main` → **Production** → `mehamakor.online`
- `staging` → **Preview** with custom domain → `staging.mehamakor.online`

Steps:

1. Open <https://vercel.com/dashboard> → mehamakor project.
2. **Settings → Git → Production Branch:** confirm it's `main`. Change it
   if not.
3. **Settings → Domains:**
   - `mehamakor.online` → **Production** (main) — already configured.
   - Click **Add** → enter `staging.mehamakor.online`.
   - When prompted, choose **"Git Branch"** → `staging`.
   - Vercel will give you a CNAME record: `staging` → `cname.vercel-dns.com`.
     Add it at your DNS provider.
4. **Settings → Environment Variables** — add a `staging` (Preview) scope
   for variables that differ from production:

   | Variable | Production | Preview (staging) |
   |---|---|---|
   | `BACKEND_URL` | `https://foodmamkor-production.up.railway.app` | `https://foodmamkor-staging.up.railway.app` |
   | `NEXT_PUBLIC_API_URL` | same as production `BACKEND_URL` | same as staging `BACKEND_URL` |
   | `NEXT_PUBLIC_SITE_URL` | `https://mehamakor.online` | `https://staging.mehamakor.online` |
   | `NEXT_PUBLIC_SENTRY_DSN` | Production DSN | Empty during MVP, or a separate Sentry project. |
   | `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Production Clarity ID | Empty (don't pollute heatmaps). |

   Mark each variable as **Production** or **Preview** in the Vercel UI. Don't
   mark anything as **Development** unless you also use `vercel dev` locally.

5. Trigger the first staging deploy: Vercel **Deployments tab** → find the
   latest `staging` build → if it didn't auto-trigger, click **Redeploy**.

### C. GitHub branch protection

Branch protection requires admin access — it can't be set via the GitHub API in
this codebase. Open:

**<https://github.com/levismadar80-ship-it/FoodMamkor/settings/branches>**

> **After merging `.github/workflows/pr-checks.yml`**, push a test PR to `staging`
> and let the three jobs run once. GitHub only shows a check in the "Required status
> checks" autocomplete AFTER it has seen the check run at least once. Do not
> configure the rules below until the first run has completed.

#### Required checks (authoritative — verified 2026-05-23)

**Branch protection on this repo is enforced via Rulesets** (Settings → Rules),
NOT classic Branch Protection (Settings → Branches). This has a critical API
consequence:

> **`GET /repos/{owner}/{repo}/branches/{branch}/protection` returns `404`**
> when only Rulesets are configured (no classic Branch Protection rule). This is
> the post-2024 GitHub model. **Do NOT read the 404 as "no protection"** — the
> branch IS protected; the classic-BP endpoint just can't see Rulesets. Read the
> real config from Settings → Rules in the UI, or `GET /repos/{owner}/{repo}/rulesets`.
> _(Source: 2026-05-23 — a session note briefly claimed "branch protection absent"
> off this 404 before it was corrected from the Rulesets UI.)_

**The 6 required status checks on `protect-main`** (verbatim job `name:` strings,
confirmed from the Rulesets UI 2026-05-23):

1. `Frontend build (Next.js)` — `pr-checks.yml` job key `build`
2. `Backend tests (pytest)` — `pr-checks.yml` job key `pytest`
3. `Backend lint (ruff)` — `pr-checks.yml` job key `lint-backend`
4. `Env drift (.env.example)` — `pr-checks.yml` job key `env-drift`
5. `Frontend lint (RTL + Next.js rules)` — `deploy.yml` job key `lint`
6. `API contract audit (static)` — `deploy.yml` job key `api-contract-static`

> `protect-staging` is assumed to mirror this list (the tables below have
> historically been identical for both branches), but only `protect-main` was
> screenshotted on 2026-05-23 — confirm via Settings → Rules → `protect-staging`
> if it ever matters.

> **`Backend dependency audit (pip-audit)` and `Frontend dependency audit (npm
> audit)` are NOT required checks** as of this audit. They are *blocking jobs*
> in `dependency-audit.yml` (`continue-on-error: false` — a real CVE fails that
> workflow run) but are not in the `protect-main` required-status-checks list.
> **"Blocking job" ≠ "required check."**

**The required-check identifier is the job's `name:` field, NOT the job key (id).**
GitHub matches required checks by the human-readable `name:` string. The
`deploy.yml` job *key* is `api-contract-static`, but the required-check *name*
is `API contract audit (static)`.
- Renaming a job's **`name:`** silently **breaks** branch protection — the
  required check goes missing and PRs block forever waiting for a status that
  never reports. Update the ruleset in the same change.
- Renaming a job **key** is safe for branch protection (but update any `needs:`).

**Decision rule — skipping a check on docs-only PRs without breaking protection:**

| Check is… | How to skip on docs-only PRs | Why it's safe |
|---|---|---|
| **Required** (any of the 6 above) | **Job-skip + docs-only twin (MEH-736)** — keep `needs: changes` + `if: <paths>` on the real job, AND add a no-op twin job with the **identical `name:`** that runs on the exact complement filter and exits 0. | **Under Rulesets a *skipped* required check reports as "Expected" and BLOCKS merge** — it does NOT satisfy the check. This **differs from classic branch protection**, which treated skipped as success; the stale assumption forced admin-merges on 2026-06 (#910/#913 + a near-miss). The twin reports `success` under the same `name:` so docs-only PRs merge with no override. Twins = the `*-noop` jobs in `pr-checks.yml` + `deploy.yml`. Earlier examples **#811/#814** predate the Rulesets migration and relied on the now-false skipped=success assumption. |
| **Not required** (e.g. `Adversarial review (calibration)`) | **Trigger-level `paths-ignore`** on the `pull_request:` trigger. | The workflow doesn't trigger → no check is expected → nothing to satisfy. Worked example: **#812 (F3)** — `paths-ignore` on `claude-review.yml`. **NEVER** apply `paths-ignore` to a *required* check: the check becomes **absent** and branch protection blocks the PR forever. |

#### Rule 1: `main`

| Setting | Value |
|---|---|
| Branch name pattern | `main` |
| Require a pull request before merging | ✅ |
| Required approvals | **1** |
| Dismiss stale approvals on new commits | ✅ |
| Require status checks to pass before merging | ✅ |
| → Required checks | `Frontend build (Next.js)` |
| → Required checks | `Backend tests (pytest)` |
| → Required checks | `Backend lint (ruff)` |
| → Required checks | `Env drift (.env.example)` |
| → Required checks | `Frontend lint (RTL + Next.js rules)` |
| → Required checks | `API contract audit (static)` |
| Require branches to be up to date before merging | ✅ |
| Require linear history (squash or rebase only) | ✅ |
| Do not allow bypassing the above settings | ✅ (applies to admins too) |
| Allow force pushes | ❌ disabled |
| Allow deletions | ❌ disabled |

#### Rule 2: `staging`

| Setting | Value |
|---|---|
| Branch name pattern | `staging` |
| Require a pull request before merging | ✅ |
| Required approvals | **0** (self-merge OK — review happens at `staging → main`) |
| Require status checks to pass before merging | ✅ |
| → Required checks | `Frontend build (Next.js)` |
| → Required checks | `Backend tests (pytest)` |
| → Required checks | `Backend lint (ruff)` |
| → Required checks | `Env drift (.env.example)` |
| → Required checks | `Frontend lint (RTL + Next.js rules)` |
| → Required checks | `API contract audit (static)` |
| Require branches to be up to date before merging | ✅ |
| Allow force pushes | ❌ disabled |
| Allow deletions | ❌ disabled |

> **Check names must match exactly.** The job `name:` fields in
> `.github/workflows/pr-checks.yml` and `.github/workflows/deploy.yml` are what
> GitHub uses to identify required checks. If the workflow YAML changes a job name,
> the branch protection rule must be updated to match.

> **`Adversarial review (calibration)` is intentionally NOT a required check.**
> Wired via `.github/workflows/claude-review.yml`
> (`anthropics/claude-code-action@v1`, MEH-487). Runs with
> `continue-on-error: true` during the calibration window so findings are
> informational. After the calibration tally crosses >70% useful (see
> [docs/CLAUDE-REVIEW.md](./CLAUDE-REVIEW.md) → "Calibration plan"), a
> follow-up PR flips it to blocking and adds the job name to the required
> checks list above.

> **`Backend lint (ruff)` is a required check (MEH-488 / MEH-448 /
> MEH-505).** Wired via `.github/workflows/pr-checks.yml` `lint-backend`
> job. MEH-488 added the gate in calibration mode against the dirty
> baseline (18 ruff `check` violations + 56 format files). MEH-448
> cleaned the baseline to zero. MEH-505 flipped `continue-on-error: true
> → false` (blocking posture) AND fixed the format-step flag from
> `--extend-exclude` to `--exclude` (only `ruff check` accepts the
> `extend-` form). After the MEH-505 PR merges, add `Backend lint
> (ruff)` to the required-checks lists for both `staging` and `main`
> via `Settings → Branches`. GitHub only auto-suggests the check name
> after the first run on the protected branch.

> **`Backend dependency audit (pip-audit)` and `Frontend dependency audit
> (npm audit)` are blocking jobs, but NOT `protect-main` required checks**
> (corrected 2026-05-23 — see "Required checks (authoritative)" above). Both
> run with `continue-on-error: false` in `dependency-audit.yml`, so a real
> high/critical CVE fails that workflow run (MEH-336; MEH-330 baseline —
> frontend 13 high / 6 moderate, backend 8 vulns at 2026-04-26 — cleared and
> flipped to blocking 2026-05-01). However, they are NOT in the `protect-main`
> ruleset's required-status-checks list: an earlier revision of this section
> wrongly listed them as required and claimed the tables reflected that. The
> tables above now show the ruleset-authoritative 6. **"Blocking job" (fails
> its own workflow run) ≠ "required check" (gates the PR via the ruleset).**

After saving both rules, verify by attempting a direct push from a feature branch
to `staging` — it should be rejected with "protected branch" error.


### D. Rate-limiter `TRUSTED_PROXY` flag (MEH-256) — **REQUIRED**

Set `TRUSTED_PROXY=1` on the backend service in **both** Railway
environments (staging + production). Without it, the rate limiter
falls back to `request.client.host` which on Railway is the edge-proxy
IP (`100.64.0.X` CGN range). All users share one bucket — a single
attacker burning the 5/min login limit denies login for the whole site.

1. Railway dashboard → backend service → **Variables → New Variable**
2. Name: `TRUSTED_PROXY`, Value: `1`
3. Save. Railway restarts the container automatically.

With `TRUSTED_PROXY=1` the rate limiter reads `X-Real-IP` (set by
Railway's edge from its own view of the TCP peer — unspoofable),
falling back to `X-Forwarded-For[-2]` if X-Real-IP is missing. Full
canonical implementation: [`backend/app/rate_limit.py`](../backend/app/rate_limit.py)
+ security rationale in [docs/SECURITY.md](./SECURITY.md) §2.

**Never enable `TRUSTED_PROXY` on a deploy that is directly exposed to
the public internet** — without a known proxy stripping/overwriting
`X-Real-IP`, attackers can set the header themselves and rotate
identities at will.

**Verification — curl with spoofed headers to staging:**

Because `X-Real-IP` is set by Railway's edge (not readable from
outside), the best verification is to make requests from two different
real IPs and confirm the limiter counters isolate. The simplest proxy
for "different real IPs" is a laptop on Wi-Fi + a phone on cellular.

```bash
# From laptop A (one real IP):
for i in 1 2 3 4 5 6; do
  curl -X POST https://staging.mehamakor.online/auth/login \
    -d '{"email":"no@one.com","password":"x"}'
done
# attempt 6 → 429

# From phone B (distinct real IP) same minute:
curl -X POST https://staging.mehamakor.online/auth/login \
  -d '{"email":"no@one.com","password":"x"}'
# → 401 (bucket isolates), not 429
```

If both IPs land in the same bucket, `TRUSTED_PROXY` is unset or mis-typed
(check case: `1` / `true` / `yes` / `on` are accepted, nothing else).

Assumes exactly one trusted proxy hop (Railway edge). If Cloudflare
is ever added in front of Railway, revisit the XFF fallback path
(`X-Real-IP` primary stays correct — Railway still sets it).


### E. Verify deploys actually ran (MEH-260)

Merging to `staging` or `main` does not guarantee the runtime changed.
Two failures have been seen in the wild (2026-04):

1. **Source-branch drift.** Railway's environment-level GitHub source
   was silently pointing at the wrong branch (`main` instead of
   `staging`). Every merge to `staging` was a no-op at runtime for
   several weeks. Fix is in the Railway UI — no code change.
2. **Dockerfile BuildKit mismatch.** Railway's build runner rejects
   `--mount=type=cache,target=...` unless the `id=` is present AND
   in Railway's `s/<service-uuid>-<name>` format. Either hardcode the
   id (couples the Dockerfile to a service) or drop the cache mount
   (~20-30s slower cold build).

**After every merge to `staging` or `main`, verify the runtime matches
the code, not just that CI went green:**

```bash
# 1. Health check — confirms the container is up at all
BACKEND=https://foodmamkor-staging.up.railway.app   # or foodmamkor-production
curl -s "$BACKEND/health"
#   Expect: {"status":"ok","db_init":"ready"}

# 2. Contract probe — hits every frontend call-site against the live backend
python scripts/check_api_contract.py --probe "$BACKEND"
#   Expect: 0 frontend orphans
#   If any endpoint returns 404 that exists in the code, the runtime
#   is stale. Go to the incident runbook below.
```

**Signs of deploy drift:**

- Contract probe shows endpoints returning 404 that exist in
  `git log origin/staging:backend/app/routers/<file>.py`.
- Railway's Deployments tab shows an "Active" deployment from days ago,
  not the latest commit.
- Bug fixes merged "days ago" still reproduce.

**If drift is suspected:**

1. Railway dashboard → the affected service → **Settings → Source →
   Branch**. Confirm it matches the expected branch (`staging` for
   staging env, `main` for production env).
2. Railway dashboard → the affected service → **Deployments**. Check
   for FAILED deploys between the last Active one and now. Copy the
   build log error.
3. Check `.github/workflows/deploy.yml` runs for recent commits —
   does the "Trigger Railway redeploy" job show `skipped` (correct:
   only runs on push to the protected branches) or `success` (the CLI
   kick fired)?
4. If the CLI "succeeded" but the container is stale: the `railway
   redeploy` CLI can silently "succeed" while deploying the same
   branch pointer as before. Check Railway's Deployments tab, not
   the GitHub Actions log.
5. See `docs/INCIDENTS/2026-04-staging-deploy-drift.md` for a full
   diagnostic walkthrough.


### Sanity checks before promoting `staging → main`

- [ ] `npx playwright test --project=desktop` passes locally (6/6)
- [ ] `pytest tests/test_api.py -q` passes locally (24/24)
- [ ] Manual smoke test on `staging.mehamakor.online`:
  - [ ] Homepage hero loads
  - [ ] Map shows producers
  - [ ] WhatsApp button on a producer page opens with the right text
  - [ ] Chat widget bottom-left answers a test question
  - [ ] No console errors in DevTools
- [ ] No new entries in Sentry's "issues" tab from the staging deploy
- [ ] PR description lists every behavior change so the next reviewer knows
  what they're approving for production

---

## Testing workflow — Vercel preview URLs

**Every PR gets a Vercel preview URL.** Before merging to `staging`, that
preview URL must be tested on a real device — primarily on mobile, since the
phone is the dominant viewport for mehamakor.online and many bugs only surface
in actual iOS Safari / Android Chrome.

### How preview URLs are generated

Once the Vercel + GitHub integration is enabled (per §B above), every push to
any branch — `feature/*`, `staging`, `main` — triggers a Vercel deployment.
Production-branch pushes deploy to `mehamakor.online`; everything else
deploys to a unique preview URL.

The preview URL pattern is:

```
https://food-mamkor-<commit-hash>-<vercel-org-slug>.vercel.app
```

`food-mamkor` is the Vercel project slug (matches the GitHub repo name lowercased
with non-alphanumeric chars replaced). The `<commit-hash>` is the short Git SHA
of the latest commit on the branch. The full URL is also commented onto the PR
automatically by the Vercel bot within ~60 seconds of the PR opening.

### The end-to-end flow

```
1. open feature/* branch from staging
2. push commits
3. open PR feature/* → staging
4. Vercel auto-builds + comments preview URL on the PR (~60s)
5. assistant surfaces preview URL to the user:
     "בדיקי על: https://food-mamkor-<hash>.vercel.app"
6. user tests on mobile → approves
7. merge to staging
8. Vercel auto-deploys staging to staging.mehamakor.online
9. final smoke test on staging subdomain
10. open PR staging → main
11. merge to main
12. Vercel auto-deploys main to mehamakor.online
```

### What every PR description must include

- **Vercel preview URL** — either pasted directly into the PR description, or
  a placeholder line (`Vercel preview: posted as a comment by @vercel below`)
  with the bot comment serving as the source of truth.
- **A test plan checklist** — the specific things the user should verify on
  the preview URL before approving. At minimum: "loads on mobile", "no console
  errors", "the changed flow works end-to-end".
- **A list of behavioral changes** — anything that affects what users see or
  how they interact. Doc-only PRs can say "no functional changes" and skip
  the test plan.

### Critical rule

**Never merge a PR to `staging` until the user has tested the preview URL.**
This is enforced by workflow rule #8 in [CLAUDE.md](../CLAUDE.md). Even when
the assistant is confident the change is safe, the human-on-mobile check
catches things desktop QA misses: rendering on small viewports, RTL edge
cases, real-device touch targets, font fallbacks, third-party SDK behavior
with the actual production CSP, etc.

The only exception is hotfixes — see [Branch Strategy → Hotfixes](#hotfixes)
above. Even hotfixes should ideally get a preview-URL check, but if production
is on fire, ship and verify after.

### Mobile testing checklist

When the user opens the preview URL on a phone, these are the things worth
checking — particularly for any UI-touching PR:

- [ ] Homepage hero loads, search pill is tappable
- [ ] Category icons render correctly (no font fallback to box characters)
- [ ] Map markers visible and tappable
- [ ] Bottom navigation works, icons sized correctly
- [ ] WhatsApp button on a producer page opens the WhatsApp app (not the web)
- [ ] Form inputs don't zoom on focus (iOS Safari quirk — `font-size: 16px`
  on inputs is the fix)
- [ ] Hebrew text aligns right, no LTR leakage
- [ ] No horizontal scroll
- [ ] Sticky elements (header, BottomNav) don't overlap content
- [ ] Skeleton loaders appear briefly, then real content

For deeper coverage, see the smoke checklist in [TESTING.md](./TESTING.md).

---

## GitHub Actions auto-deploy

**The problem this solves.** Vercel auto-deploys cleanly off every push to
`main` *and* `staging` via its native GitHub integration — that part is
fire-and-forget. Railway, however, has bitten us before: its **Watch Paths**
config (set in §2.2 to `backend/**,Dockerfile,railway.json,.dockerignore`)
is great at skipping pointless rebuilds for doc-only PRs, but it means a
merge that doesn't touch any of those paths leaves Railway running an older
commit than Vercel. Production then "looks" updated (frontend ships) while
the backend silently lags — sometimes by days. We hit this exactly: Railway
was stuck on `1a8b35d` while `main` had moved on through `chat.py` and
several other backend changes, and the chat widget was 500'ing in
production.

**The fix.** A GitHub Actions workflow at
[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs on every
push to `main` *or* `staging`, installs the **Railway CLI**, and runs
`railway redeploy` against the matching environment. This kicks Railway
into a fresh deploy regardless of which paths the merge touched. Two jobs,
gated by branch — production and staging each have **their own
environment-scoped Railway token** (`RAILWAY_PRODUCTION_TOKEN` and
`RAILWAY_STAGING_TOKEN`) and run independently. Vercel keeps doing its
own thing — this workflow does **not** touch Vercel.

> **Why CLI instead of Deploy Hooks?** Railway's Deploy Hooks feature
> isn't available on our plan. The CLI works on every plan.
>
> **Why two tokens?** Railway project-scoped tokens on our plan are
> restricted to a single environment within the project — one token can
> redeploy production OR staging, never both. So the workflow needs two
> secrets, one per environment. Both come from the same Railway project
> (`believable-tenderness`), generated from the matching environment view.

```
merge PR → main                        merge PR → staging
   │                                       │
   ├──▶ Vercel GitHub integration          ├──▶ Vercel GitHub integration
   │    ──▶ mehamakor.online               │    ──▶ staging.mehamakor.online
   │    (already wired, no workflow)       │    (already wired, no workflow)
   │                                       │
   └──▶ .github/workflows/deploy.yml       └──▶ .github/workflows/deploy.yml
        production job, gated by ref            staging job, gated by ref
        env:                                    env:
          RAILWAY_TOKEN=$PROD_TOKEN               RAILWAY_TOKEN=$STAGING_TOKEN
          RAILWAY_ENVIRONMENT=production          RAILWAY_ENVIRONMENT=staging
        npm i -g @railway/cli                   npm i -g @railway/cli
        railway redeploy --service $SVC --yes   railway redeploy --service $SVC --yes
```

Both jobs read the same `RAILWAY_SERVICE_NAME` variable (defaults to
`FoodMamkor` if unset). Each job sources its own token secret as the
local `RAILWAY_TOKEN` env var because the Railway CLI auto-reads
whatever is in `RAILWAY_TOKEN` — only the source secret name differs
per job. Environment selection is plumbed through the
`RAILWAY_ENVIRONMENT` env var rather than a `--environment` CLI flag,
because the current Railway CLI does not accept `--environment` as a
flag on `redeploy` (it errors with `unexpected argument '--environment'
found`). Same end result, just plumbed via env instead of flag.

### One-time setup

There are **two secrets** to add (one per environment) and **one
variable** (the service name, optional — defaults to `FoodMamkor`).

#### 1. Generate the production token

1. Open <https://railway.app/dashboard> → **believable-tenderness**
   project → switch to the **production** environment (top-left
   environment selector).
2. **Settings → Tokens → New Token**.
3. Name it `github-actions-deploy`.
4. Copy the token immediately — Railway shows it once.

This token is scoped to the believable-tenderness project AND the
production environment only. It cannot touch staging or any other
project. Small blast radius.

#### 2. Generate the staging token

1. Same project — switch to the **staging** environment via the
   top-left environment selector.
2. **Settings → Tokens → New Token**.
3. Name it `github-actions-deploy` (same name is fine — Railway scopes
   them by environment, not by name).
4. Copy the token immediately.

#### 3. Add both tokens as GitHub repository secrets

> ⚠️ **Repository secrets, not Environment secrets.** GitHub has two
> secret scopes that look similar. The workflow only sees Repository
> secrets (no `environment:` declaration on either job). If you put
> these under Settings → Environments → `<env>` → Environment secrets,
> the workflow will see empty strings and fail-soft. Make sure both
> tokens are added as Repository secrets, not Environment secrets.

1. Open <https://github.com/levismadar80-ship-it/foodmamkor/settings/secrets/actions>.
2. **New repository secret** → Name: `RAILWAY_PRODUCTION_TOKEN`. Value:
   paste the production token from step 1. Save.
3. **New repository secret** again → Name: `RAILWAY_STAGING_TOKEN`.
   Value: paste the staging token from step 2. Save.
4. The secret names **must** match exactly — the workflow reads
   `${{ secrets.RAILWAY_PRODUCTION_TOKEN }}` and
   `${{ secrets.RAILWAY_STAGING_TOKEN }}`.

#### 4. (Optional) Set the Railway service name as a GitHub *variable*

The CLI's `--service` flag needs the **service name** as it appears in
Railway. The service is the deployable thing inside the project (the
backend FastAPI service, not the Postgres database). Defaults to
`FoodMamkor`; only set this variable if your service is named
something else.

1. Same page as above, switch to the **Variables** tab:
   <https://github.com/levismadar80-ship-it/foodmamkor/settings/variables/actions>.
2. **New repository variable** → Name: `RAILWAY_SERVICE_NAME`. Value: the
   exact service name from Railway → believable-tenderness project →
   service list.
3. Why a *variable* instead of a secret: service names aren't sensitive,
   and variables are visible in the Actions log which makes debugging
   easier ("did we target the right service?").
4. **If your service is named `FoodMamkor`** (the default), skip this
   step entirely.

#### 5. Verify it works

After adding both secrets, trigger a test run for each environment:

1. Open <https://github.com/levismadar80-ship-it/foodmamkor/actions/workflows/deploy.yml>.
2. Click **Run workflow** → choose the branch (`main` for production,
   `staging` for staging) → **Run workflow**.
3. The job for the matching environment should finish in ~30–60s (the
   bulk of that is `npm install -g @railway/cli`). The summary should
   end with:
   ```
   ✅ Triggered for commit <short-sha> (service: <SERVICE_NAME>)
   ```
4. Cross-check Railway: the matching service should show a new
   "Deploying" build within 10 seconds of the CLI step completing, and
   the commit SHA on the new deploy should match the one in the workflow
   log.
5. Repeat for the *other* branch — both tokens need an independent test.
   A working production token tells you nothing about whether the staging
   token works, because they're separately scoped.

If the CLI step fails with `Service "FoodMamkor" not found` (or similar),
the `RAILWAY_SERVICE_NAME` variable doesn't match the actual service.
Update it in **Settings → Variables** and re-run — no code edit needed.

If the CLI step fails with an auth error like `403 Forbidden` or
`token does not have access to environment <env>`, the wrong token is
in the wrong slot. Verify each secret value matches the environment it
was generated for in Railway.

If the CLI step fails with `error: unexpected argument '--environment'
found`, you're on a Railway CLI version that doesn't accept
`--environment` as a `redeploy` flag. The current workflow already
plumbs environment selection through the `RAILWAY_ENVIRONMENT` env var
instead, so this error shouldn't surface — but if it does, check that
the workflow file actually uses the env-var pattern and not the flag
pattern. We hit this exact failure mode early in the wire-up; the fix
was to drop `--environment` from the CLI command and set the env var
on each job.

### Behavior details

- **Fail-soft when a token is missing.** Each job has its own missing-secret
  guard: the production job fail-softs on missing `RAILWAY_PRODUCTION_TOKEN`,
  the staging job on missing `RAILWAY_STAGING_TOKEN`. Either job can be
  unconfigured without affecting the other — useful if you want to wire up
  one environment first and the other later.
- **Fail-loud when the CLI errors.** If `railway redeploy` exits non-zero
  (bad token, wrong service name, wrong environment scope, Railway outage,
  network failure), the step fails with the CLI's own error message and
  the job fails. Fix the underlying issue (rotate the token, fix the
  service name variable, wait out the outage) and re-run the workflow.
- **Branch gating.** Each job has an `if: github.ref == 'refs/heads/<branch>'`
  guard. A push to `main` runs only the production job; a push to
  `staging` runs only the staging job. The other job is skipped — no
  wasted runner minutes, and the Actions log shows exactly which
  environment ran.
- **Per-job concurrency (MEH-485).** `deploy.yml` no longer has a
  workflow-level `concurrency:` block. Each of the 5 jobs declares
  its own concurrency group:
  - `production` → `${{ github.workflow }}-production-${{ github.ref }}`,
    `cancel-in-progress: false` — back-to-back `main` pushes serialize,
    they do **not** abort an in-flight Railway deploy (data integrity).
  - `staging` → same shape, scoped to `staging` ref, also
    `cancel-in-progress: false`.
  - `lint`, `api-contract-static`, `api-contract-probe-staging` →
    `${{ github.workflow }}-<job>-${{ github.head_ref || github.ref }}`
    with `cancel-in-progress: true` (CI checks; fresh run wins on
    force-push or back-to-back pushes).
  Production and staging are still in different groups, so promoting
  `staging → main` doesn't lose the in-flight staging deploy. The
  practical change vs. the pre-MEH-485 single workflow-level block:
  back-to-back same-branch deploys now queue serially instead of
  cancelling the in-flight one.
- **Manual trigger.** The `workflow_dispatch` trigger means you can also
  fire either redeploy from the Actions tab without pushing a commit —
  useful if Railway crashed and you need to nudge it without writing
  code. Pick the branch in the Run workflow dialog and only the matching
  job runs.
- **`--yes` flag** is passed to `railway redeploy` to skip the
  interactive confirmation prompt. Without it the CLI hangs in CI
  forever (no TTY to confirm against).

### Disabling temporarily

If Railway is having an outage on a specific environment and you want
to stop the matching job from spamming errors on every merge, **delete
the matching token secret** in GitHub Settings → Secrets and variables →
Actions:

- Outage on production only → delete `RAILWAY_PRODUCTION_TOKEN`
- Outage on staging only → delete `RAILWAY_STAGING_TOKEN`
- Both → delete both

The matching job(s) fall back to fail-soft warning, leaving merges alone.
Re-add the secret(s) once Railway is healthy. **You can disable just one
environment without affecting the other** — that's the main reason for
two separate secrets. Don't disable the workflow at the file/UI level —
re-enabling later usually slips through the cracks.

### Rotating a token

Generate a new token in Railway (from the matching environment view),
then update the corresponding secret (`RAILWAY_PRODUCTION_TOKEN` or
`RAILWAY_STAGING_TOKEN`) in GitHub Settings → Secrets and variables →
Actions. Old token continues to work until you delete it in Railway,
so there's a brief overlap window.

### Why not run pytest / playwright in this workflow?

This workflow is intentionally **only** about kicking Railway. CI for tests
will live in a separate workflow file when it's set up, so the deploy
trigger keeps a single, obvious responsibility. Conflating "run tests" and
"trigger redeploy" in one job means a flaky test would block legitimate
deploys, which is exactly the opposite of what we want.

---

## E2E CI — Playwright against Vercel preview

The workflow at [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml)
runs Playwright tests against each PR's Vercel preview URL.

### How it works (current: `deployment_status` trigger)

GitHub Actions fires **only after Vercel signals the preview is ready**
(`deployment_status.state == 'success'` and
`deployment_status.environment` starts with `"Preview"`). The preview URL
is a first-class event field — no polling, no comment-regex parsing:

```yaml
TEST_URL: ${{ github.event.deployment_status.target_url }}
```

The job checks out `github.event.deployment.sha` (the exact deployed commit,
not HEAD) and runs Playwright with Chromium only (`timeout-minutes: 15`).
Production deployments (`environment: "Production"`) are skipped by the
`if:` condition.

### Why we switched from the previous `pull_request` trigger

The previous trigger polled for the Vercel bot PR comment and extracted the
URL with a regex (`\[Preview\]\(https://...\)`). The regex never matched the
actual Vercel comment format, so all 20 poll attempts (5 min each ×15 s)
exhausted silently — every job exited 1 regardless of PR content. This
produced a permanent `failure` status on every PR in 5 min 55 s, mistaken
for a stuck/hung job (MEH-212, confirmed on PRs #234 and #236).

### Fallback: `repository_dispatch` if `deployment_status` stops firing

Vercel 2026 recommendation for repos where `deployment_status` events don't
appear in Actions (e.g. certain GitHub App integration modes): configure a
**Vercel deployment webhook** that fires a `repository_dispatch` event.

**To switch to the fallback:**

1. **Vercel → Project → Settings → Webhooks → Add:**
   - URL: `https://api.github.com/repos/levismadar80-ship-it/FoodMamkor/dispatches`
   - Event: `deployment-ready`
   - Header: `Authorization: Bearer <GitHub PAT with `repo` scope>`
   - Body template (Vercel webhook variables):
     ```json
     {
       "event_type": "vercel.deployment.success",
       "client_payload": {
         "url": "{DEPLOYMENT_URL}",
         "branch": "{GIT_BRANCH}"
       }
     }
     ```

2. **Change the trigger in `e2e.yml`:**
   ```yaml
   on:
     repository_dispatch:
       types: [vercel.deployment.success]
   ```

3. **Replace `TEST_URL` and `if:` condition:**
   ```yaml
   # in the job-level if:
   if: github.event.client_payload.branch != 'main'

   # in the Run E2E tests step env:
   TEST_URL: ${{ github.event.client_payload.url }}
   ```

4. **Checkout the right commit** — `github.event.deployment.sha` is
   unavailable on `repository_dispatch`; use `github.sha` or parse the
   commit from the payload.

**Required secret:** a GitHub PAT with `repo` scope. Add it in
Vercel's webhook configuration (`Authorization` header). The
`deployment_status` approach needs only `GITHUB_TOKEN` — no PAT.

---

## 0. Prerequisites

- [ ] GitHub repo pushed, with branch `main` as the deploy branch
- [ ] Accounts: [Vercel](https://vercel.com), [Railway](https://railway.app),
      [Cloudinary](https://cloudinary.com), [Google Cloud Console](https://console.cloud.google.com)
- [ ] Domain purchased: `mehamakor.online` (nameservers on Vercel)
- [ ] Google OAuth Client ID:
      `591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com`

---

## 1. Railway — PostgreSQL (stock, no PostGIS)

Railway's default Postgres plugin is **all you need**. The backend uses the
Haversine formula in plain SQL (`cos`, `sin`, `acos`, `radians`) against
the `producers.lat` / `producers.lng` float columns — no PostGIS, no
geometry types, no manual extension step.

### 1.1 Create the database service

1. Railway Dashboard → **New Project** → **Deploy PostgreSQL**.
2. Rename the service to `mehamakor-db`.
3. Open the service → **Variables** tab — confirm `DATABASE_URL` exists.

### 1.2 Enable `uuid-ossp` (auto-handled)

The only extension we need is `uuid-ossp`, and the backend creates it
automatically on first boot from `backend/init_db.sql`. You don't have to
run anything manually.

### ✅ Verify

- Service status is **Active** in the Railway dashboard.
- `DATABASE_URL` is visible under **Variables**.

> **Why not PostGIS?** We used to have a `location GEOMETRY(POINT, 4326)`
> column. It was dead code — never read, never written — and blocked
> deployment on vanilla Railway. It has been removed. See commit history
> for the Haversine migration.

---

## 2. Railway — Backend (FastAPI)

### 2.1 Why the previous build failed (historical)

The error `Error creating build plan with Railpack` used to happen because:

1. The repo root contains **both** `frontend/` and `backend/`, so Railway's
   auto-detector couldn't decide which project to build.
2. Railpack (Railway's new default) doesn't understand monorepo layouts.
3. Our Dockerfile + `railway.json` were nested under `backend/`, which
   Railway only finds if you set Root Directory = `backend` manually.

**Fix (now committed):** Both `/Dockerfile` and `/railway.json` live at
the **repo root**. The Dockerfile uses `COPY backend/ .` so the
backend-only image is built from a repo-root build context — deps are
installed via `uv sync --frozen` from `backend/uv.lock` (see §9). You
do **not** need to set a Root Directory in Railway anymore — just import
the repo and it works.

### 2.2 Create the backend service

1. In the same Railway project → **New** → **GitHub Repo** → select
   `levismadar80-ship-it/foodmamkor`.
2. After the service is created, open **Settings**:
   - **Root Directory:** leave blank (use the repo root)
   - **Branch:** `main` (or your deploy branch)
   - **Watch Paths:** `backend/**,Dockerfile,railway.json,.dockerignore`
     — keeps frontend-only pushes from re-triggering the backend build.
3. Under **Build**:
   - **Builder:** `Dockerfile` — Railway reads this from `/railway.json`
     automatically; no manual setting required.
4. Save. Do **not** redeploy yet — set env vars first.

### 2.3 Backend environment variables

Open **Variables** tab. Add each of these (paste as key=value pairs using
"Raw Editor"). See [`backend/.env.example`](../backend/.env.example) for the
authoritative list.

```bash
# Auto-linked — do NOT set manually if you click "Add Reference → Postgres"
DATABASE_URL=${{mehamakor-db.DATABASE_URL}}

# Generate locally:  python -c "import secrets; print(secrets.token_urlsafe(64))"
SECRET_KEY=<paste generated secret>
ALGORITHM=HS256
# MEH-326: 15-min access token (was 1440/24h pre-MEH-326). Paired with a
# 14-day HttpOnly refresh cookie; the frontend interceptor rotates silently.
# Changing these values requires a Railway service restart:
# Settings → Variables → save → container auto-restarts within seconds.
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=14

GOOGLE_CLIENT_ID=591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com

CLOUDINARY_CLOUD_NAME=<from cloudinary dashboard>
CLOUDINARY_API_KEY=<from cloudinary dashboard>
CLOUDINARY_API_SECRET=<from cloudinary dashboard>

# Anthropic (home-product moderation + chat widget). Required for the
# moderation flow to actually hit Claude — without it, moderation
# fail-opens to APPROVED and the chat widget returns a friendly Hebrew
# "offline" message (see CLAUDE.md AI fail-open rule). ANTHROPIC_MODEL
# defaults to claude-opus-4-6 in config.py; override only if Opus is
# unavailable and you want to fall back to Haiku.
ANTHROPIC_API_KEY=<from console.anthropic.com>
ANTHROPIC_MODEL=claude-opus-4-6

# Public contact-form inbox (POST /contact). The April 2026 canonical
# value is levismadar80@gmail.com — the founder's Gmail, which also
# hosts the SMTP_USER credentials so the From: header matches. Falls
# back to ADMIN_EMAIL when unset. If SMTP is unconfigured, the
# submission is still persisted to contact_messages (fail-open).
CONTACT_EMAIL=levismadar80@gmail.com

FRONTEND_URL=https://mehamakor.online
```

> Twilio / SMTP / Apple keys are optional for first launch — leave blank and
> the matching features degrade gracefully.

**Linking DATABASE_URL_PRODUCTION properly (MEH-408 Phase 3):**

The backend now reads `DATABASE_URL_PRODUCTION` (production) and
`DATABASE_URL_STAGING` (staging) instead of the bare `DATABASE_URL`. The old
`DATABASE_URL` name is still accepted as a deprecated fallback (a warning is
logged at startup if the env-specific var is missing).

To link the DB reference for production:
1. Click **+ New Variable** → **Add Reference**.
2. Pick `mehamakor-db` → `DATABASE_URL`. Railway will template it as
   `${{mehamakor-db.DATABASE_URL}}`.
3. **Rename the key** from `DATABASE_URL` to `DATABASE_URL_PRODUCTION`.
4. Repeat for the staging environment using the key name `DATABASE_URL_STAGING`.

**Migration order** (prevents production DB outage during the transition):

- **Step 1:** Merge this PR — the fallback to `DATABASE_URL` stays in place,
  so the existing Railway variable keeps working with no downtime.
- **Step 2:** Add `DATABASE_URL_PRODUCTION` (production env) and
  `DATABASE_URL_STAGING` (staging env) in the Railway dashboard, pointing at
  the same DB reference as the current `DATABASE_URL`.
- **Step 3:** Verify startup logs show no deprecation warning (`"falling back
  to DATABASE_URL"`). Confirm `db_url = …` log line shows the correct host.
- **Step 4:** Only after verification — remove the old `DATABASE_URL` variable
  from Railway. The deprecated fallback is no longer needed.

### 2.4 Deploy

Click **Deploy** (or push a commit to `main`). Watch the build logs — you
should see:

```
[build] Using Dockerfile: Dockerfile
[build] Successfully built image
[deploy] Starting: uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
[deploy] Uvicorn running on http://0.0.0.0:8080
```

### 2.5 Generate a public domain

Service → **Settings** → **Networking** → **Generate Domain**. You'll get
something like `https://foodmamkor-production.up.railway.app`.
**Copy this URL — you'll need it for Vercel.**

> ⚠️ **Critical: also verify the Target Port.** While you're in
> **Settings → Networking**, check the **Target Port** field on the
> public domain row. **It must be `8080`**, not `8000`. Railway injects
> `$PORT=8080` into the container at runtime, the Dockerfile CMD binds
> uvicorn to `${PORT:-8000}` (i.e., `8080` in Railway), and Railway's
> internal router uses the Target Port setting to decide which container
> port to forward traffic to. If Target Port is `8000` (the value
> someone copy-pasted from the Dockerfile's `EXPOSE 8000`, which is
> documentation-only and misleading), traffic hits a port nothing is
> listening on and Railway returns `502` with `X-Railway-Fallback: true`
> on every request — even though the container is healthy and uvicorn
> is running fine on `8080`. We hit this exact failure mode end-to-end
> in production once; it's a 30-second fix in the Railway UI but it can
> burn an hour to diagnose because the symptoms (`502` everywhere, no
> useful logs in the deploy panel since the container itself is fine)
> point at code or env vars instead of network config.

### ✅ Verify

Open in a browser or curl:

```bash
curl https://<your-backend>.up.railway.app/
# → {"message":"מהמקור API - ברוכים הבאים"}

curl https://<your-backend>.up.railway.app/producers
# → [...array of producers...]
```

If the root endpoint returns the welcome JSON **and** `/producers` returns a
(possibly empty) array, the backend is live and the DB connection works.

**Troubleshooting:**
- `502 Bad Gateway` with response header `X-Railway-Fallback: true` →
  Railway's networking Target Port is wrong (probably `8000`). Set it
  to `8080` in **Settings → Networking → Target Port**. See the
  callout above and the §6 gotchas table.
- `500 Internal Server Error` on `/producers?lat=...&lng=...&radius_km=...`
  → the Haversine query tripped on NULL lat/lng; the router already filters
  these out, so check that your producers seed has valid coordinates.
- Cold start hangs → lifespan hook is creating tables + seeding; first boot
  takes ~20 s.
- `psycopg2.OperationalError` → `DATABASE_URL` reference is wrong; re-link
  via **Add Reference**.
- `column "location" does not exist` (old deployments) → the startup
  migration in `app/main.py` drops it automatically; a single restart
  cleans it up.

---

## 3. Vercel — Frontend (Next.js)

### 3.1 Import the project

1. Vercel Dashboard → **Add New** → **Project** → import
   `levismadar80-ship-it/foodmamkor`.
2. **Framework Preset:** Next.js (auto-detected).
3. **Root Directory:** set to **`frontend`** ← **critical**
4. **Build & Development Settings:** leave everything at **Default** — do NOT
   override Install Command, Build Command, or Output Directory. Vercel's
   Next.js preset handles all of them automatically from
   `frontend/package.json`.

> **Why `frontend`?** The Next.js app lives in `frontend/`. With Root
> Directory = `frontend`, Vercel `cd`s in there, reads `frontend/vercel.json`
> for headers + framework hints, and uses default `npm install` + `next build`
> from that cwd. This is the canonical Vercel monorepo pattern.
>
> **Warning:** Vercel's `rootDirectory` is NOT a valid field inside
> `vercel.json` — it's strictly a Project Setting in the dashboard. Don't try
> to set it in a config file; you have to click it in the UI once per project.
>
> **If you see `cd: frontend: No such file or directory` in the build log:**
> you have a leftover custom Install Command in **Settings → General → Build
> & Development Settings**. Reset it to Default.

### 3.2 Frontend environment variables

Paste these into **Environment Variables** (scope: *Production, Preview,
Development*). See [`frontend/.env.example`](../frontend/.env.example).

```bash
# Use the live Railway backend URL — no trailing slash
BACKEND_URL=https://foodmamkor-production.up.railway.app
NEXT_PUBLIC_API_URL=https://foodmamkor-production.up.railway.app

NEXT_PUBLIC_GOOGLE_CLIENT_ID=591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7.apps.googleusercontent.com
NEXT_PUBLIC_SITE_URL=https://mehamakor.online
```

> **Why both `BACKEND_URL` and `NEXT_PUBLIC_API_URL`?** `next.config.js`
> reads `BACKEND_URL` at **build time** to set up the `/api/*` proxy
> rewrite. `NEXT_PUBLIC_API_URL` is used by server components (`sitemap.js`,
> `producer/[id]/page.js`) for direct fetches. They must match.

### 3.3 Deploy

Click **Deploy**. First build takes ~2 min. Watch the build log — you
should see:

```
[next.config] /api/* → https://<your-backend>.up.railway.app
Route (app)
  ○ /
  ○ /map
  ƒ /producer/[id]
  ...
```

### 3.4 Attach the domain

1. Vercel Project → **Settings** → **Domains** → **Add** → `mehamakor.online`.
2. Also add `www.mehamakor.online` (redirect to apex).
3. Since nameservers are already on Vercel, the DNS records are created
   automatically. SSL cert issues within a few minutes.

### ✅ Verify

```bash
# DNS resolves
dig mehamakor.online +short

# Frontend is live
curl -I https://mehamakor.online
# → HTTP/2 200

# The proxy to the backend works
curl https://mehamakor.online/api/producers
# → [...same array as step 2.5...]
```

Open `https://mehamakor.online` in a browser. You should see the homepage
with producer cards loaded from Railway.

---

## 4. Google OAuth — production origins

The OAuth client id exists, but it needs the production URL whitelisted.

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Click the OAuth 2.0 Client ID
   `591935721343-jjrco2vpmok72to1fm8rq1ss0i2s0cj7...`.
3. Under **Authorized JavaScript origins** add:
   - `https://mehamakor.online`
   - `https://www.mehamakor.online`
4. Under **Authorized redirect URIs** add (if your flow uses a callback):
   - `https://mehamakor.online/login`
5. Save. Changes propagate within ~5 min.

### ✅ Verify

- Visit `https://mehamakor.online/login`, click "Sign in with Google".
- Login completes without `redirect_uri_mismatch` or `origin_mismatch`
  errors.

---

## 5. Post-deploy smoke test

Run through this checklist in a real browser:

- [ ] `https://mehamakor.online` loads the homepage with producer cards
- [ ] `/map` shows the Leaflet map with markers
- [ ] Clicking a producer card opens `/producer/<id>`
- [ ] Google login works end-to-end (check that a user row appears in the DB)
- [ ] Admin login works at `/admin` (create the first admin manually in the DB
      — see `ADMIN.md`)
- [ ] Image upload from `/admin` succeeds (requires Cloudinary env vars)
- [ ] PWA installable — Chrome → Install app

---

## 6. Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Railway: `Error creating build plan with Railpack` | Railway can't find `/Dockerfile` or `/railway.json` | Make sure you're deploying from a commit that has both at the **repo root** (not `backend/`). Clear build cache + redeploy if the commit looks right. |
| `ModuleNotFoundError: geoalchemy2` | Stale image from before the Haversine migration | Clear Railway build cache and redeploy |
| `COPY failed: file not found in build context: backend/...` | Custom Root Directory set to `backend/` | Clear Root Directory in Railway Settings — build context must be the repo root for the new Dockerfile |
| `column "location" does not exist` | Old schema had a dead PostGIS column | Startup migration drops it; restart the service once |
| `/producers?lat=...&radius_km=...` returns `[]` unexpectedly | Producers seeded with NULL lat/lng | They're filtered out by design — add coords in admin or seed |
| `502 Bad Gateway` from Railway with response header `X-Railway-Fallback: true` on every request | **Railway networking Target Port mismatch.** Railway injects `$PORT=8080` into the container, the Dockerfile binds uvicorn to `${PORT:-8000}` (= `8080` in Railway), but Railway's Settings → Networking → Target Port is set to `8000` (someone copy-pasted from `EXPOSE 8000` in the Dockerfile, which is documentation-only). Container is healthy on `8080`; Railway routes traffic to `8000`; nothing answers; fallback page. | Railway → service → **Settings → Networking** → click the public domain row → set **Target Port** to `8080`. Saves automatically; no redeploy needed. The 502 stops within seconds. |
| Frontend `/api/*` returns HTML (404) | `BACKEND_URL` not set at build time | Set env var in Vercel → **Redeploy** (not just restart) |
| Google login: `redirect_uri_mismatch` / `origin_mismatch` | Production domain not whitelisted in Google Cloud Console | §4 — add `https://mehamakor.online` to **Authorized JavaScript origins** AND, if your flow uses a callback, to **Authorized redirect URIs** |
| Chat widget returns "משהו השתבש 🌱" | `ANTHROPIC_API_KEY` not set in Railway production env | Railway → backend service → **Variables → New Variable** → `ANTHROPIC_API_KEY` = your key. Container restarts automatically on env var change. |
| `CORS policy: No 'Access-Control-Allow-Origin'` | Backend CORS closed | Set `CORS_ORIGINS` env var on Railway (comma-separated) to include `https://mehamakor.online,https://www.mehamakor.online` |
| Seed runs every boot | `seed()` in lifespan hook | Seeding is idempotent; safe but noisy — remove once live |

---

## 7. Updating the deployment

- **Backend changes:** push to `main`. Railway rebuilds automatically.
- **Frontend changes:** push to `main`. Vercel rebuilds automatically.
- **Env var changes on Vercel:** you **must redeploy** — env vars are baked
  into the build.
- **Env var changes on Railway:** the service auto-restarts within seconds.

---

## 8. What's in this repo that supports the deploy

| File | Purpose |
|---|---|
| `Dockerfile` *(repo root)* | Railway build image; installs deps via uv from lock file; uses `$PORT` at runtime |
| `railway.json` *(repo root)* | Forces Dockerfile builder + healthcheck; discovered automatically by Railway without a Root Directory setting |
| `.dockerignore` *(repo root)* | Prunes `frontend/`, docs, `.env`, and caches from the build context |
| `frontend/vercel.json` | Next.js framework hint + security headers. Imported by Vercel when Root Directory is set to `frontend`. No custom install/build commands — Vercel's defaults handle Next.js. |
| `backend/pyproject.toml` | Direct Python dependencies (replaces requirements.txt); source of truth for dep versions |
| `backend/uv.lock` | Full transitive lock file with hashes — committed so CI and Railway install identical packages |
| `backend/.env.example` | All backend env vars, documented |
| `backend/app/routers/producers.py` | Haversine-in-SQL distance filter (`_haversine_km`) |
| `backend/init_db.sql` | Stock Postgres schema, no PostGIS |
| `frontend/.env.example` | All frontend env vars, documented |
| `frontend/next.config.js` | `/api/*` → `BACKEND_URL` rewrite |
| `frontend/app/sitemap.js` | Uses `NEXT_PUBLIC_SITE_URL` for dynamic sitemap |

---

## 9. Dependency management (uv)

Backend dependencies are managed with **[uv](https://github.com/astral-sh/uv)** — a fast, reproducible Python package manager.

### Key files

| File | Role |
|---|---|
| `backend/pyproject.toml` | Direct deps only (was `requirements.txt`) |
| `backend/uv.lock` | All transitive deps, pinned with SHA-256 hashes — **always commit this** |

### Local workflow

```bash
# Install uv (one-time, macOS/Linux)
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install backend deps (creates backend/.venv automatically)
cd backend
uv sync

# Add a new dep
uv add some-package

# Upgrade a dep
uv lock --upgrade-package some-package

# Run pytest with the project venv
uv run python -m pytest ../tests/test_api.py -v
```

### Why uv

The previous `requirements.txt` had no transitive pins, so CI resolved packages
fresh each run. `slowapi`'s transitive deps resolved to versions incompatible
with `fastapi==0.115.6` in CI, causing an `ImportError` on `PYDANTIC_V2` before
any test ran. `uv.lock` pins every transitive dep with a SHA-256 hash, so CI
installs byte-for-byte what was tested locally — the conflict cannot recur.

### Dockerfile cache

The Dockerfile uses BuildKit cache mounts so the `~/.cache/uv` wheel cache
survives across Railway builds. When only app code changes (not deps), the
`uv sync` layer is a cache hit and the build skips re-downloading packages
entirely.

## 10. MEH-408 Phase 2 — Backup Operations

Daily off-Railway snapshot of the production DB to Cloudflare R2.
Independent failure mode from Railway's managed backups (which die
with the volume if it is deleted — the PocketOS lesson).

The cron is a **separate Railway service** built from `Dockerfile.cron`
in this repo, scheduled via the Railway dashboard. The main API service
is unchanged.

### A. Railway cron service — one-time setup

Create the cron service once after this PR merges to staging.

1. Railway dashboard → existing project → **+ New** → **GitHub Repo** → select `FoodMamkor`.
2. Service name: `cron-backup`.
3. **Settings → Build**:
   - Builder: `Dockerfile`
   - Dockerfile Path: `Dockerfile.cron`
4. **Settings → Service Variables** — add:
   - `DATABASE_URL` → use the **internal** form (`postgresql://…@postgres.railway.internal:5432/…`), NOT the public proxy host. Internal networking is faster and removes the egress cost.
   - `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_ENDPOINT` — copy from production env (already configured during Phase 1 prep).
   - `ENV=production`
5. **Settings → Cron Schedule**: `0 23 * * *` (UTC).
   - That is **02:00 IST in summer (DST)** and **01:00 IST in winter**. The 1-hour seasonal shift is acceptable for v1 — backup runs at a quiet hour either way (see Known Limitations).
6. **Settings → Networking**: leave default. Cron services don't expose ports.
7. Deploy. Watch the first scheduled run in **Deployments → Logs**:
   - Expect: `Backup OK — mehamakor_production_<timestamp>.dump (<bytes> bytes)`.

### B. R2 lifecycle rule — 7-day retention

Configure once in Cloudflare. Independent of the script: backup creation
and retention are deliberately separate failure modes (one breaking does
not break the other).

1. Cloudflare dashboard → **R2** → bucket `mehamakor-backups`.
2. **Settings** → **Object lifecycle rules** → **Add rule**.
3. Action: **Delete objects after a number of days** → `7`.
4. Prefix filter: leave blank (apply to all objects in the bucket).
5. Save.

Cloudflare runs the rule within ~24h of the trigger time; expired objects
disappear without manual intervention.

### C. Manual backup (any time, locally)

Smadar runs this from her own Git Bash on Windows when she wants a
backup outside the cron schedule (e.g., before a risky deploy).

```bash
# Build the cron image once (re-runs only when Dockerfile.cron changes)
docker build -f Dockerfile.cron -t meh-cron-test .

# .env.staging template — fill in real values, NEVER commit this file
# (.env.* is in .gitignore)
cat > .env.staging <<'EOF'
DATABASE_URL=postgresql://postgres:<password>@<public-host>:<port>/<db>
R2_ACCOUNT_ID=<from Cloudflare dashboard>
R2_ACCESS_KEY_ID=<from R2 → Manage R2 API tokens>
R2_SECRET_ACCESS_KEY=<from R2 → Manage R2 API tokens>
R2_BUCKET_NAME=mehamakor-backups
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
ENV=staging
EOF

# Run the backup
docker run --rm --env-file .env.staging meh-cron-test
# Expect: exit 0, log shows "Backup OK — mehamakor_staging_<timestamp>.dump"
```

For a manual backup against the **production** DB from your laptop, swap
the `.env.staging` values for the production public URL + `ENV=production`.
**Never commit either file.** The `--env-file` form keeps secrets out of
your shell history.

### D. Restore procedure (DR drill prep)

`scripts/restore_from_backup.py` downloads from R2 and runs `pg_restore`
against the target DB. The script **refuses** any target URL containing
the substring `production` (case-insensitive) or matching `$DATABASE_URL_PRODUCTION`
when set — production restore is a manual operation, not a script invocation.

```bash
# Set R2 creds in your shell (no DATABASE_URL needed; the target is an arg)
export $(grep -v '^DATABASE_URL=' .env.staging | xargs)

# Make sure pg_restore is on PATH (Windows PostgreSQL 18 install)
export PATH="/c/Program Files/PostgreSQL/18/bin:$PATH"

# Create a clean target DB
createdb mehamakor_dr_test

# Restore the most recent backup
python scripts/restore_from_backup.py --latest postgresql://localhost/mehamakor_dr_test
# Expect: exit 0, row counts table for producers/users/categories/cities

# Or restore a specific file
python scripts/restore_from_backup.py mehamakor_production_20260507T230000Z.dump \
    postgresql://localhost/mehamakor_dr_test
```

Full DR drill checklist (run end-to-end at least once before MEH-408 closes):
[docs/MANUAL_TESTING.md → MEH-408 Phase 4 — DR drill](./MANUAL_TESTING.md).

### E. Known limitations (v1, accepted)

- **No alerting on cron failure.** Detection is manual: weekly check that
  the R2 bucket lists a file dated within the last 24h. Phase 2.5 follow-up:
  Slack webhook or Resend email on non-zero exit.
- **Railway log retention is 7 days on the free tier.** If a backup error
  occurs and is not noticed within a week, the post-mortem trail is gone.
  Phase 2.5 follow-up: stream cron logs to Sentry or to R2 itself.
- **UTC cron + DST shift.** Schedule `0 23 * * *` UTC = 02:00 IST in summer
  and 01:00 IST in winter. Both are quiet hours; not worth implementing
  per-region cron logic for an hour drift.
- **Image size 250 MB (down from 321 MB, MEH-468).** Multi-stage build:
  builder installs PGDG `postgresql-client-18` and is discarded; runtime
  copies only `pg_dump` + `pg_restore` + `libpq.so.5*`, plus Kerberos/LDAP
  auth-support libs (`libgssapi-krb5-2` + `libldap-2.5-0`) from Debian main.
  Build-time `pg_dump --version` smoke test catches missing `.so` at build
  time rather than Railway runtime. 250 MB = `python:3.12-slim-bookworm`
  base (~130 MB) + Kerberos/LDAP stack (~25 MB) + boto3 (~25 MB); the
  MEH-408 <250 MB target is met. Stretch goal of 180–220 MB not reached
  — distroless/alpine base deferred to a future phase.
- **Two `DATABASE_URL` forms.** The Railway-internal host
  (`postgres.railway.internal`) only resolves inside Railway's private
  network — it is the value the cron service uses. The public proxy host
  is the value Smadar uses for local `docker run` tests. Both point at
  the same DB; do not mix them up. MEH-408 Phase 3 introduced the
  `DATABASE_URL_PRODUCTION` / `DATABASE_URL_STAGING` env var names to make
  this distinction explicit; see §2.3 "Migration order" for the transition
  steps.
- **Base image pinned to `python:3.12-slim-bookworm`.** Plain
  `python:3.12-slim` rolled forward to Debian 13 (trixie) on 2026-05-06,
  breaking the PGDG `bookworm-pgdg` apt source (libldap-2.5-0 vs 2.6-0).
  Bookworm support runs through ~2028; revisit when planning the trixie
  jump (also bump the pgdg sources line in the same commit).
