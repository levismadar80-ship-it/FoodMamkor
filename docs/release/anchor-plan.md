# Anchor releases — plan (v1.5.0 is the first)

> **Status: GO from Sapir, 10/11 evening, with three changes (MEH-2892).** They are
> folded in below:
>
> 1. **v1.5.0 is not held.** It ships as soon as the staging head is fully green,
>    with Sapir's «go merge» as usual. The **anchor title** goes to the first
>    release that passes the whole golden path (§C) **and** the rollback drill
>    (§A.4): v1.5.0 if both are ready in time, otherwise the next release. The
>    A.1 record is written for v1.5.0 either way.
> 2. **Rule E1 changed:** a full E2E run once on the staging head before every
>    release to main, not on every UI PR. Per PR, only the touched area's specs
>    plus the smoke set (§E). E2E is split into two parallel jobs.
> 3. **`is_test` approved in principle.** The Alembic revision is shown in full on
>    MEH-2892 and **stops there until Sapir approves it in writing** (§C.3).
>
> **Order of work:** E2E spec fix → release PR ready → A (record + downgrade/upgrade
> test) → B (generated map + guard; GAP count and the top 20 gaps by risk) → C
> (seeded personas + golden path on staging; the manual checklist as a doc
> Sapir ticks on her phone) → D once Sentry → Linear is connected → the drill
> once the MEH-1517 secret exists.
>
> Each package becomes its own sub-issue and PR (rule 36).
>
> **Why:** an *anchor* is one version that has been proven end to end and that we
> can return to on purpose, at every layer. Today we cannot. As of 10/11/2026:
>
> - there are **no git tags at all** (`git tag` is empty);
> - no release records its Vercel or Railway deployment id;
> - **no test anywhere runs `alembic downgrade`** (`tests/`, `.github/workflows/`
>   and `scripts/` only ever run `upgrade head`);
> - the backup has only been restored from a **synthetic** source
>   (`backup-restore-verify.yml`, job `mechanics`). The real-data job waits for
>   `STAGING_DATABASE_URL_READONLY` (MEH-1517).
>
> Every number in this document is measured unless it says *estimate*.

---

## The five packages, in order

| # | Package | Output | Sapir's part |
|---|---|---|---|
| **A** | Anchor record + rollback runbook + drill | `docs/release/anchors/v1.5.0.md`, `docs/release/ROLLBACK.md`, a downgrade test, one staging drill with evidence | the backup secret (MEH-1517), the Railway/Vercel dashboard steps, the git tag |
| **B** | Action map, generated | `scripts/release/action_map.py` → `docs/release/action-map.md`, plus a guard test | approve the persona and state list |
| **C** | Golden-path suite | Playwright project `golden`, personas seeded on staging, manual checklist | create the persona accounts' passwords as CI secrets |
| **D** | Detection drill | one deliberate break on staging → an issue in Linear | connect Sentry → Linear, or approve the uptime-staging patch |
| **E** | E1 rule (area + smoke per PR, full per release) and the E2E setup fix | `.claude/rules/` text, `scripts/e2e-select.sh`, `docs/ci/e2e-two-shards.patch.md`, a `global-setup.ts` change | paste the workflow patch |

A and D can start immediately after the go. B comes before C, because C's
coverage target is B's matrix.

---

## A · What an anchor is, and how we return to it

### A.1 · What gets recorded per anchor

One file per anchor, `docs/release/anchors/v<X.Y.Z>.md`, written **from live reads at
release time, never from memory**. Each field names its source:

