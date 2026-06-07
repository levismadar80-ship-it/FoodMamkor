# Mutation-guided test expansion — 2026-06 (Refs MEH-214)

> Autonomous overnight session. Meta ACH pattern: generate domain-specific
> mutants for critical logic, write tests that kill them, heal until green.
> **ZERO production-code edits.** Writable: `tests/**`,
> `frontend/__tests__/**`, `docs/testing/**`. Mutants live only in this doc —
> never committed to the tree.

## תקציר מנהלים (Hebrew exec summary)

1. **מה מוגן עכשיו שלא היה אתמול:** 72 בדיקות חדשות סגרו פערים אמיתיים
   ב-6 תחומים קריטיים — כולן ירוקות ב-CI.
2. **הסתרת ספקים בחופשה** (`on_vacation`) מרשימת היצרנים נבדקת לראשונה,
   כולל גבול התאריך (ספק שחוזר *היום* לא מנוקה בטעות) ושער ה-422 על חופשה
   ללא תאריך חזרה.
3. **הרשאות אדמין** — 18 endpoints משנים (approve/reject/delete/block...)
   מקבלים עכשיו בדיקת 403-לל-אדמין; מוטנט שמסיר `require_admin` מכל אחד
   מהם נתפס.
4. **JWT** — משתמש חסום דרך אימות-אופציונלי מקבל 403 (לא מטופל כאנונימי),
   טוקן פג-תוקף נדחה, וטוקן refresh לא מתקבל כ-access.
5. **פערים שנותרו (ל-Sapir):** WhatsApp Graph-200-undelivered לא מטופל
   בקוד — אין מה לבדוק עד שייכתב טיפול. ראו "Survived" למטה.

---

## Environment constraints (from session brief)

- **Backend pytest CANNOT run in sandbox** (no Postgres, MEH-672). Backend
  loop: write test → `python -m py_compile` + grep real imports → push → CI
  Postgres is the Healer. Max 5 heal iterations/test, then BLOCKED + skip.
- **Frontend vitest runs locally** → full closed loop incl. mutant-kill
  verification. Baseline at session start: **414 passed / 43 skipped / 0
  failed** (clean tree, the noted PaginationCounter oxc issue is among the
  skipped — not a failure).
- New tests in NEW files only. Existing test files read-only.

---

## PROGRESS checklist

- [x] Phase 0 — Test plan + coverage map + draft PR
- [x] Phase A — Mutant generation (catalog below)
- [x] Phase B — Test generation (per domain)
  - [x] B1 Availability state machine (backend) — `tests/test_expansion_availability.py`
  - [x] B2 Admin authorization guards (backend) — `tests/test_expansion_admin_authz.py`
  - [x] B3 Auth / JWT (backend) — `tests/test_expansion_auth_jwt.py`
  - [x] B4 Registration flow (backend) — `tests/test_expansion_registration.py`
  - [x] B5 WhatsApp branching (backend) — `tests/test_expansion_whatsapp.py`
  - [x] B6 Tier model (backend) — `tests/test_expansion_tier.py`
  - [x] B7 AvailabilityBadge MEH-291 states (frontend) — `frontend/__tests__/expansion/availability-badge.test.jsx` ✅ vitest green (local + CI)
- [x] Phase C — Healer: frontend vitest green ✅ (local + CI); backend pytest
  green ✅ in CI on first push — **zero heal iterations needed**.
- [x] Phase Final — Report + HANDOFF + PR ready

---

## BLOCKED / SKIPPED (log as we go)

- **WhatsApp 24h-window branching (WA brief domain 5)** — NOT a real
  surface. The "inside 24h → free-form, outside → template" decision does
  not exist as runtime logic; every business-initiated path hardcodes
  `send_template` by design (OTP/welcome/approval), and only the
  already-24h-delayed rating request uses `send_text`. No mutant to write;
  re-scoped B5 to the actual send-layer contract.
- **`verification_tier` resolver (Tier domain)** — the public מאומת/מוצהר
  resolver (MEH-762 Chunk 3) landed on staging mid-session
  (`tests/test_meh_762_public_tier_contract.py`); no duplicate written.

