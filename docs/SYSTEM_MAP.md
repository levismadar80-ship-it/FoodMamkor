# System map

**Last reviewed:** 2026-11-20 · **Owner:** whoever adds a component, a store or an external service ([.claude/rules/system-map.md](../.claude/rules/system-map.md))

One page: what runs, what talks to what, where each kind of data lives, and
what gives first under load. The repo layout is in
[ARCHITECTURE.md](./ARCHITECTURE.md), the statuses in
[STATE_MACHINES.md](./STATE_MACHINES.md), the limits and their measured usage
in [audits/2026-11-quota-inventory.md](./audits/2026-11-quota-inventory.md).
This page links to those and does not repeat their numbers.

## Components

```
 browser ──────────────▶ Vercel (Next.js 16, region fra1)
   │  HTML, JS             │  server components fetch the API directly
   │                       │  /api/* is rewritten to the backend
   │  images               ▼
   ├──────────▶ Cloudinary        Railway (FastAPI, one process, us-west2)
   │  map tiles                    │            │
   ├──────────▶ OpenStreetMap      │            ├─▶ Anthropic   (moderation, chat, menus, groups, product text)
   │  sign-in                      ▼            ├─▶ Resend      (email)
   └──────────▶ Google / Apple   Postgres       ├─▶ WhatsApp Cloud API (Meta)
                                 (Railway)      ├─▶ Cloudinary  (signed upload, delete)
                                                └─▶ Google Places (rating, owner's profile tool)
                    WhatsApp ──webhook──▶ backend (delivery receipts, opt-out)
```