| Field | Source (read, not typed) | Who |
|---|---|---|
| git tag `v1.5.0` → the merge commit on `main` | `git rev-parse origin/main` after the release merge | CC prepares the command. **Pushing the tag is Sapir's** for now: `check-branch-name.sh` blocks tag pushes until `docs/ci/meh-2285-tag-push-hook.patch.md` is applied. |
| Vercel production deployment id + URL | Vercel API `list_deployments` (target production, READY), cross-checked with the commit SHA | CC |
| Railway production deployment id | Railway MCP `list-deployments` (production, backend service) | CC |
| Alembic head | `/api/health` → `version.alembic_head`. Today production reads `f2b8d4c61a07`; v1.5.0 makes it `e4c9a2f71b58`. | CC |
| DB backup id + time | the newest R2 object after the release (`backup_production_db.py` cron) **and** the Railway snapshot timestamp | Sapir (R2 credentials, Railway dashboard) |
| Env var **names** per environment (never values) | Railway `list-variables` (names only) for staging and production; Vercel `filter_project_envs` (names + targets) | CC, and Sapir confirms |
| VRT baselines | the `parity.spec.ts-snapshots/` blob SHAs at the tag | CC |
| Lighthouse numbers | the «Post-deploy checks» run on the production deploy: total byte weight and LCP per page | CC |
| E2E result | the run id of the full staging E2E on the release head, with executed / failed / flaky counts | CC |

### A.2 · How to return to the anchor (`docs/release/ROLLBACK.md`)

Three layers, and **the order matters**: frontend first, backend second, and the
database only if data is actually wrong.

| Layer | How | Who | Reversible? |
|---|---|---|---|
| **Frontend (Vercel)** | Promote the anchor's production deployment (Instant Rollback / Promote, by deployment id). No rebuild. | Sapir, dashboard; CC can prepare the exact id | yes |
| **Backend (Railway)** | Roll back to the anchor's Railway deployment. **Corrected 10/11 (reviewer of #4285):** if the release added a revision, the old image **cannot boot** on the newer schema — `Dockerfile:61` runs `alembic upgrade head`, which stops on a revision the old image has no file for, so the healthcheck fails and the current deployment stays live. Expand-only (ADR-007) makes the old *code* tolerate new columns, not the old *boot*. Such a release needs the schema downgraded first (ROLLBACK.md §2b). | Sapir | yes, if no revision was added; otherwise only together with the schema step |
| **Schema (Alembic)** | `alembic downgrade <anchor head>`, only when a revision itself is the problem. | Sapir (CC is denied `alembic downgrade`) | **only if the downgrade is tested and the data it drops is expendable** |
| **Data (Postgres)** | Restore the anchor backup into a **scratch** database first, compare, then decide. Never restore over production without that comparison. | Sapir | **no**: everything written after the backup is lost |

**What is irreversible, from v1.4.0 to v1.5.0.** Measured: there is **one** revision
since the last release, `e4c9a2f71b58` (`favorite_alerts.notify_new_group_buy`,
nullable, `server_default true`).
- Its `downgrade()` is `drop_column`, so any alert preference set after the release
  is lost on downgrade.
- It is expand-only, so the v1.4.0 backend *code* runs fine with the column
  present. **But the v1.4.0 image does not boot** while the database is at
  `e4c9a2f71b58` (`Dockerfile:61`, `alembic upgrade head` → *Can't locate
  revision*). So rolling v1.5.0 back **does** need the downgrade first, and it
  loses the alert preferences set since the release. _Corrected 10/11; this line
  said the opposite._ The lasting fix is Sapir's choice (Dockerfile, HIGH-RISK):
  (א) keep the downgrade-first order, (ב) let boot skip `upgrade head` when the
  database is ahead of the image, or (ג) roll back by deploying the old code with
  the newer revision files. The drill (§A.4) must exercise exactly this case.
- **It has never been executed**, which is why A.3 exists.

### A.3 · Downgrade test (new pytest, no schema change)

`tests/test_alembic_roundtrip.py` runs against the CI Postgres:
1. Upgrade to the previous anchor's head.
2. Seed one row per table that the revisions since then touch.
3. Upgrade to head, then downgrade back to the anchor head, then upgrade again.
4. Assert that the schema after the round trip equals the schema straight from upgrade (a column-by-column comparison of `information_schema.columns`).
5. Assert that the seeded rows survive.

