# Night batch 6 — second-shift fixer + PR shepherd ledger (2026-06-06)

Autonomous overnight session. Role: shepherd open overnight PRs, fix LOW-RISK
findings, two small Linear issues. **All output = DRAFT PRs; merges remain
Sapir's.**

---

## Task outcomes

| Task | Status | Notes |
|---|---|---|
| **C1 — MEH-434** launch-cohort tag | ✅ DONE (draft PR) | Client-side slice; backend path deferred. |
| **C2 — MEH-290** producer tour | ⛔ BLOCKED | Anchor targets don't exist (below). |
| **B1 — MOB fixes** | ⏸ NOT TRIGGERED | `feature/meh-233-mobile-audit` PR does not exist. |
| **B2 — FUZZ fixes** | ⏸ NOT TRIGGERED | `feature/schemathesis-fuzz` PR does not exist. |

---

## C1 — MEH-434 (DONE)

Slice shipped: client-side `launch_cohort` Sentry tag.
- `frontend/lib/launch-cohort.js` (new) — `computeLaunchCohort` + `useLaunchCohortTag`.
- `frontend/lib/auth-context.js` — 2-line diff (import + hook call).
- `frontend/__tests__/launchCohort.test.js` (new) — 6 boundary cases, green.
- `docs/LAUNCH_OBSERVABILITY.md` (new) — filter guide + launch-day bump note.
- vitest 429 pass / 41 skip (full suite); `npm run build` green; lint 0 errors.

**DEFER list (from MEH-434 Numbered Plan — needs backend, out of slice scope):**
- `backend/app/routers/auth.py` — `LAUNCH_START/END` consts + `_compute_launch_cohort` helper + field on `GET /auth/me`.
- `backend/app/schemas/schemas.py` — `UserOut.launch_cohort: str | None`.
- `backend/tests/test_auth.py` — 3 server-side cases.

Rationale: the C1 brief scopes a **code-only** slice and the example explicitly
allows "user created_at if available client-side". `created_at` is on
`UserOut` (schemas.py:752 → /auth/me), so the cohort is computable in the
browser with zero backend/schema change. The server-side path can layer on top
later without contradiction.

---

## C2 — MEH-290 (BLOCKED)

Condition gate (all 4 steps' Hebrew copy verbatim in issue) **passes** — copy is
present. But the 4 tooltip **anchor targets do not exist** in the codebase
(File:Line evidence, `frontend/app/[locale]/producer/dashboard/page.js`):

| Step | Required target | Status |
|---|---|---|
| 1 | `ProfileCompletenessCard` / `#profile-completeness-card` | ❌ Does not exist — depends on **unshipped MEH-288**. Dashboard has a different `ProfileStrengthCard` (page.js:692), no id. |
| 2 | `#availability-section` | ⚠️ Section exists (page.js:239) but has no id. |
| 3 | `#add-product-button` | ❌ No add-product button on the dashboard at all. |
| 4 | `#share-profile-button` | ❌ Only `VanityLinkCard` WA-share link (page.js:43), no such id — this is the issue's own unanswered open question #2. |

2 of 4 steps (1, 3) anchor to elements/components that don't exist. Building
them requires inventing DOM/UI + design judgment (drop to 3 steps?) + a missing
dependency (MEH-288) + an unanswered product question — all outside a mechanical
frontend slice. Copy is verbatim, but **anchors cannot be built without
invention**, so per the night-batch rule (blocked → log, skip, continue) this
is BLOCKED.

**Unblock path:** ship MEH-288 (ProfileCompletenessCard) → answer open Q#2
(does a share button exist / build one) → add stable ids/`data-testid` to the
4 anchor elements → then the localStorage tour is mechanical.

---

## B1 / B2 — NOT TRIGGERED

Both triggers reference branches that do not exist at session start
(`git branch -r` + `list_pull_requests` confirm):
- B1 needs `feature/meh-233-mobile-audit` (+ `docs/audits/2026-06-mobile-audit.md`).
- B2 needs `feature/schemathesis-fuzz` with FUZZ findings.

Re-check on each shepherd poll; execute if they appear.

---

## Shepherd log

Open PRs at session start (all DRAFT except #975): #991 (whatsapp-delivery),
#990 (meh-688 docs), #989 (meh-692 docs), #987 (meh-764 chips), #975
(test-expansion, ready).

| Time (UTC) | PR | Observation | Action |
|---|---|---|---|
| ~21:40 | all | Combined-status API returns 403 for this integration token; using `get_check_runs` instead. | Noted; no merges (read-only shepherd). |
| ~21:47 | #987 (meh-764 chips) | All checks green (build/vitest/lint/E2E/adversarial). | None — healthy. |
| ~21:47 | #975 (test-expansion) | CI re-running (build/pytest/vitest/ruff in progress) after a push. | Watch; no action. |
| ~21:47 | #991 (whatsapp-delivery) | **Backend lint (ruff) FAILED** — `Would reformat: app/services/whatsapp.py` (ruff-format), pytest+mypy passed. | **Out of shepherd scope** — it's the owning session's own code-format error, NOT staging-drift. "Never modify another session's branch beyond conflict-resync." Owner to run `ruff format`. Logged only. |

### Note — continuous-loop limitation

`send_later` is **not available** in this session, so the hour-out self
check-in cannot be scheduled. Active timer-polling is also unavailable
(Bash `sleep` forbidden; no cron). Coverage model for the rest of the night:
the harness wakes this session on **PR #994 webhook events** (CI failure /
review comments), and on every wake I re-sweep all open overnight PRs + the
B1/B2 trigger branches. PRs other than #994 are not webhook-subscribed, so
their failures are caught on the next wake, not in real time.

_Interventions appended above as they occur. Never merge; resync only on
staging-movement CI failures (Accept-Both on HANDOFF/CHANGELOG)._