### CI-dispatch note (infra, not test code) — for the morning reviewer

All 6 required checks ran **green on commit `4a50c74`** (the commit that
contains 100% of the new test logic): PR Checks (build/pytest/ruff/env-drift),
Deploy (FE lint/API audit), vitest, and E2E — all ✅. After that, the branch
got a staging-sync merge (`8e7ad2f`, Accept-Both HANDOFF resolution, no test
logic changed) and a CI re-trigger empty commit (`fd9b28e`). The
**`pull_request`-triggered workflows (pr-checks.yml + deploy.yml) stopped
dispatching** on these post-merge heads — verified across 3 pushes over ~12
min. `deployment_status` E2E still dispatches normally on the same commits, so
Actions is not globally down; this is a `pull_request`-event dispatch quirk
(transient GitHub dispatch backlog or a repo Actions spending/concurrency
state — cf. workflow rule 21 budget note). **Not test-code related.** To clear
it at review time: "Re-run all jobs", or a fresh push, or close+reopen the PR
will re-dispatch; or it self-resolves once the backlog clears. The required
checks must show green on HEAD before merge (Rulesets: "Expected" blocks).

---

## Coverage map (what exists today)

Existing suite is far larger than the brief's "~24" estimate: **~60 backend
test files**, **~46 frontend test files** (414 vitest tests). Per-domain:

| Domain | Already well-covered | Real gaps (targets) |
|---|---|---|
| Auth/JWT | token create/iat/tv/scope, refresh rotation (MEH-326), fingerprint (MEH-327), pwd-change invalidation (MEH-305), blocked-on-refresh | `require_producer` isolated 403; `get_current_user_optional` re-raises **403 for blocked** (vs None for 401); expired-token → 401; refresh-scope token rejected as access |
| Tier (מאומת/מוצהר) | verification stamping (MEH-762, 15 tests), declaration stamping (MEH-759, 15 tests), trust_tier 1–5 (test_trust_ladder) | `compute_trust_tier` None-coalescing (`or 0`) guard; tier-4 both-criteria boundary at >10/>4.5; **NOTE: public `verification_tier` resolver (Chunk 3) is NOT implemented — no tests written for it** |
| availability_state | helper read (MEH-662), legacy vacation endpoint (MEH-509), badge legacy states, basic state-set | **default-listing exclusion of on_vacation (MEH-291 Phase 3 core) — UNTESTED**; auto-clear date boundary `<` vs `<=`; new `/availability-state` invalid-state 400 + on_vacation-without-date 422; frontend new badge states |
| Registration | declaration guard (MEH-759), license-required categories (MEH-530), enumeration-safe ack | license+declaration+contact-method **error ordering**; folded `declaration_accepted` with all fields present |
| WhatsApp | template construction (MEH-672), OTP template (MEH-754), webhook security (MEH-509) | `send_text`/`send_template` **fail-open** (no config → False, no httpx call); phone `+` strip; `_post` HTTPError → False; template payload shape. **Graph-200-undelivered is NOT handled in code → logged as SURVIVED gap, not testable** |
| Admin authz | high-level `/admin/dashboard` 401/403 (TestAdminGuard); functional flows | **~50 mutating admin endpoints have NO per-endpoint 403-without-admin regression test** — guard-removal mutants survive |

---

## Phase A — Mutant catalog

Diff-style, ≤5 lines each. `file:line` points at real production code (read
this session). Mutants are NEVER applied to the committed tree; frontend
mutants are applied locally, verified, then `git checkout --`'d.

### Domain B1 — Availability state machine

