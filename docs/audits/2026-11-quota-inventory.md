# Quota inventory before launch — Mehamakor

As of 2026-11-10 (UTC). Read-only audit. No settings, repo, Linear or GitHub writes were made.
Measured with: Vercel MCP (observability + billing, read-only), Railway MCP (describe / metrics / logs, read-only; `list-variables` NOT called, so no secret values were seen), Sentry MCP (issues / errors / dropped events / alert rules), `gh api` on repo-scoped endpoints, and the code at `origin/staging` `199d49b53`.
Rule used throughout: **"measured"** = a number read from a tool in this session. **"docs"** = a number from the vendor's public pricing/limits page; verify it in the dashboard, because plans change. **"unknown"** = not visible to me.

---

## 0. The three things to know first

1. **Most of the Vercel CPU that got the team suspended was automated traffic against staging, not users.** Over the last 30 days: functions (preview) 4.63M ms + middleware (preview) 3.07M ms = **2.14 CPU-hours on staging/previews**, vs **1.16 CPU-hours on production** (functions 3.30M ms + middleware 0.89M ms). Staging/preview CPU was ~0 until 21/10 and then rose to up to 1,279 s/day (08/11). On 05/11 `staging.mehamakor.online` alone served **125,786 requests**, including ~1,920 full browser page loads (each static JS chunk fetched ~1,923 times) and 3,000+ renders each of `/`, `/about`, `/privacy`, `/map`. Staging sits behind Vercel deployment protection, so these are bypass-header clients (CI / Claude sessions / QA scripts), not the public.
2. **The QueuePool errors happened on staging only (436 stored events, 22/10–27/10), none in production, none since 27/10.** The trigger was parallel E2E runs against the single staging backend (MEH-2398). The code has a real amplifier that will matter at launch: request DB sessions stay open until after FastAPI background tasks (emails / WhatsApp / IndexNow) finish (verified in FastAPI 0.162 source). Details in §2.
3. **Several alert channels are structurally blind or go to an inbox nobody reads.** The new Sentry "20+ in an hour" rule can almost never fire because the backend's own burst cap lets through at most 3 events per fingerprint per 6 h per process. Sentry stores 52,000+ client-side drops that no alert counts. Vercel's warnings went to the account owner's email. Details per service below.

---

## 1. Inventory — one table per service

### 1.1 Vercel (frontend, region fra1)

