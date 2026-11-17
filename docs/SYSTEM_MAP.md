# System map

**Last reviewed:** 2026-11-17 · **Owner:** whoever adds a component, a store or an external service ([.claude/rules/system-map.md](../.claude/rules/system-map.md))

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
   ├──────────▶ OpenStreetMap      │            ├─▶ Anthropic   (moderation, chat)
   │  sign-in                      ▼            ├─▶ Resend      (email)
   └──────────▶ Google / Apple   Postgres       ├─▶ WhatsApp Cloud API (Meta)
                                 (Railway)      ├─▶ Cloudinary  (signed upload, delete)
                                                └─▶ Google Places (rating)
                    WhatsApp ──webhook──▶ backend (delivery receipts, opt-out)
```

| Component | What it is | Where |
|---|---|---|
| Frontend | Next.js App Router, JavaScript. Server-renders public pages, proxies `/api/*`. | Vercel · `frontend/` |
| Backend | FastAPI. One process holds the API, the rate limiter's counters and the scheduler. | Railway · `backend/app/` |
| Database | PostgreSQL. Schema changes only through Alembic. | Railway · `backend/alembic/versions/` |
| Scheduler | APScheduler threads inside the backend process: onboarding follow-ups, admin reminder, analytics roll-up, retention purge, weekly summary, watchdog and rescue digest when enabled. | `backend/app/startup.py` |
| CI | GitHub Actions: the two required gates, E2E, uptime probe, backup-restore check. | `.github/workflows/` |

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
| Backend | Postgres | everything | 5xx |
| Backend | Anthropic | moderation of reviews, recipes, workshops, owner replies; chat | **fails open**: content publishes unchecked, chat answers offline |
| Backend | Resend | every email | verification and reset emails stop |
| Backend | WhatsApp Cloud API | codes, alerts, digests | message not delivered, logged |
| Backend | Cloudinary | upload signature, deletes | upload fails with a message |
| Backend | Google Places | a business's Google rating | the rating line disappears |
| Meta | Backend | WhatsApp webhook (HMAC-checked) | delivery status stays "accepted" |

## Where each kind of data lives

| Data | Lives in | Notes |
|---|---|---|
| Accounts, businesses, products, events, workshops, sign-ups, reviews, bags, group buys, billing ledger | Postgres | the only system of record |
| Passwords | Postgres, bcrypt hash | never logged |
| Admin audit log (who changed what, when, from which IP) | Postgres, `admin_audit_log` | append-only: one INSERT per successful admin change, written by `services/admin_audit.py`; no update or delete in the code. Reduced before/after only, no names or contact details (MEH-3306) |
| Access token (15 minutes) | browser `localStorage` | sent as a Bearer header |
| Refresh token (14 days) | httpOnly cookie | rotated by `/auth/refresh` |
| Images | Cloudinary | Postgres holds the URL only |
| Rate-limit counters | backend process memory | reset on every deploy, not shared between processes |
| Scheduler state | backend process memory | a job that was due during a restart does not run late |
| Secrets | Railway and Vercel environment variables | none in the repo ([SECURITY.md](./SECURITY.md)) |
| Product analytics | PostHog (EU), Clarity | consent-gated, no account data |
| Errors and traces | Sentry | the backend strips tokens from event URLs before sending (`backend/app/sentry.py`) |
| Email and WhatsApp content | Resend, Meta | Postgres keeps a send ledger (`outbound_messages`), not the bodies of emails |
| Backups | Railway volume + the backup job | restore is checked by `backup-restore-verify.yml` ([BACKUPS.md](./BACKUPS.md)) |
| Draft of a registration form, recent searches, chosen city | browser storage | never on the server |

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
   A request body above 6 MB is refused with 413 before it reaches the
   bulkhead (`backend/app/body_limit.py`), so it never holds a slot.
3. **Per-IP rate limits behind one address.** Limits are per IP and held in
   memory. Many real users behind one NAT, or the whole CI run, share one
   bucket and get 429s on ordinary reads.
4. **Server-rendered pages on Vercel.** Almost every public page renders on
   each request, about 140 ms of CPU each. Traffic raises cost linearly; there
   is no cache to absorb a spike.
5. **Anthropic credit or rate limit.** Moderation fails open and chat goes
   offline. Nobody is told unless they look at Sentry.
6. **Sentry's monthly error quota.** Past it, new errors are dropped silently,
   which is when they are needed.
7. **Cloudinary credits.** Past the plan's allowance the account is disabled
   and every image returns 401.
8. **One backend process.** The scheduler, the rate limiter and the API share
   it. A second replica would double every scheduled email and split the rate
   limits; scaling out needs both moved out of process first.
9. **The Postgres volume.** 0.5 GB. Far from full today; the analytics tables
   are what grow.
