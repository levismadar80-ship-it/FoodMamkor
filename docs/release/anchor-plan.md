# Anchor releases — plan (v1.5.0 is the first)

> **Status: PLAN, waiting for Sapir's go (MEH-2892).** No code, no workflow and no
> setting is changed by this document. Each work package below becomes its own
> sub-issue and PR after the go (rule 36).
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
| **E** | Two workflow rules | `.claude/rules/` text | approve the wording |

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
| **Backend (Railway)** | Redeploy the anchor's Railway deployment. If the schema is **newer** than the anchor, the old code must tolerate the new columns. Expand-only revisions (ADR-007) guarantee that, so **normally no downgrade is needed**. | Sapir | yes |
| **Schema (Alembic)** | `alembic downgrade <anchor head>`, only when a revision itself is the problem. | Sapir (CC is denied `alembic downgrade`) | **only if the downgrade is tested and the data it drops is expendable** |
| **Data (Postgres)** | Restore the anchor backup into a **scratch** database first, compare, then decide. Never restore over production without that comparison. | Sapir | **no**: everything written after the backup is lost |

**What is irreversible, from v1.4.0 to v1.5.0.** Measured: there is **one** revision
since the last release, `e4c9a2f71b58` (`favorite_alerts.notify_new_group_buy`,
nullable, `server_default true`).
- Its `downgrade()` is `drop_column`, so any alert preference set after the release
  is lost on downgrade.
- It is expand-only, so the v1.4.0 backend runs fine **with** the column present.
  Rolling back the backend therefore does **not** need the downgrade. This is the
  normal path.
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

**Each persona has its own login.** Golden-path accounts are **never** the E2E `demo-*` accounts or the capture accounts. That avoids today's 429: login is limited to 5/minute (`auth.py`).

### C.2 · Where it runs

- **Staging, before every release:** a new Playwright project `golden`, run by `workflow_dispatch` and by the release PR (patch under `docs/ci/`; Sapir pastes). It walks every action of the B map for its personas, in order. A failure blocks the release checklist (section א).
- **Production smoke after a release — proposal.** Only read-only and self-cleaning steps:
  - public pages, search, map, a business page, a WhatsApp link's `href`;
  - **one** throwaway registration that is deleted at the end;
  - no payments, no reviews on real businesses, no messages to real people.

  How test data stays invisible:
  - a dedicated `is_test` flag on the persona businesses, filtered out of the sitemap, `/producers`, `/map`, IndexNow pings and every public list. **This is a schema change, so it needs an Alembic revision and Sapir's OK.** The alternative without schema is a fixed name prefix plus an allowlist in config. That is weaker, and it is a new env var.
  - emails to `@example.com` addresses only. *Unverified:* whether Resend accepts or drops sends to `example.com`. To be measured in Phase 0 before relying on it.
  - WhatsApp to a test number only: the existing `OTP_TEST_NUMBERS` (MEH-2231), refused on production by code.

  Cleanup is an admin delete at the end of the run, and a nightly sweep for anything left behind. **Recommendation: no production smoke until the `is_test` decision is made.**

### C.3 · Manual checklist (what automation cannot see)

These join `docs/RELEASE_CHECKLIST.md` section ד, capped at 30 lines:
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

## E · Two workflow rules (proposal, wording for Sapir)

1. **No UI PR merges to staging without the full E2E run.** A PR that changes what users see (rule 38's definition) carries the `run-e2e` label, and its `Playwright E2E` must be green on the head before the merge. **Why:** on 10/11 #4270 merged on the two required gates alone, and 28 E2E tests broke on staging. They were the draft-checklist specs that still expected the old banner.
2. **Capture and QA scripts never log in with the accounts that E2E global-setup uses.** They get their own accounts (e.g. `capture-owner@example.com`), or they run only while no E2E job is running on staging. **Why:** on 10/11 a staging E2E run executed 0 tests because its `demo-owner` login got HTTP 429. CC's `/join` capture had logged in as the same account minutes earlier, and login is limited to 5/minute.

A third item, not a rule: the full suite runs close to the 30-minute job limit (`e2e.yml:100`). With failures and retries, it is cut off around test 1,393 of ~1,650, so a red run hides part of the suite. **Proposal: shard E2E into 2 jobs**, the same way `meh-2779-ci-sharding` split pytest and vitest. That is a workflow patch for Sapir.

---

## Cost

> **Measured, 10/11, last 24 h** (MEH-2891): **4,248 billable-equivalent minutes**.
> - PR Checks: 2,436
> - E2E: 791
> - Deploy: 629
> - Post-deploy: 185
> - Uptime: 136
>
> On a public repo, Actions minutes are free. On a private one the quota is
> **2,000 / month**.

| Item | Runs / day (estimate) | Minutes per run | Minutes / day |
|---|---|---|---|
| **Rule E1: full E2E on every UI PR** | ~15 UI PRs × ~1.5 pushes ≈ 22 | Chromium ~28 + WebKit shadow ~20 ≈ **48** | **~1,050** |
| E2E sharded into 2 jobs (E3) | same | ~2 × 16 + WebKit 20 ≈ 52 (more setup, shorter wall clock) | ~1,150 |
| Golden path on staging | 1 per release, plus 1 nightly | ~20 *(estimate: 8 personas, ~60 steps)* | ~20–40 |
| Production smoke | 1 per release | ~5 | ~1 |
| Downgrade round-trip test | inside pytest | < 1 | ~0 |
| Action-map drift check | inside `Repo guards` | < 1 | ~0 |
| Restore drill (MEH-1517 job) | weekly | ~10 | ~1.5 |
| Detection probe for staging | every 30 min | 1 | 48 |

**Against the quotas:**
- **Public repo (today): free.** Rule E1 roughly doubles E2E minutes, and wall-clock waiting is the real cost.
- **Private repo:** rule E1 alone is ~1,050 min/day, so the 2,000/month quota is gone in **2 days**. Going private again (MEH-2891) means a spending limit or fewer full runs. One middle path: full E2E only on PRs touching `frontend/app/**` or `frontend/components/**`, not copy-only PRs.
- **Vercel (Pro):**
  - E2E runs against a local `next start` in CI, so **zero** Vercel CPU.
  - The golden path and the production smoke hit Vercel: *estimate* ~300 page loads per golden run and ~20 per smoke.
  - The first runs will be measured with the «requests to Vercel: N» counter from #4253, before anything is scheduled.

---

## What this plan does not do

- No new monitoring service.
- No canary or blue-green.
- No automatic rollback.
- No change to the deploy pipeline itself.

Rollback stays a deliberate, documented, human decision. This plan makes it **possible and rehearsed**, not automatic.