| Field | Value |
|---|---|
| Plan / limit | **Pro since ~09/11** (measured: billing shows a "Subscription Licenses" line of $0.667/day = $20/month starting 09/11 08:00Z). Was Hobby. Hobby limits (docs, https://vercel.com/docs/plans/hobby): 4 h Fluid Active CPU / month, 100 deployments / day, 1M function invocations, 100 GB fast data transfer. Pro (docs, https://vercel.com/pricing): $20 credit included, then usage-billed; 6,000 deployments/day. Spend Management (https://vercel.com/docs/spend-management) — whether a budget / auto-pause is set: **unknown**. |
| Current usage (measured, 30 d to 10/11) | Active CPU: functions 7.93M ms (2.20 h) + middleware 3.96M ms (1.10 h) = **3.30 CPU-h**, of which **65 % preview/staging**. Production function CPU ~75–160 s/day; staging up to 862 s/day (08/11) plus 417 s middleware. Billing 09/11 08:00 → 10/11 08:00: total effective cost $0.77, of which Fluid Active CPU $0.018 (≈ $0.13 per CPU-hour), Deployment Storage $0.025, Function Storage $0.013. |
| Per-render cost (measured) | Production home `/[locale]`: 430,980 ms CPU / 3,044 invocations (04–08/11) = **~140 ms CPU per render**. HANDOFF 10/11 records that **88 of 89 public pages render on every request** (`app/[locale]/loading.js` → next-intl falls back to `headers()`), so CPU grows linearly with page views. At 10,000 home views/day that is ~0.39 CPU-h/day ≈ 12 CPU-h/month (≈ $1.5/month on Pro — cheap; on Hobby it would have suspended in ~10 days). |
| What the code generates | `uptime.yml:9` `*/10 * * * *` → 144 home renders/day on production (~20 s CPU/day). Sentry uptime monitor `8093256` every 300 s → `mehamakor.co.il/api/producers?limit=1` (an edge rewrite, not a function). `post-deploy-checks.yml:70` runs `link-check.mjs` on **every staging push** (was a crawl of up to 2,000 server renders per push; since #4245 on 10/11 a 40-page sample on staging; `--smoke` mode exists but the workflow change waits in `docs/ci/post-deploy-trim.patch.md`). `deploy.yml:381` contract probe against staging per run. `vercel.json` `ignoreCommand`: feature branches build only with `[preview]` in the commit message. ~1,000 GitHub workflow runs/day (see 1.11). Browser QA scripts in `frontend/e2e/qa-*.mjs` (~230 files, 16 hard-code `staging.mehamakor.online`) and workflow rules 23/38 (CC captures screenshots of staging/previews for every UI PR). |
| Where the alert goes today | Email to the Vercel account owner (75/90/100 % warnings — owner says unread). Nothing reaches Linear, GitHub or Sentry. |
| What breaks first | On Hobby: the whole team is suspended → production **and** staging return "Account is blocked" (happened 09/11 ~22:05Z). On Pro: nothing breaks; cost rises. If a Spend-Management budget with "pause projects" is set, production is paused at the cap — **the same outage, by choice**. Also open now: new deploys blocked because a Git author is not a team member (HANDOFF 10/11). |

### 1.2 Railway (backend FastAPI + Postgres + backup-cron, region us-west2)

| Field | Value |
|---|---|
| Plan / limit | **Hobby** (inferred, measured: every service shows CPU_LIMIT 8 vCPU / MEMORY_LIMIT 8 GB, which is the Hobby per-service ceiling — https://docs.railway.com/reference/pricing/plans; HANDOFF 22/10 also says "builds paused for Hobby"). Hobby = $5/month incl. $5 usage (docs). Usage limit / hard cap: **unknown**. **Production Postgres volume = 500 MB** (measured, `postgres-volume`). |
| Current usage (measured, 7 d) | Backend: avg CPU 0.0018 vCPU, max 0.0034; memory avg 176 MB, max 488 MB. Postgres: memory ~70 MB, **disk 0.12 GB of 0.5 GB (24 %)**. 1 replica each (`multiRegionConfig us-west2 numReplicas 1`). |
| DB connections (code) | `backend/app/database.py:43-46` defaults pool_size 10 + max_overflow 5, timeout 30 s, recycle 1800 s. Production sets `DB_POOL_SIZE / DB_MAX_OVERFLOW / DB_POOL_TIMEOUT / DB_POOL_RECYCLE` (names seen, values not read). `Dockerfile:61` starts **one uvicorn process, no `--workers`**; `startup.py:131-134` logs an error if `WEB_CONCURRENCY`/`UVICORN_WORKERS` is set. **Total possible connections, production:** 1 replica × 1 worker × (10+5) = **15**, doubled to **30** for the minute both containers live during a deploy, + 1 for `alembic upgrade head` at boot, + 1 for `backup-cron`, + staging's weekly read-only restore-verify (`backup-restore-verify.yml:22`) → **≈ 32** vs Postgres `max_connections` — **not measured** (I did not connect to the DB); the image is `postgres-ssl:18`, whose stock default is 100. So Postgres is not the binding limit; the per-process pool of 15 is. |
| What the code generates | In-process APScheduler (`startup.py:495-590`): daily 10:00 UTC follow-ups, 01:30 roll-up, 02:30 purge; every 5 min watchdog if `WATCHDOG_ENABLED` (the variable exists in production) and rescue digest if enabled. All share the same 15-connection pool. |
| Where the alert goes today | Railway usage emails to the workspace owner, if configured (unknown). No Railway → Sentry/Linear route. Railway logs only. |
| What breaks first | (a) Volume full at 500 MB → Postgres stops accepting writes, site down for writes (at today's ~0.12 GB, not near; at launch with analytics tables + `producer_page_views` it grows — watch it). (b) Usage cap, if set → services stop. (c) Pool of 15 → `QueuePool limit … reached` 500s on every endpoint (§2). Also noted: the staging service's latest deployment is in status **NEEDS_APPROVAL** (measured), i.e. staging backend deploys are waiting for someone to approve them. |

### 1.3 Sentry (org `df7d71a2ad7a`, projects `mehamakor-backend`, `javascript-nextjs`)

| Field | Value |
|---|---|
| Plan / limit | Developer (free) per `backend/app/sentry.py:28-35` comment: 5,000 errors/month, no spike protection, no pay-as-you-go. Spans quota on Developer: docs say 5M spans/month (https://sentry.io/pricing — verify). |
| Current usage (measured, 30 d) | **Errors accepted ≈ 1,810** (peak 865 on 27/10). **Errors dropped client-side by `before_send` ≈ 52,200** (36,699 on 22/10, 9,746 on 27/10) — the burst cap working. **Spans accepted ≈ 2.51M** in 30 d, up from ~450/day before 21/10 to 100–285k/day since. Span split (Explore, 14 d, extrapolated counts): backend **staging 19.0M**, frontend production 0.95M, backend production 0.02M → **~95 % of span volume is the staging backend**, i.e. the same automated traffic. |
| What the code generates | Backend `sentry.py:471` traces 0.1; `sentry.py:59-66` burst cap 3 events / fingerprint / 6 h (fingerprint includes the transaction), then 5 % sampling. Frontend `sentry.server.config.js:11`, `sentry.edge.config.js:11`, `instrumentation-client.js:24-26`: traces 0.1, replays on error 1.0, session replays 0. Staging and production share one quota. |
| Where the alert goes today | 5 issue alert rules, all **email** to "issue owners → fallthrough: all active members". Rule `6302509` "same error 20+ times/hour" (06/11) — lastTriggered: never. Rule `3298222` high-priority — last fired 09/11. Uptime monitor `8093256` (production only). **No metric alerts** (`metricRules: []`). No alert on the `moderation_fail_open` tag. |
| What breaks first | At 5k errors: new errors are dropped silently ("Over quota") — happened Aug (MEH-2114). At the spans quota: performance data stops; if staging keeps producing ~150k spans/day (~4.5M/month) the spans quota is at risk **before launch traffic is added**. Blind spot: because of the 3-per-6h cap, rule `6302509` can only fire for one issue when ~7+ processes report it in the same hour — on a single production replica it effectively never fires. |

### 1.4 Cloudinary (images, cloud `dfzpscjks`)

| Field | Value |
|---|---|
| Plan / limit | Free = 25 credits/month (docs, https://cloudinary.com/pricing). Free/Plus/Advanced do not bill overage — they warn, then **disable the account** (CHANGELOG 14/08). Current plan after Sapir's Console decision (MEH-1925): **unknown**. |
| Current usage | Not measurable here (no Cloudinary tool). Last recorded: **126.48 / 25 credits = 506 %** on 14/08, rising ~2/day, driven 1:1 by CI (CHANGELOG line ~2032). #2950 stubbed Cloudinary in all 36 flow specs (773 → 0 hits). `e2e/visual/**` (VRT) and every browser QA script against staging still load real images. |
| What the code generates | `next.config.js:141-146` routes Cloudinary through `next/image` → `/_next/image` → each new size is a Vercel image transformation **and** a Cloudinary origin fetch. Staging browser traffic (§0) loads real images. |
| Where the alert goes | Cloudinary email to the account owner. |
| What breaks first | Account disabled → every product/business image returns 401 (happened 06–07/08). Pages render with broken images; no error page. |

### 1.5 Google Cloud — Places API (address autocomplete + Google rating)

| Field | Value |
|---|---|
| Plan / limit | Pay-as-you-go after the trial; **the trial ended 28/10 and billing went off, which took AddressSearch down** (`routers/health.py:52-56` comment, MEH-2481/2482). Current billing state: **unknown**. Per-SKU free monthly caps and prices (docs, https://developers.google.com/maps/billing-and-pricing/pricing): Place Details with rating/userRatingCount is an Enterprise SKU (~1,000 free/month, then ~$20/1,000 — verify). Quota caps / budget alerts in the Google project: **unknown**. |
| What the code generates | `frontend/lib/places.js:269-271` uses Google autocomplete when a browser key exists, else Nominatim. `routers/google_rating.py:106-136` one live Place Details call per producer-page view that scrolls the rating into view (`GoogleRatingLine.jsx`, lazy, never cached by ToS — "each fetch is one billed Google Enterprise call", MEH-2581). `routers/health.py` `GET /health/places` = one real Autocomplete call per probe; an hourly probe in `uptime.yml` waits in `docs/ci/places-health-probe.patch.md`. |
| Where the alert goes | Google Cloud billing email only if a budget is configured (unknown). `/health/places` returns 503 with Google's status word and reports to Sentry once per 10 min per process (`health.py` `_REPORT_WINDOW_SECONDS = 600`) — but only when something calls it. |
| What breaks first | Billing off / quota hit → autocomplete returns errors (registration and dashboard address fields fall back per MEH-2480 "settlement only = approximate location"); the Google rating line silently disappears (204, fail-quiet). |

### 1.6 Anthropic (moderation, chat, bio generator, risk score)

| Field | Value |
|---|---|
| Plan / limit | Prepaid credit / tier rate limits in the Anthropic Console: **unknown**. Default model `config.py:135` = `claude-opus-4-6` (the most expensive tier) unless `ANTHROPIC_MODEL` is set (not in the production variable list → default applies). |
| What the code generates | Chat: `routers/chat.py:267-268` 10/min and 30/h **per IP**, unauthenticated; slowapi storage is in-memory per process (`rate_limit.py:209`). No global daily cap. Moderation on each review / recipe / experience submit (`max_tokens` 800, `services/*_moderation.py`), risk score on each producer signup (BackgroundTasks), bio generator 130 tokens. |
| Where the alert goes | Anthropic Console email to the org owner. In the app: `services/moderation_fail_open.py` writes one Sentry event tagged `moderation_fail_open` per fail-open — **no alert rule watches that tag**; 0 events in 30 d (measured; that can also mean "never ran"). |
| What breaks first | Credit exhausted / 429 → by design moderation **fails open: reviews publish unchecked** (reviews have no admin gate), chat answers in Hebrew offline mode. Nobody is told unless they open Sentry. |

### 1.7 WhatsApp Cloud API (Meta)

| Field | Value |
|---|---|
| Plan / limit | Messaging limits per business portfolio: new numbers start at 250 business-initiated conversations / 24 h, then 2K/10K/100K (docs, https://developers.facebook.com/docs/whatsapp/messaging-limits). Templates must be approved (e.g. `rescue_codes_digest_v1` not yet). Current tier and quality rating: **unknown**. |
| What the code generates | `services/whatsapp.py:59` 10 s timeout per send; senders: OTP/auth notifications, admin alerts, watchdog (`startup.py:510-525`, every 5 min if enabled), rating dispatcher, rescue digest (every 5 min if enabled). |
| Where the alert goes | Meta Business Manager notifications (owner). App logs per outcome. |
| What breaks first | Tier hit or quality drop → template sends rejected → OTP/notification messages not delivered; `send_template` returns False (logged, no user-facing error). |

### 1.8 Resend (email)

| Field | Value |
|---|---|
| Plan / limit | Free = 100 emails/day, 3,000/month (docs, https://resend.com/pricing). Current plan: **unknown**. |
| What the code generates | `services/email.py:139-238`; boot fails loudly in staging/production without a key (`startup.py` MEH-1164). Senders: verification, password reset, onboarding follow-ups (daily 10:00 UTC), group-buy / rescue / review notifications, many via BackgroundTasks. Resend SDK default HTTP timeout 30 s (`resend/http_client_requests.py:13`), not overridden. |
| Where the alert goes | Resend email to the account owner. In the app: every failed send → Sentry (`email.py` `_report`, burst-capped 3/6 h). |
| What breaks first | At 100/day on Free: sends return 429 → verification and reset emails stop; signups can't verify. A launch-day burst of signups + follow-ups can cross 100/day. |

### 1.9 PostHog (product analytics, EU)

| Field | Value |
|---|---|
| Plan / limit | Free 1M events/month (docs, https://posthog.com/pricing); billing limit setting: unknown. |
| What the code generates | `frontend/lib/analytics.js:13-38`: consent-gated, `autocapture: false`, `capture_pageview: false` → explicit events only. Low volume. |
| Alert / breaks first | Email to owner; over the limit events are dropped (no user impact). Low risk. |

### 1.10 Microsoft Clarity

Free, no published quota (https://clarity.microsoft.com). `components/ClarityScript.jsx`. At high traffic Clarity samples sessions. No user impact. Low risk.

### 1.11 GitHub Actions (private repo — measured `private: true`)

| Field | Value |
|---|---|
| Plan / limit | GitHub Free: 2,000 min/month + 500 MB storage; Pro: 3,000 min (docs, https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions). Each job is billed rounded **up** to a whole minute. Owner's plan and spending limit: **unknown** (billing endpoints are blocked from this session). |
| Current usage (measured, run counts) | Workflow runs created: 05/11 = 606, 07/11 = 973, 08/11 = 1,097, 09/11 = 380. |
| What the code generates | `uptime.yml:9` every 10 min = 144 runs/day = **~4,320 billed job-minutes/month from this one workflow** (1 job, ≥1 min each) — more than the whole Free allowance. `stale.yml:13` daily, `dependency-audit.yml:27` weekly, `pr-reconcile.yml:10` weekly, `backup-restore-verify.yml:22` weekly; plus pr-checks / deploy / e2e / post-deploy per PR and per staging push (~30 self-merges/day). Savings plan already written: `docs/ci/meh-2212-actions-cost.patch.md`. |
| Where the alert goes | GitHub billing email at 75/90/100 % to the account owner. |
| What breaks first | With a $0 spending limit: all jobs fail in < 2 s with no logs (workflow rule 21) → **no CI, no deploy gate, no uptime probe** — and the uptime probe is the thing that would have told you. |

### 1.12 Uptime monitoring (two probes)

| Probe | Target / cadence | Alert route | Gap |
|---|---|---|---|
| `uptime.yml` (GitHub Actions) | `mehamakor.co.il/` + `/api/health/readiness`, every 10 min (`uptime.yml:9,26-27`) | Opens/updates a GitHub issue labelled `uptime` (GitHub notification email) | Dies with Actions minutes; costs a Vercel SSR render per tick |
| Sentry uptime `8093256` | `mehamakor.co.il/api/producers?limit=1`, every 300 s, production only | Sentry issue → high-priority email rule | No staging probe; does not cover Vercel suspension explicitly (it would see the 402/blocked page as failure — good) |

### 1.13 Smaller dependencies

| Service | Limit (source) | Code | Breaks first |
|---|---|---|---|
| OpenStreetMap tiles | Tile usage policy: no heavy use, no SLA, can block (https://operations.osmfoundation.org/policies/tiles/) | `components/MapComponent.jsx:637` loads `{s}.tile.openstreetmap.org` directly from every visitor | `/map` (the main screen) goes grey if OSM throttles or blocks the referrer |
| Nominatim (fallback geocoder) | 1 req/s, **autocomplete use not allowed** (https://operations.osmfoundation.org/policies/nominatim/) | `frontend/lib/places.js:138-160,271` — used as autocomplete when no Google key | Blocked → address search dead. Only active when the Google key is absent (as on 28/10) |
| IndexNow / Bing | No published quota; fair use | `services/indexnow.py:39,109` 5 s timeout, BackgroundTasks on publish | Ignored submissions; no user impact |
| HIBP Pwned Passwords | Range API is free, no key | `services/password_policy.py:57-63`, 2 s timeout, fail-open | Fail-open; no impact |
| Cloudflare R2 (DB backups) | Free 10 GB storage (https://developers.cloudflare.com/r2/pricing/) | `Dockerfile.cron`, `scripts/backup_production_db.py` | DB is 0.12 GB — not near |
| Apple / Google sign-in JWKS | No practical quota | `services/oauth_verifiers.py:115,145` | — |
| Web Push (VAPID) | Free | `config.py:150-157` | — |
| data.gov.il | Public | `routers/admin.py:1790` (admin import, 30 s timeout) | Admin-only |

---

## 2. QueuePool errors

### 2.1 What was found (measured)

- **Sentry:** 18 issues titled `TimeoutError: QueuePool limit of size 10 overflow 5 reached, connection timed out, timeout 30.00`, all `mehamakor-backend`, all **unresolved**, **436 stored events** total.
  - Per day: 22/10 = 62, 26/10 = 44, 27/10 = 330, every other day in 30 d = 0.
  - **Environment: 100 % `staging`.** Production: 0.
  - First seen 2026-10-22 10:48:13Z, last seen 2026-10-27 16:31:28Z. None since.
  - Spread over **12 different containers** (`server_name`), each burst lasting 2–25 minutes: 22/10 10:48–15:20; 26/10 21:55, 22:39–23:04; 27/10 03:36–03:39, 08:47–08:49, 14:46–15:01, 15:17–15:18, 15:40–15:46, 15:51–15:54, 15:59–16:01, 16:23–16:31.
  - Top issues by count: `MEHAMAKOR-BACKEND-19` 56 (`/admin/outreach/{lead_id}`), `-15` 48 (`app.database in _do_get`, the `db_pool_exhausted` log line), `-18` 44 (`/producers/{producer_id}`), `-1C` 33 (`/events/upcoming`), `-1B` 33 (`/producers`), `-1A` 30 (`/categories`), `-1D` 28 (`/holiday-mode`), `-1E` 25 (`/stats`), `-17` 24, `-13` 24 (`/auth/register`), and 8 smaller ones (`/events`, `/producers/{id}/view`, `/reviews`, `/group-buys`, `/cities`, `/google-rating`, `/auth/refresh`, `/register/producer/prefill/{token}`).
  - By transaction: `/experiences/count` 32, `/producers` 31, `/producers/by-slug/{slug}` 30, `/events/upcoming` 30, `/categories` 30, `/holiday-mode` 28, `/stats` 25, `/auth/me` 21, …
  - **The true count is much higher than 436.** `before_send` dropped 36,699 errors on 22/10 and 9,746 on 27/10 (burst cap, `sentry.py:59-66`); most of those days' drops are this burst. So "436" is a floor.
- **Railway production logs** (filter `db_pool_exhausted`, since 01/10): **0 lines**. The only pool lines are routine `exceeded timeout; recycling` (`pool_recycle=1800`).
- **Railway staging logs:** returned nothing for the window (current staging deployment is NEEDS_APPROVAL; older deployment logs not returned).
- **Prior incident:** SEN-001, ~500 events, June, implicit 5+10 pool (`docs/audits/2026-06-hotspot-sentry.md:70`) → MEH-770 / PR #1008 added the explicit pool and the `_ObservableQueuePool` log line.

### 2.2 Root cause

1. **Trigger (load, staging):** parallel E2E runs hitting one staging backend. CHANGELOG (26/10 entry, MEH-2398): "staging backend collapses under parallel E2E runs: QueuePool (10+5) fills, PRs get 499 and ZERO COVERAGE; measured in Railway 26/10 22:50Z; fix: `concurrency` in `e2e.yml`." `e2e.yml:102-105` and `:541-544` now queue the chromium and webkit jobs (`e2e-staging-backend`, `queue: max`, PR #3738 on 28/10) — **the errors stop on 27/10, consistent with that fix.** Note the two groups are separate, so a chromium run and a webkit run can still overlap, each with `workers: 2` (`playwright.config.ts:36-38`, `fullyParallel: true`).
2. **Why the pool, not Postgres, is the wall:** one uvicorn process (`Dockerfile:61`), 428 of 439 route handlers are plain `def` (measured by grep), so they run in AnyIO's thread pool (default 40 threads). Up to 40 concurrent requests compete for **15** connections; a request that cannot get one waits `pool_timeout=30 s` and then 500s. The victims are whatever is waiting — the cheap public reads every page calls (`/experiences/count` from `lib/use-experiences-nav-gate.js:93`, `/holiday-mode`, `/categories`, `/auth/me`) — which is why the errors are spread across 18 endpoints and do not point at the culprit.
3. **Amplifier in code — sessions held through background tasks (verified, not guessed).** In FastAPI 0.162, a default-scope `yield` dependency (`get_db`, `database.py:114-119`) is closed after `await response(...)` (`fastapi/routing.py:148-155`), and Starlette runs background tasks inside `Response.__call__` (`starlette/responses.py:169-170`). So **`db.close()` runs only after every BackgroundTask of that request finishes.** If the session holds a connection at that point, the connection stays checked out through the external call. Example: `routers/auth.py:326-331` — `db.commit()`, then `db.refresh(user)` (opens a new transaction → connection checked out), then `background_tasks.add_task(...)` for emails. The email goes through Resend with a 30 s SDK default timeout. 15 slow sends at the same time = pool exhausted for the whole site. The same shape applies to the other BackgroundTasks routes (`routers/rescue.py`, `reviews.py`, `producers.py`, `producer_claim.py`, `marketing.py`, IndexNow 5 s, WhatsApp 10 s). Which of them have a connection checked out at the end needs a per-route check.
4. **Amplifier — connection held during a synchronous external HTTP call:** `routers/google_rating.py:118-131` runs a query (transaction open, connection checked out) and then `httpx.get` to Google with a 4 s timeout while still holding it.
5. **Minor:** `routers/auth.py:261,409` (`register`, `register_producer`) are `async def` but run synchronous DB queries on the event loop, which stalls every other request for the duration of each query. Short indexed lookups, so small — but it is in the signup path.
6. Not the cause: `routers/holiday_mode.py:27-44` uses `SessionLocal()` directly but closes it in `finally` (no leak). APScheduler jobs open their own sessions and close them (`startup.py:267-417`).

### 2.3 Capacity math (production)

`replicas (1) × uvicorn workers (1) × (pool_size 10 + max_overflow 5) = 15` connections (code defaults; production overrides exist, values not read). Deploy overlap → 30. Plus alembic 1, backup-cron 1 → **≈ 32 peak vs Postgres max_connections ≈ 100 (stock default, not measured)**. Headroom exists on the Postgres side; raising the pool to e.g. 20+10 is safe from a Postgres point of view, but the better fix is to stop holding connections (2.2 items 3–4).

---

## 3. Top 5 risks before launch (proposals only — nothing applied)

### 1. Vercel spend / pause on real traffic, while staging QA still burns the same budget — HIGH
**Why:** 88/89 public pages render on every request (~140 ms CPU each), and 65 % of CPU is automated staging traffic (125k staging requests on a single day). On Pro this is money, not an outage — **unless** a Spend-Management budget with auto-pause is set, in which case production pauses exactly like the suspension.
**Proposed fix:** (a) In Vercel → Settings → Billing → Spend Management: set a budget with **notifications on, auto-pause OFF for production** (or a high cap), and add a second recipient (a shared inbox or a Slack/email-to-Linear address) for the 50/75/100 % alerts. (b) Apply `docs/ci/post-deploy-trim.patch.md` (`link-check --smoke` ≤ 10 URLs per staging push). (c) Point browser QA/screenshot scripts at a local `next start` (as E2E already does) instead of `staging.mehamakor.online`; keep staging for the few checks that need the real edge. (d) MEH-2864 Phase 0: fix `app/[locale]/loading.js` so 31 route families become ISR (measured in HANDOFF) — the single biggest lever on production CPU. (e) Add a weekly Vercel usage read (the observability query used here) to the queue.

### 2. Alerts that cannot fire or reach nobody — HIGH
**Why:** Sentry rule `6302509` is structurally blind on one replica (3 events / fingerprint / 6 h cap); no alert on `moderation_fail_open`; no metric alerts; all routes are email; Vercel/Railway/Cloudinary/Resend/GitHub/Google billing warnings go to one owner inbox. Three quota incidents this year all followed this pattern.
**Proposed fix:** (a) Replace the "20+ per hour" rule with one that works under the cap: "new issue OR regression in production" + a **metric alert on `count()` of `db_pool_exhausted` / `QueuePool` ≥ 1 in 5 min** and on `moderation_fail_open` ≥ 1 in 1 h. (b) Route Sentry alerts to a second channel (Sentry → Linear integration, or email to a monitored alias). (c) One "quota contacts" alias added as billing/notification contact in Vercel, Railway, Cloudinary, Resend, Google Cloud (with a **budget alert**), Anthropic, GitHub. (d) Add a staging-excluding filter to production alerts so staging noise doesn't drown them.

### 3. DB pool exhaustion under launch load (QueuePool) — MEDIUM-HIGH
**Why:** 15 connections per process, sessions held through background emails (30 s Resend timeout) and through the Google call; seen twice (June, October) under bursts.
**Proposed fix:** (a) Close/return the connection before background tasks: call `db.close()` (or end the transaction) before returning in routes that `add_task`, or switch those routes to `Depends(get_db, scope="function")` (FastAPI 0.162 supports `scope`; a function-scoped yield dependency is torn down when the handler returns, before the response and its background tasks — `fastapi/routing.py:150-153`) — needs a test that shows a connection is no longer checked out during a slow background task. (b) In `google_rating.py`, read `place_id`, then `db.close()`/commit before `httpx.get`. (c) Set an explicit Resend timeout (e.g. 10 s). (d) Pool sizing: with Postgres at ~100 connections, `DB_POOL_SIZE=15`, `DB_MAX_OVERFLOW=10`, `DB_POOL_TIMEOUT=10` is safe for 1 replica (2× during deploy = 50) — Sapir's Railway variables; confirm `SHOW max_connections` first. (e) Put the chromium and webkit E2E jobs in one concurrency group, or point E2E at a disposable backend, so staging never repeats MEH-2398.

### 4. Sentry span quota consumed by staging — MEDIUM
**Why:** ~2.5M spans in 30 d, ~95 % from the staging backend; at ~150k/day this approaches the Developer spans quota before any real users, and staging and production share it.
**Proposed fix:** set backend `traces_sample_rate` per environment (e.g. 0.0–0.01 on staging, 0.1 on production) or a `traces_sampler` that drops staging and health/count endpoints; same for the frontend server/edge configs. Check Sentry → Stats → Spans for the exact quota on this plan.

### 5. Free-tier ceilings that hit on launch day — MEDIUM
**Why:** each of these fails silently or degrades a core flow, and their current plan is unknown:
- **Resend Free 100/day** → verification/reset emails stop on a signup burst.
- **Cloudinary Free 25 credits** (was at 506 %) → account disabled → all images 401.
- **Google Places billing** (off since 28/10 unless re-enabled) → autocomplete down.
- **GitHub Actions** (private repo, ~1,000 runs/day; `uptime.yml` alone ≈ 4,320 billed min/month) → CI and the uptime probe stop together.
- **Railway Postgres volume 500 MB** (24 % used) and Hobby usage cap.
- **Anthropic credit** → reviews publish unmoderated (fail-open).
**Proposed fix:** one checklist pass in each console before launch: confirm plan, raise or remove the free cap where the product depends on it (Resend paid tier, Cloudinary paid or `next/image` `unoptimized` for Cloudinary URLs to stop double transformation, Google Cloud billing + budget alert + per-API quota cap, Anthropic auto-reload + spend limit, Railway volume resize, GitHub spending limit > $0 or move the 10-minute uptime probe to Sentry/an external monitor), and add a hard global daily cap on Anthropic chat calls in code (per-IP limits are in-memory and per process).

---

## 4. What I could not see (state as unverified)

- Vercel Spend-Management settings, Railway usage cap, Postgres `max_connections`, production `DB_POOL_*` values (deliberately not read), Cloudinary / Resend / Anthropic / Google / Meta / PostHog / GitHub plan and current usage, and who receives each vendor's emails.
- The source of the automated staging traffic: Vercel observability has no user-agent dimension. The evidence (protected host, ~1,920 full browser sessions/day hitting the same 5–7 pages, a start on 21–24/10, the same days as the MEH-2302 "CC owns UI QA" amendment (22/10), plus post-deploy crawls per staging push) points at CI + agent QA. The exact split is not established.
- Railway staging logs for the October bursts (not returned by the log API for older deployments).