It runs only the revisions between the last anchor and head, so it stays fast. Without a previous anchor it uses the last release's head (`f2b8d4c61a07`). It fails if a revision has no `downgrade()` or if the downgrade does not undo the upgrade.

### A.4 · The drill: once, on STAGING

| Step | What happens | Who |
|---|---|---|
| 1 | Record the staging "anchor" (A.1 fields for staging). | CC |
| 2 | Deploy a harmless marker change to staging: a docs-only commit does not rebuild, so it has to be a one-line visible change. The route is picked in the package's Phase 0, somewhere no visitor goes. | CC (PR) |
| 3 | Roll the **frontend** back to the recorded staging deployment (Vercel promote/redeploy by id), and verify the marker is gone. | **Sapir** (dashboard), or CC through the Vercel MCP if she allows it. That is a write to a deployment, so it needs her explicit OK. |
| 4 | Roll the **backend** back to the recorded Railway deployment, and verify that `/api/health` shows the recorded `git_sha`. | **Sapir** (Railway dashboard) |
| 5 | Restore the newest staging backup into a **scratch** database, then run the four `docs/BACKUPS.md` §3 assertions plus a row-count comparison with live staging. | CI, once Sapir creates `STAGING_DATABASE_URL_READONLY` (MEH-1517; the spec, GRANTs and verification are already on that card). Until then: Sapir's manual drill, `docs/runbooks/dr-drill.md`. |
| 6 | Roll forward again (redeploy head) and verify that the E2E smoke subset is green. | Sapir + CC |
| 7 | Write the timings (how long each step took) and the evidence into `docs/release/anchors/v1.5.0.md`. | CC |

**Sapir has to do these herself:**
- create the MEH-1517 secret;
- the two dashboard rollbacks (Vercel, Railway);
- confirm the R2 backup id;
- push the tag.

---

## B · Action map — generated from the code, not hand-written

### B.1 · The sources, all of which already exist

| Source | What it gives | Size today |
|---|---|---|
| `frontend/lib/business-features.js` (+ `dashboard: {home, href}`) | every tool a business can use, and where it lives | 51 entries |
| `docs/audits/2026-11-implicit-state-machines.md` | states and transitions: producer, group buy, rescue order, experience, review, … | 9 sections |
| `backend/app/routers/*.py` | every API action, with method and role gate | 41 files, 231 routes |
| `frontend/app/[locale]/**/page.js*` | every page an actor can reach | 50 public, 17 dashboard, 19 admin |

### B.2 · The axes

- **Actor:**
  - business owner;
  - organizer;
  - anonymous visitor;
  - registered customer (email);
  - registered customer (Google);
  - admin.
- **State of the subject:**
  - draft;
  - pending;
  - rejected → resubmitted;
  - approved;
  - inactive;
  - on vacation;
  - plus each machine's own states from the audit, e.g. a group buy's open / funded / fulfilled / cancelled.
- **Action:** the router route (method + path), or a page interaction for client-only actions such as share and copy.

Most of the cross product is empty by design: a visitor cannot edit a business. The generator emits only the cells that the role gates and the state guards allow, **and** a negative cell for each guard (e.g. a "rejected business tries to publish → 409").

### B.3 · Each cell

Each cell holds either the covering test as `file:line` (pytest or Playwright), or `GAP`. Covering tests are found by:
- route path and method, for pytest calls to `client.<method>("<path>")`;
- `data-testid` and route, for Playwright.

That makes the map *evidence*, not a claim. A cell found only by a name match is marked `weak`.

**Mandatory extra rows:**