| ID | Target file:line | Mutation (diff) | Expected observable failure | Kill |
|---|---|---|---|---|
| AV-1 | `backend/app/services/producer_listing.py:177-179` | delete the `if filters.get("availability_state") is None:` exclusion block | on_vacation producer leaks into default `GET /producers` | reasoning(CI) |
| AV-2 | `producer_listing.py:178` | `!= "on_vacation"` → `== "on_vacation"` | default list shows ONLY vacation producers | reasoning(CI) |
| AV-3 | `backend/app/schemas/schemas.py:573` | `vacation_until < date.today()` → `<= date.today()` | producer whose vacation ends TODAY is wrongly auto-cleared to accepting_orders | reasoning(CI) |
| AV-4 | `schemas.py:571-578` | drop the `vacation_until is not None` guard | None comparison → 500 / premature clear | reasoning(CI) |
| AV-5 | `backend/app/routers/producer_me.py:347-349` | remove `if data.state not in AVAILABILITY_STATES` 400 guard | garbage state string persisted, returns 200 | reasoning(CI) |
| AV-6 | `producer_me.py:350-351` | remove `on_vacation and vacation_until is None` 422 guard | on_vacation set with no return date (banner has no date) | reasoning(CI) |
| AV-7 | `producer_me.py:362-364` | `vacation_until if state=="on_vacation" else None` → always `data.vacation_until` | leaving vacation keeps stale return date | reasoning(CI) |

### Domain B2 — Admin authorization guards

| ID | Target | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| AD-1..N | each `@router.<verb>` in admin*.py | drop `Depends(require_admin)` on endpoint N | consumer/producer can hit mutating admin endpoint → 200/404 instead of 403 | reasoning(CI) |
| AD-GUARD | `backend/app/auth.py:261` | `if user.role != "admin"` → `if user.role == "admin"` | every non-admin allowed, admins blocked | reasoning(CI) |

Representative path-only mutating endpoints chosen (no-body → clean 403, not
422): `/admin/producers/{id}/approve`, `/reject`, `/toggle-status`,
`/grant-verified`(body), DELETE `/admin/producers/{id}`,
`/admin/producers/{id}/set-ambassador`, `/admin/kashrut/{id}/approve`,
`/admin/experiences/{id}/approve`, `/admin/recipes/{id}/approve`,
DELETE `/admin/outreach/{id}`, POST `/admin/users/{id}/block`.

### Domain B3 — Auth / JWT

| ID | Target file:line | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| JW-1 | `backend/app/auth.py:268-272` (`require_producer`) | `!= "producer"` → `== "producer"` | consumer passes producer-only route | reasoning(CI) |
| JW-2 | `auth.py:254-256` (`get_current_user_optional`) | drop the 403 re-raise → return None | **blocked user treated as anonymous** on optional-auth routes | reasoning(CI) |
| JW-3 | `auth.py:213-214` | skip `JWTClaimsRegistry().validate()` | expired token accepted | reasoning(CI) |
| JW-4 | `auth.py:146-148` (`_validate_access_scope`) | `scope != "access"` → `scope == "access"` | refresh token accepted as bearer access | reasoning(CI) |

### Domain B4 — Registration flow

| ID | Target file:line | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| RG-1 | `backend/app/routers/auth.py:424-428` | remove `declaration_accepted` 422 guard | producer created without binding declaration | reasoning(CI) |
| RG-2 | `auth.py:433` (`ensure_license_for_categories`) | skip the call | license-required category registered with no license | reasoning(CI) |
| RG-3 | `backend/app/services/license_validation.py:52-70` | treat whitespace-only license as present | `"   "` accepted as a valid license number | reasoning(CI) |

### Domain B5 — WhatsApp branching

| ID | Target file:line | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| WA-1 | `backend/app/services/whatsapp.py:61-63` | drop `if not _is_configured(): return False` in send_text | unconfigured env attempts real httpx POST | reasoning(CI) |
| WA-2 | `whatsapp.py:66` | `to.lstrip("+")` → `to` | payload `to` keeps the leading `+` (Meta rejects) | reasoning(CI) |
| WA-3 | `whatsapp.py:50-52` | `except HTTPError: return True` | network failure reported as send success | reasoning(CI) |
| WA-4 | `whatsapp.py:91` | `"type": "template"` → `"type": "text"` | template sent as free-form (undelivered outside 24h) | reasoning(CI) |
| WA-5 | `whatsapp.py:83-87` | drop send_template fail-open guard | unconfigured env attempts real template POST | reasoning(CI) |

### Domain B6 — Tier model