| Component | What it is | Where |
|---|---|---|
| Frontend | Next.js App Router, JavaScript. Server-renders public pages, proxies `/api/*`. | Vercel · `frontend/` |
| Backend | FastAPI. One process holds the API, the rate limiter's counters and the scheduler. | Railway · `backend/app/` |
| Database | PostgreSQL. Schema changes only through Alembic. | Railway · `backend/alembic/versions/` |
| Outbox worker (MEH-3535) | `python -u -m app.worker`, a second Railway service from the same image (`railway.worker.json`). Every 30 s it sends the due rows of `email_outbox`, and every 2 minutes runs the on-site order tick. Owns them only once the web service has `OUTBOX_EXTERNAL_WORKER=true`; until then the web scheduler runs both (one minute / two minutes). Two dispatchers at once are safe: rows are taken with `SKIP LOCKED`. Watched by the web's overdue-job check (MEH-3332), which adds the worker's two slugs once the flag is true, so a dead worker emails the admin. | Railway · `backend/app/worker.py` |
| Scheduler | APScheduler threads inside the backend process (the outbox ticks only while `OUTBOX_EXTERNAL_WORKER` is false): onboarding follow-ups, admin reminder, analytics roll-up, retention purge, weekly summary, the daily group-buy pickup reminder (17:00 Israel, MEH-3610), monthly page-freshness email, the monthly billing-start signal (1st of the month, email to the admin, MEH-3413) the Sunday stale-pages admin digest and the Sunday signup fill-rate check (a Sentry warning, MEH-3699), watchdog and rescue digest when enabled, and (production only) a 30-minute check that emails the admin when one of those jobs has no recent success (MEH-3332 — last success in `admin_settings` `job_ok:<slug>`; Sentry's $0 plan monitors only the watchdog). On staging only, a weekly wipe + re-seed of the database (Saturday 23:00 UTC, `services/staging_reset_job.py` → `backend/scripts/reset_staging.py`, MEH-3630). Every job with its exact schedule: [JOBS.md](./JOBS.md), generated from the code. | `backend/app/startup.py` |
| CI | GitHub Actions: the two required gates, E2E, uptime probe (site, API, the Google Places key and — once docs/ci/ai-health-probe.patch.md is applied — the Anthropic client via `/api/health/ai`, every 30 minutes), backup-restore check, weekly placeholder-search check (opens an issue when a search placeholder returns nothing). Two modes per run (MEH-3453): public repo → GitHub-hosted `ubuntu-latest`; private repo or repo variable `CI_MODE=private` → one `self-hosted` runner on Sapir's PC, with E2E only on `run-e2e` PRs + nightly and 1 test shard. | `.github/workflows/` |

## What talks to what

| From | To | For | If it fails |
|---|---|---|---|
| Browser | Vercel | pages, `/api/*` | — |
| Vercel (server components) | Backend | page data (`lib/server-fetch.js`) | 404 only for "not found"; anything else is a 5xx page, never a de-indexing 404 |
| Browser | Cloudinary | images, through `next/image` | broken images, page still renders |
| Browser | OpenStreetMap | map tiles (needs a Referer) | grey map |
| Browser | Google Identity / Apple | sign-in tokens | password login still works |
| Browser | Google Places or Nominatim | address autocomplete (`lib/places.js`) | falls back to settlement only |
| Browser | PostHog, Clarity, Sentry | analytics and errors, after consent | nothing visible |
| Backend | Postgres | everything; the app may log in as `app_runtime` (rows only) while the boot migration step uses the schema owner (`MIGRATION_DATABASE_URL`, MEH-3307, DEPLOYMENT.md §1.3) | 5xx |
| Backend | Anthropic | moderation of reviews, recipes, workshops, owner replies; chat (with one business's public page facts, named in the question or the page it was opened from, MEH-3481 / MEH-3489; MEH-3510 adds its public events, workshops, open group buys and reviews); reading an uploaded menu into product rows (MEH-3430); suggesting product groups from product names (MEH-3478); suggesting a product description (MEH-3479) or a reply to a review (MEH-3480); drafting the page fields from the owner's text (MEH-3483) | **fails open**: content publishes unchecked, chat answers offline; a menu read, a group suggestion, a description / reply suggestion or a page draft answers 503 and the owner does it by hand |
| Outbox worker (or the web scheduler, until it takes over) | Postgres + Resend + WhatsApp | the queued emails (`email_outbox`) and the order messages (`product_order_notifications`), MEH-3535 | a Resend error is retried 4 more times over ~30 minutes and ends that batch; a dispatcher without the Resend key leaves the rows untouched (the worker refuses to start without it); a worker that is down leaves rows pending, sent when it is back (dropped as `stale` after 2 days) |
| Backend | Resend | every email, including the monthly page-freshness email (`services/page_freshness.py`) and its Sunday admin digest (`services/page_freshness_digest.py`), off until `PAGE_FRESHNESS_ENABLED`) | verification and reset emails stop |
| Backend | WhatsApp Cloud API | codes, alerts, digests | message not delivered, logged |
| Backend | Cloudinary | upload signature, deletes | upload fails with a message |
| Backend | Google Places | a business's Google rating | the rating line disappears |
| Backend | Google Places | the owner's «הפרופיל שלכם בגוגל» tool (MEH-3641): search, link check, live comparison; only the place_id is stored; 10/hour per route | the tool says «לא זמין» (503); nothing else depends on it |
| Meta | Backend | WhatsApp webhook (HMAC-checked) | delivery status stays "accepted" |
| Grafana Cloud k6, or a GitHub runner (`.github/workflows/load-test.yml`, manual only, MEH-3564) | Staging backend | k6 load test (`scripts/load-test.js`); results kept in Grafana Cloud when `K6_CLOUD_TOKEN` is set | the run goes red; nothing else depends on it. Refuses any URL but the staging backend |
| Scheduled Claude Code task «בדיקת בריאות שבועית לריפו» (Thursday 09:00 Israel, MEH-3615) | GitHub (read the repo) · Linear (cards) · Sapir (one Hebrew report) | runs `scripts/health/weekly-repo-health.sh`: orphan folders, due `Re-check:` dates, Python dead code, knip totals, expiry dates; one card per new finding | no report that week; nothing in the product depends on it |
| GitHub Actions (`.github/workflows/staging-health.yml`) | GitHub commit statuses | `Staging health` on every open PR into staging, rule 41 (`scripts/ci/staging_health.py`) | posts failure («could not read staging runs»); a PR labeled `fixes-staging-red` gets green |

## Where each kind of data lives

| Data | Lives in | Notes |
|---|---|---|
| Accounts, businesses, products, events, workshops, sign-ups, reviews, bags, group buys, billing ledger | Postgres | the only system of record |
| Passwords | Postgres, bcrypt hash | never logged |
| A business's delivery zones (MEH-3484) | Postgres, `producers.delivery_zones` (the zone) + `delivery_areas.zone_name` (which cities) | each zone's days, minimum, fee and free-delivery threshold are copied onto its cities' `delivery_areas` rows by `services/delivery_zones.py`, the one writer, so every reader of a city row is unchanged |
| Admin audit log (who changed what, when, from which IP) | Postgres, `admin_audit_log` | append-only: one INSERT per successful change by an admin account, scheduled in `auth.get_current_user` and written by `services/admin_audit.py`; no update or delete in the code. Reduced before/after only, no names or contact details (MEH-3306) |
| An admin's passkeys and recovery codes (MEH-3305) | Postgres, `admin_passkeys` + `admin_recovery_codes` | public keys only (the private key never leaves her device); recovery codes as hashes, shown once; both go with the account |
| Access token (15 minutes) | browser `localStorage` | sent as a Bearer header |
| Refresh token (14 days) | httpOnly cookie | rotated by `/auth/refresh` |
| An unpublished draft page | Postgres; readable by anyone who holds its signed preview link (`/draft-preview/<token>`, 14 days, MEH-3377) | read-only; the link dies when the draft is published, claimed or deleted; the browser scrubs the token from analytics and error events (`lib/claim-token.js`) |
| An email the site owes (business approved / rejected / changes requested, event and workshop sign-up confirmations, MEH-3535) | Postgres, `email_outbox` | written in the same transaction as its cause (the approval email through `_persist_approval(before_commit=…)`, re-queued on its slug retry); address and words cleared the moment the row is sent, skipped or failed; the bare row deleted after 30 days by the retention purge |
| Last successful run of each background job, and the day its overdue email went out | Postgres, `admin_settings` keys `job_ok:<slug>` / `job_stale_alerted:<slug>` | written by `@heartbeat` and `services/job_staleness.py`, production only (MEH-3332); bounded by the number of jobs |
| Images | Cloudinary | Postgres holds the URL only |
| Screenshot of a business's written consent (MEH-3377, optional) | Cloudinary; URL in `producers.consent_screenshot_url` | shown to admins only; the image is reachable by anyone who holds its unguessable URL |
| Spent passkey sign-in tickets (MEH-3305) | backend process memory | a ticket is single-use for its 5 minutes; a restart forgets the set, so a ticket issued just before a deploy could be used once more within those minutes. The ticket itself, while the login page waits for a recovery code, lives in React state only (no browser storage) |
| Rate-limit counters | backend process memory | reset on every deploy, not shared between processes |
| Scheduler state | backend process memory | a job that was due during a restart does not run late |
| Secrets | Railway and Vercel environment variables | none in the repo ([SECURITY.md](./SECURITY.md)) |
| Product analytics | PostHog (EU), Clarity | consent-gated, no account data. Sign-in funnel events since MEH-3661: `login_prompt_shown`, `login_prompt_action`, `consumer_signup_submitted` (reason / method only) |
| Errors and traces | Sentry | the backend strips tokens from event URLs before sending (`backend/app/sentry.py`). Also the Sunday signup fill-rate warning (`services/signup_fill_digest.py`, MEH-3699): a `warning` tagged `signup_fill_zero` only when a share is 0%, read by Claude's daily morning round instead of an email to the admin |
| Email and WhatsApp content | Resend, Meta | Postgres keeps a send ledger (`outbound_messages`), not the bodies of emails; outside production only, a WhatsApp send the guard dropped is kept with its content (`blocked_nonprod`, /admin/whatsapp/blocked) |
| Backups | Railway volume + the backup job (each run reports to Sentry: a Crons check-in to `production-db-backup`, and an error event on failure, MEH-3533) | restore is checked by `backup-restore-verify.yml` ([BACKUPS.md](./BACKUPS.md)); a copy restored anywhere but production has its personal details replaced by `scripts/anonymize_restored_db.sql` (MEH-3406) |
| Draft of a registration form, recent searches, chosen city | browser storage | never on the server |
| Answers to client-side reads made through `frontend/lib/use-api.js` (MEH-3536; SWR) | browser tab memory | one cache per tab, gone on reload; reads that depend on the signed-in account (`useUserApi`) are keyed by the user id, so the next account in the same tab never reads the previous one's entries. A logout does not empty it: the previous account's entries stay in memory, unread, until the tab reloads |
| Which «הקישור שלך בכל מקום» rows the owner ticked (MEH-3331) | browser `localStorage`, `mehamakor.link-everywhere.<producer id>` | a per-device reminder; never on the server, lost with the browser's storage |
| The page a customer signed up from by email (MEH-3661) | browser `localStorage`, `post_auth_return`: an internal path and when it was stored | 24 hours (the verify link's own life); read by /verify-email to send her back, then cleared; only paths `isReturnablePath` allows (no auth screens, no token flows) |
| Whether the account menus show «ההזמנות שלי» (MEH-3525) | browser `sessionStorage`, `meh_my_orders_nav`: the account id, on/off, and when it was asked | 30 minutes, cleared with the tab; a cached answer for another account id is ignored |
| A finished order's lines on their way back to the cart, «להזמין שוב» (MEH-3764) | browser `sessionStorage`, `meh_order_again`: the business id, each line's product (and variant) id, quantity and name, and when it was stored | read once by that business's page and removed on read; ignored after 30 minutes or for another business; cleared with the tab |

## What gives first under load

In the order it is likely to happen. Sources and measurements are in the quota
inventory.

1. **Resend's daily cap.** On the free plan, 100 emails a day. A launch-day
   burst of sign-ups plus the daily follow-ups crosses it, and then
   verification and password-reset emails stop.
2. **Database connections.** The pool is 10 + 5 overflow per process. Slow
   requests that hold a connection (an external call inside a route) exhaust
   it; the DB bulkhead middleware sheds load with a 503 before the process
   deadlocks. A new external call inside a route closes its DB session first.
   The public chat reads one business before its model calls and rolls the
   session back right after (MEH-3481), so a chat holds no connection while
   Claude answers.
   A request body above 6 MB is refused with 413 before it reaches the
   bulkhead (`backend/app/body_limit.py`), so it never holds a slot.
3. **Per-IP rate limits behind one address.** Limits are per IP and held in
   memory. Many real users behind one NAT, or the whole CI run, share one
   bucket and get 429s on ordinary reads.
4. **Server-rendered pages on Vercel.** Almost every public page renders on
   each request, about 140 ms of CPU each. Traffic raises cost linearly; there
   is no cache to absorb a spike. The exceptions are ISR pages such as `/` and
   the `/events` + `/experiences` hub (MEH-2233): the server reads the first
   `/events` and `/experiences` lists at most once a minute per locale, and
   every visit in between gets the cached HTML. `/group-buys` does the same
   with its open list and the counts (MEH-2233). Each visit still makes one
   quiet client refresh after the page paints, so the backend load per visit
   is unchanged; only the first paint stops waiting for it.
   `/map` is prerendered per locale since MEH-3628 and regenerated hourly
   (its sr-only index reads `/producers`; the pins load in the browser). A
   failed regeneration keeps the last good page.
5. **Anthropic credit or rate limit.** Moderation fails open and chat goes
   offline. Nobody is told unless they look at Sentry.
6. **Sentry's monthly error quota.** Past it, new errors are dropped silently,
   which is when they are needed.
7. **Cloudinary credits.** Past the plan's allowance the account is disabled
   and every image returns 401.
8. **One backend process.** The scheduler, the rate limiter and the API share
   it. A second replica would double every scheduled email and split the rate
   limits; scaling out needs both moved out of process first. The two outbox
   ticks are the first to move (MEH-3535, the outbox worker); the daily jobs
   and the rate limiter have not.
9. **The Postgres volume.** 0.5 GB. Far from full today; the analytics tables
   are what grow.
10. **CI in private mode.** With the repo private (or `CI_MODE=private`), every
    job queues on one self-hosted runner on Sapir's PC (MEH-3453). With the PC
    off nothing runs, and the two required gates stay pending.