| Kind | Examples |
|---|---|
| **Negative paths** | wrong or expired OTP; expired reset or verify token; double submit (submit for review, join a group buy, reserve a rescue bag); cancel midway (rescue reservation, registration); rejected business acting; rate limit 429 (login 5/minute, OTP) |
| **Time-dependent** | rescue pickup window (before / inside / after); group-buy deadline passed; ended event; Friday / holiday mode and special hours; the 24 h WhatsApp window; SLA ageing in the admin queue. Each with the clock frozen (`israel_days_ago`, testing.md). |
| **Two-actor races** | owner and admin move the same group buy (row lock, #4250); «נמסר» vs cancel on one rescue order (#4249); two customers take the last rescue bag; the owner edits while the admin approves |

### B.4 · Output and guard

- `docs/release/action-map.md` is generated, with a header saying so. A CI check fails when the committed file differs from a fresh generation, the same pattern as `openapi-codegen-drift-guard.sh`.
- `tests/test_action_map_complete.py` fails when:
  - a tool in `business-features.js` has no row;
  - a router route has no row (the allowlist for internal or health routes is explicit and has reasons);
  - a state from the audit has no row.
- The GAP count is printed. It is **not** a gate at first: the gate is "no *new* GAP", a ratchet like the mypy baseline.

---

## C · Golden-path suite

### C.1 · Personas, seeded on staging

They are seeded by extending `backend/scripts/seed_demo_business.py`, with the same `_assert_not_production` guard.

| Persona | Kind | What it exercises |
|---|---|---|
| G1 | business, products only | catalogue, contact, WhatsApp, reviews, insights |
| G2 | business with events + experiences | create / edit / cancel, registrations, the host dashboard |
| G3 | **organizer** with group buys | the organizer dashboard (no insights tab), group-buy lifecycle |
| G4 | business with rescue bags | publish, reserve, pickup code, «נמסר» / «לא הגיע», the window |
| G5 | multi-location business + kashrut | locations, kashrut request → admin approval, map |
| C1 | customer (email) | favourites, alerts, join a group buy, reserve a bag, review |
| C2 | customer (Google) | same, through the Google sign-in path (a test identity, see C.3) |
| A1 | admin | approve, reject → resubmit, queues, WhatsApp failures, group buys |

**Each persona has its own login,** so persona state never mixes with the E2E `demo-*` fixtures. This is not a rate-limit fix: `/auth/login` is limited to 5/minute **per client IP**, not per account (§E2). The golden-path run therefore logs its personas in **serially**, and it never runs at the same time as an E2E job on staging.

### C.2 · Where it runs

- **Staging, before every release:** a new Playwright project `golden`, run by `workflow_dispatch` and by the release PR (patch under `docs/ci/`; Sapir pastes). It walks every action of the B map for its personas, in order. A failure blocks the release checklist (section א).
- **Production smoke after a release — proposal.** Only read-only and self-cleaning steps:
  - public pages, search, map, a business page, a WhatsApp link's `href`;
  - **one** throwaway registration that is deleted at the end;
  - no payments, no reviews on real businesses, no messages to real people.

  Test data stays invisible through `is_test` (§C.3, approved in principle). Cleanup is an admin delete at the end of the run, plus a nightly sweep for anything left behind. **No production smoke until the §C.3 revision is approved in writing and live.**

### C.3 · `is_test`: design (the revision waits for Sapir's written approval)

**Schema.** One expand-only revision on top of `e4c9a2f71b58`:
- `producers.is_test BOOLEAN NOT NULL DEFAULT false`
- `users.is_test BOOLEAN NOT NULL DEFAULT false`

The server default fills existing rows with `false` (on PostgreSQL 11+ a constant default needs no table rewrite), so no backfill is needed. No table is added, so `EXPECTED_TABLES` is unchanged. The full file is on MEH-2892.

**Who sets it.** Only the seed script (`seed_demo_business.py`, which already refuses production) and an admin-only toggle. It is never part of a self-service form or a public API response.

**One authority.** A single filter, `exclude_test_producers(query)` in `services/producer_listing.py`, which every public reader uses, so there is one owner (smell #1). Each exclusion gets its own test: an `is_test` business is absent **and** an ordinary business is present (control).

| # | Exclusion | Where it lands | Test |
|---|---|---|---|
| 1 | listings (`/producers`, home grids, category pages, «עסקים דומים») | `producer_listing.py` | pytest on each list endpoint |
| 2 | search (hero search, autocomplete) | search router | pytest |
| 3 | map (markers, clusters, mini-map) | map/producers-geo endpoint | pytest |
| 4 | sitemap | `frontend/app/sitemap.js` reads the same filtered endpoint | vitest on the sitemap builder + pytest on the endpoint |
| 5 | JSON-LD (business page, WebSite/ItemList) | the business page omits it, and the page is `noindex` for a test business | vitest |
| 6 | IndexNow | `services/indexnow.py` skips any URL of a test business | pytest (no ping scheduled) |
| 7 | emails / WhatsApp to real recipients | the send layer (`email.send_email`, `whatsapp.send_*`): for anything triggered by a test business or a test user, only `@example.com` addresses or `OTP_TEST_NUMBERS` go out; the rest is dropped and logged | pytest with the send layer recorded |
| 8 | counts | the «N בתי עסק» counter, admin analytics, follower and alert fan-out, ratings aggregates, footer «only while they have items» gates | pytest per counter |
| 9 | group buys / events / experiences / rescue / recipes lists that belong to a test business | the same filter, through the owner join | pytest per list |

**Not excluded on purpose:** the test business's own dashboard, its direct URL for the golden-path run (`noindex`), and the admin views, where test rows get a marker. Its copy goes to Sapir for approval with the PR.

*Unverified, Phase 0 of C:* whether Resend accepts or drops sends to `example.com`.

### C.4 · Manual checklist (what automation cannot see): a doc Sapir ticks on her phone

`docs/release/manual-checklist.md` is one short page with checkboxes, written to be ticked from a phone and linked from each release PR. The items that fit the cap also go into `docs/RELEASE_CHECKLIST.md` section ד (30-line cap):
- the real inbox on Gmail mobile, including whether the message lands in spam: verify, reset, welcome, newsletter, registration;
- the WhatsApp OTP on a real phone, end to end;
- the share sheet: iOS and Android;
- Google sign-in on a phone;
- iPhone Safari and Android Chrome: the dashboard, a business page, the map.

---

## D · Detection check — break staging on purpose, see it in Linear

**Today's paths into Linear:**
- `uptime.yml` probes **production only** (`HOME_URL` / `READY_URL` = `mehamakor.co.il`). It opens a GitHub issue labelled `uptime`, which syncs to Linear; that is how MEH-2864 was born.
- Sentry → Linear is **not connected** (MEH-2877, Sapir).

**Plan:**
1. **Sapir:** connect Sentry → Linear (Sentry → Settings → Integrations → Linear, alert rule action «Create a Linear issue», staging environment only for the drill). Alternatively, approve a patch adding the staging URL to `uptime.yml` (a second probe, issues labelled `uptime-staging`).
2. **The break:** a reversible staging-only fault. Options:
   - point the staging backend's healthcheck at a path that returns 503 for one deploy;
   - or set an invalid value for a non-critical staging env var that makes `/api/health/readiness` report degraded.

   Both are Railway settings, so they are Sapir's. CC prepares the exact change and the revert.
3. **Evidence:** the time from break to issue in Linear, the issue link, and recovery closing it. That goes in `docs/release/anchors/v1.5.0.md`.

---

## E · Two workflow rules (E1 as changed by Sapir 10/11; E2 corrected)

### E1 · Full E2E once per release; area specs + smoke per PR

- **Before every release to main:** one **full** E2E run on the staging head must be green. It is triggered by `workflow_dispatch` on the release PR's head and recorded in the anchor file (A.1). It runs in **2 parallel shards**: a workflow patch for Sapir, `docs/ci/e2e-two-shards.patch.md`, on the pattern of `meh-2779-ci-sharding`.
- **Per PR** (and per staging push): the specs for the **area** the PR touches, plus the **smoke set**.
- **Escalation to the full suite** for a PR that touches:
  - shared layout: `frontend/app/[locale]/layout.js`, `loading.js`, `not-found.js`, `components/Header.jsx`, `BottomNav.jsx`, `Footer.jsx`, `CookieBanner.jsx`, `globals.css`;
  - the dashboard home or its shell: `app/[locale]/producer/dashboard/page.js`, `DashboardLayoutClient.jsx`, `components/ProfileCompletenessCard.jsx`;
  - auth: `lib/auth-context.js`, `app/[locale]/login/**`, `app/[locale]/register/**`, `backend/app/auth.py`, `backend/app/routers/auth.py`;
  - middleware: `frontend/middleware.js`.

**Area → specs** (filename globs under `frontend/e2e/flows/`; the selection script lives in `scripts/e2e-select.sh`, and wiring it into the workflow is part of the same patch):

| Area (changed paths) | Specs |
|---|---|
| home, discovery (`app/[locale]/page.js`, `home/**`, `producers/**`, `components/ProducerCard*`) | `01-*`, `02-*`, `16-*`, `17-*`, `45-*`, `manual/home*`, `manual/producers*` |
| map (`map/**`, `components/Map*`) | `05-*`, `07-*`, `15-*`, `43-minimap-*`, `manual/map*` |
| business page (`[slug]/**`, `producer/[id]/**`) | `03-*`, `04-*`, `06-*`, `26-*`, `27-delivery-*`, `35-*`, `manual/producer-detail*`, `manual/share*` |
| register, login, account (`register/**`, `login/**`, `settings/**`, `favorites/**`) | `09-*`, `10-*`, `11-*`, `18-*`, `21-*`, `22-*`, `27-register-*`, `28-*`, `29-*`, `30-login-*`, `31-*`, `32-*`, `38-*`, `40-register-*`, `manual/auth*`, `manual/register-producer*` |
| business dashboard (`producer/dashboard/**`, `components/producer/**`) | `24-*`, `34-*`, `40-rejected-*`, `manual/dashboard-*` |
| admin (`admin/**`, `components/admin/**`) | `20-*`, `30-admin-*`, `33-*`, `manual/admin-*` |
| static and content (`about/**`, `join/**`, `legal`, `messages/*.json`) | `13-*`, `39-*`, `41-*`, `manual/about*`, `manual/join*`, `manual/legal*`, `manual/hebrew-typography*` |
| events and calendar (`events/**`, `experiences/**`, `group-buys/**`, `rescue/**`) | `08-*`, plus the matching `manual/*` specs |

- **Smoke set,** always: `01-home-load`, `03-view-producer-detail`, `04-whatsapp-click`, `05-map-navigation`, `13-static-pages-render`, `25-role-reachability`, `41-not-found-chrome`, `43-site-sanity`.
- **Unmapped:** a changed path that matches no area runs the full suite. The script prints which path caused it.

**Why.** On 10/11, #4270 merged on the two required gates alone. 28 E2E tests broke on staging: the draft-checklist specs still expected the old banner. A dashboard-area run on the PR would have caught it, and #4270 changed the dashboard home, which escalates to the full suite anyway.

### E2 · Corrected: the 429 was not the capture scripts

The earlier draft blamed CC's `/join` capture runs for the staging E2E run that executed 0 tests (HTTP 429 on login). **That diagnosis was wrong.**
- `/auth/login` is limited to `5/minute` **per client IP**: the default key, with no email component (`auth.py`, `rate_limit.py resolve_client_ip`).
- CC's sandbox and the CI runner are different IPs, so CC's logins cannot exhaust the runner's bucket.
- Separate capture accounts would therefore not prevent it, and they are **not** being created.

What the evidence does show:
- In run 42837553999 the Chromium job and the WebKit shadow job **started in the same second** (14:47:20 and 14:47:21).
- Each logs in 4 roles in global setup (`global-setup.ts`: producer, consumer, admin, smoke-admin).

The cause stays **unverified** for this run, but it is likely: both jobs landed in one bucket. A previous session measured that **all CI leaves from one IP** (MEH-2284 in the HANDOFF archive: a 60/minute-per-IP limit tripped the same way). Two jobs × 4 logins in the same minute exceed 5/minute. The other candidate is another job logging in at the same minute.

**Proposed fix, inside E2E code with no workflow change:** global setup logs in serially and, on a 429, waits out the window (`Retry-After`, otherwise 60 s) once before failing. The shards in E1 stagger their setup by 30 s.

Capture and QA scripts still follow one hygiene rule: they never run while an E2E job is running on staging.

---

## Cost (redone for E1 as changed)

**Measured today** (MEH-2891, last 24 h, 10/11): **4,248 billable-equivalent minutes**.

| Workflow | Minutes |
|---|---|
| PR Checks | 2,436 |
| E2E | 791 (every staging push runs the full suite; PRs only with `run-e2e`) |
| Deploy | 629 |
| Post-deploy | 185 |
| Uptime | 136 |

Day assumed below: ~15 UI PRs × ~1.5 pushes, ~25 staging pushes, 1 release candidate. Every number in the table is an *estimate* until the first week is measured.

| Item | Runs / day | Minutes / run | Minutes / day |
|---|---|---|---|
| Per-PR area + smoke (Chromium only) | ~22 | setup ~4 + smoke ~3 + area ~5 ≈ **12** | ~265 |
| Per-PR full suite (layout / dashboard home / auth / middleware PRs) | ~4 | 2 shards × ~16 + setup ≈ **36** (WebKit shadow off on PRs) | ~145 |
| Staging push: area + smoke, instead of today's full suite | ~25 | ~12 | ~300 |
| **Full suite once on the release head** (2 shards + WebKit shadow) | ~1 | ~36 + 20 ≈ **56** | ~56 |
| Golden path on staging (release candidate + nightly) | ~2 | ~20 | ~40 |
| Production smoke after a release | ≤1 | ~5 | ~5 |
| Downgrade round-trip test + action-map drift check | inside pytest / `Repo guards` | < 1 | ~0 |
| Restore drill (MEH-1517), weekly | 1/7 | ~10 | ~1.5 |
| **E2E-related total** | | | **~810** (today: 791) |

Net effect: about **the same E2E minutes as today**, but they buy a per-PR area check that does not exist today, and the full suite moves from every staging push to once per release.

**Public repo (today): free.** Actions minutes cost nothing. The real cost is waiting time:
- area runs give ~12 minutes of feedback per PR;
- the full suite takes ~20 minutes of wall clock with 2 shards (the WebKit shadow adds another ~20).

**Private repo (MEH-2891):** the quota is 2,000 minutes/month. The whole pipeline (~4,270 min/day, of which E2E is ~810) uses it up **in under a day**, with or without this plan.
- Linux runner overage at about $0.006–0.008 per minute (check the current GitHub price): ~128,000 overage minutes × $0.006–0.008 ≈ **$770–1,020 a month**.
- E2E is ~19% of that. **The big line is PR Checks (2,436 min/day)**, so trimming it (`docs/ci/meh-2212-actions-cost.patch.md`) matters more than any E2E decision.
- Going private without a spending limit stops CI on day 1.

**Vercel (Pro):**
- E2E runs against a local `next start` in CI, so **zero** Vercel CPU.
- The golden path and the production smoke hit Vercel: *estimate* ~300 page loads per golden run and ~20 per smoke.
- Both are measured with the «requests to Vercel: N» counter (#4253) before anything is scheduled.

---

## What this plan does not do

- No new monitoring service.
- No canary or blue-green.
- No automatic rollback.
- No change to the deploy pipeline itself.

Rollback stays a deliberate, documented, human decision. This plan makes it **possible and rehearsed**, not automatic.