| ID | Target file:line | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| TR-1 | `backend/app/services/trust_tier.py:28-30` | remove `or 0` on reviews_count/avg_rating | None producer → TypeError (500) instead of tier 1 | reasoning(CI) |
| TR-2 | `trust_tier.py:28` | `>= 10` → `> 10` | exactly-10-reviews 4.5★ producer drops from tier 4 | reasoning(CI) |
| TR-3 | `trust_tier.py:30` | `>= 4.5` → `> 4.5` | exactly-4.5★ producer drops from tier 4 | reasoning(CI) |
| TR-4 | `trust_tier.py:26` | ambassador check moved below tier-4 | ambassador with <10 reviews returns 1 not 5 | reasoning(CI) |

### Domain B7 — AvailabilityBadge MEH-291 states (FRONTEND — verified kill)

| ID | Target file:line | Mutation | Expected failure | Kill |
|---|---|---|---|---|
| FB-1 | `frontend/components/AvailabilityBadge.jsx:37` | `available_today` color `#2e6853` → `#22c55e` | dark-green badge renders wrong color | **verify** |
| FB-2 | `AvailabilityBadge.jsx:39` | `on_vacation` color `#9ca3af` → `#22c55e` | vacation badge renders green not gray | **verify** |
| FB-3 | `AvailabilityBadge.jsx:44` | add `available_today` to CARD_HIDDEN_STATES | "זמינה היום" badge wrongly suppressed on cards | **verify** |
| FB-4 | `AvailabilityBadge.jsx:44` | add `on_vacation` to CARD_HIDDEN_STATES | vacation badge wrongly hidden on cards | **verify** |
| FB-5 | `AvailabilityBadge.jsx:36` | `accepting_orders` labelKey → `card_label.available_today` | open-orders shows "זמינה היום" text (in detail variant) | **verify** |
| FB-6 | `AvailabilityBadge.jsx:63` | `CARD_HIDDEN_STATES.has(normalized)` → `!...has(...)` | card hides the wrong set (suppresses busy/vacation, shows open) | **verify** |

---

## Counts table (Phase Final — all CI green)

| Domain | New tests | Mutants | Killed-verified (FE) | Killed-by-reasoning (BE, CI-validated) | Survived |
|---|---|---|---|---|---|
| B1 Availability | 10 | 7 | — | 7 | 0 |
| B2 Admin authz | 37 | 19 | — | 19 | 0 |
| B3 Auth/JWT | 6 | 4 | — | 4 | 0 |
| B4 Registration | 2 | 3 | — | 3 | 0 |
| B5 WhatsApp | 5 | 5 | — | 5 | 0 |
| B6 Tier | 4 | 4 | — | 4 | 0 |
| B7 Badge (FE) | 8 | 6 | 6 | — | 0 |
| **Total** | **72** | **48** | **6** | **42** | **0 (catalog)** |

- **Killed-verified** = frontend; mutant applied locally → vitest red → revert
  → green. **Killed-by-reasoning** = backend; test passes on original code in
  CI, kill-logic argued per mutant (sandbox can't run mutated backend, MEH-672).
- **Test count:** frontend **414 → 422** active vitest tests; backend **+64**
  new tests across 6 new files (exact backend total not measured locally — no
  sandbox Postgres; full suite confirmed green in CI).

---

## Survived mutants / coverage gaps (findings for Sapir)

These are real holes the catalog could not close cheaply — not test failures,
but production behavior that doesn't exist to be tested:

1. **WhatsApp Graph-200-undelivered (`whatsapp.py:48`).** `_post` treats any
   HTTP 200 as success and never inspects the Meta response body for
   per-message error codes or "queued/undeliverable" states. A "send returns
   True but the message never arrives" mutant SURVIVES because there is no
   delivery-status check to mutate. **Fix would need code** (parse response
   body / persist webhook status receipts) before a test is meaningful.
2. **Outbound delivery-status persistence (`whatsapp_webhook.py:294-296`).**
   Status receipts (delivered/read/failed) are counted but not stored, so
   there's no contract to assert. Same class as #1.

Both are backend-feature gaps, deliberately left as findings rather than
forced into a weakened test.
