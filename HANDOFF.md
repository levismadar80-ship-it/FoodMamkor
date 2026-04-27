# Session Handoff
> Updated at the end of every session.
> Read this before starting any work.
> Last updated: 2026-04-27 (MEH-349 python-multipart bump — PR open, draft)

## Most recent — MEH-349 python-multipart CVE bump (2026-04-27)

PR: (draft, branch: claude/bump-python-multipart-aqmRO → staging)

Summary:
- Bumped python-multipart 0.0.18 → 0.0.26
- Closes CVE-2026-24486 (path traversal/RCE, fixed in 0.0.22) + CVE-2026-40347 (DoS, fixed in 0.0.26)
- FastAPI 0.120.1 allows >=0.0.18; constraint satisfied
- pip-audit BEFORE: 2 python-multipart CVEs present
- pip-audit AFTER: both gone; requests CVEs remain (deferred to MEH-340)
- Adversarial review: 0 blocking issues; Starlette CVE-2025-62727 not applicable (running 0.49.3)
- pytest: 148 DB-connection errors (pre-existing, no local PostgreSQL in CI env)

Follow-up tickets deferred from this PR:
- MEH-340: requests 2.32.3 → 2.33.0 (CVE-2024-47081, CVE-2026-25645)

## ⏭ Previous — MEH-338 fastapi/starlette CVE bump (2026-04-27)

PR: #357 (feature/meh-338-bump-fastapi-starlette → staging, draft)

Summary:
- Bumped fastapi 0.115.6 → 0.120.1
- starlette 0.41.3 → 0.49.3 transitively (closes CVE-2025-62727 + CVE-2025-54121)
- annotated-doc 0.0.4 new (fastapi 0.120.0+ doc utility)
- 148/148 pytest green; adversarial-review clean

Severity:
- CVE-2025-62727 (HIGH): defense-in-depth, 0 attack surface
- CVE-2025-54121 (MODERATE): reachable via image upload routes

Canary evidence (rate-limit on starlette 0.49.3):
- PRIMARY: pytest TestRefreshTokenFlow::test_refresh_rate_limited green (Step 8, seeded DB, asserts 429 against rate-limit logic)
- Corroborating: local curl try-6 → 429 (Step 11, empty-DB context, ambiguous path)
- Pending: staging smoke checks 1 + 2 (post-merge)

## ⏭ Post-merge gate (MANDATORY)

Run `scripts/smoke_test_prod.sh` against staging within 60 minutes of merge. Expected 7/7. ANY failure → immediate `git revert` of MEH-338 commit on staging. Do NOT proceed with other work until staging smoke is green.

Reason: feature branch has no Railway preview; smoke check 2 (TRUSTED_PROXY rate-limit isolation) requires Railway edge X-Real-IP injection that local cannot replicate.

## Follow-up tickets (post-MEH-338, not today)

- MEH-339 (proposed): python-multipart 0.0.18 → 0.0.26 (CVE-2026-24486, CVE-2026-40347)
- MEH-340 (proposed): requests 2.32.3 → 2.33.0 (CVE-2024-47081, CVE-2026-25645)
- MEH-341 (proposed): anthropic 0.39.0 → latest (stale, no CVE)
- MEH-342 (proposed): local dev DB init imports models before create_all() (one-line fix in _run_db_init_sync; surfaced during MEH-338 local smoke)

Lesson learned (for future bump tickets):
Local-against-empty-DB curl ≠ rate-limit fitness test. Always use pytest with seeded DB asserting 429 logic specifically; curl loops are ambiguous (any middleware can return 429).

### Key decisions this session
| Decision | Reason |
|----------|--------|
| fastapi 0.120.1 (not 0.121+) | Avoids Pydantic 1 deprecation noise; 0.120.x is the stable CVE-fix target per fastapi upstream |
| starlette 0.49.3 (not 0.50.0) | fastapi 0.120.1 pins `starlette<0.50.0`; 0.49.3 is latest in series; both CVEs fixed at ≥0.49.1 |
| annotated-doc 0.0.4 allowed | New fastapi 0.120.0+ dep extracted from typing_extensions; no transitive deps; 7KB; whitelist approved |
| 3 atomic commits (no amend) | Stop hook (exit 2) blocked turns with dirty files; committed pyproject.toml, then uv.lock, then docs atomically per CLAUDE.md commit discipline |

---

## 2026-04-26 — MEH-337 merged (pyjwt bump 2.9.0 → 2.12.0, CVE-2026-32597)

### Status
- **PR #356** — `feat(MEH-337): bump pyjwt 2.9.0 → 2.12.0 (CVE-2026-32597)` — **merged to `staging`** (squash, commit `6f7d859`).
- **Branch:** `feature/meh-337-pyjwt-bump` (off `staging`); now stale — local branch can be deleted.
- All CI green at merge: Frontend build, Frontend lint, Backend tests (pytest, 148 passed), Backend dependency audit (pip-audit), Frontend dependency audit (npm audit), Adversarial review, API contract audit (static), Playwright E2E.
- **Apple OAuth functional smoke: DEFERRED** to follow-up ticket (see "Linked follow-up" below). The pyjwt code path is dormant in production due to unset `APPLE_CLIENT_ID` / `NEXT_PUBLIC_APPLE_CLIENT_ID` env vars — the Apple Sign-In button doesn't render, so no functional verification was physically possible. Mock-only wrapper tests + pyjwt's upstream test suite + CHANGELOG audit form the confidence basis for the merge (Option 3 of the 3-option investigation framework).

### What shipped
- `backend/pyproject.toml:21` — `PyJWT[crypto]==2.9.0` → `==2.12.0`
- `backend/uv.lock` — regenerated; ONLY pyjwt moved (no transitive bumps; cryptography stayed pinned)
- `tests/test_api.py` — new `TestAppleTokenVerification` class, 4 cases: `test_returns_payload_on_valid_token`, `test_returns_none_when_apple_client_id_unset`, `test_returns_none_on_invalid_signature`, `test_returns_none_on_unknown_kid`. Locks the wrapper in `routers/auth.py:_verify_apple_token` (lines 944-975) so future pyjwt bumps surface regressions in the Apple OAuth path.

### Key decisions this session
| Decision | Reason |
|----------|--------|
| Bump despite production-dormant code path | Defense in depth; clean pip-audit baseline (unblocks MEH-336); zero production user impact either way; when Apple OAuth is provisioned later, no scramble. |
| Mock-based wrapper tests instead of full pyjwt integration tests | Apple Sign-In button doesn't render in production (env var unset), so iPhone smoke is physically impossible today. Wrappers + CHANGELOG audit + pyjwt's upstream test suite are the next-best confidence basis. Catch wrapper drift on next bump; functional verification deferred to provisioning ticket. |
| One-commit, one-PR (clean diff) | Per workflow rule 5a + plan §3 acceptance criteria. uv.lock diff verified to ONLY move pyjwt; no transitive deps moved. |
| 4 wrapper test cases, not more | Cover happy path + 3 distinct sad paths (no client_id, decode exception, unknown kid). Testing more would expand into pyjwt-internal territory which is the upstream maintainer's job. |

### Dormant code path discovery (pre-merge investigation)
During pre-merge mobile QA prep, an iPhone screenshot of `/login` showed only Email + Google buttons — no Apple Sign-In. Investigation across the codebase:
- `backend/app/config.py:47` — `apple_client_id: str = ""` (empty default)
- `frontend/components/AppleAuthButton.jsx:8, 54` — `if (!clientId) return null;` (button hidden when env var unset)
- `backend/app/routers/auth.py:626` — `/auth/apple` POST endpoint early-exits on empty `apple_client_id` (HTTP 503 per MEH-253)
- `backend/app/routers/auth.py:946-948` — `_verify_apple_token` returns `None` before reaching `pyjwt.decode` (line 965)
- `docs/DEPLOYMENT.md` — confirms Apple keys are "optional for first launch — leave blank"

**Conclusion:** Apple OAuth code is fully wired (frontend AppleAuthButton + backend `/auth/apple` endpoint per MEH-170 PR #302) but dormant in production. CVE-2026-32597 is unexploitable in our deployment until Apple OAuth is provisioned.

### Linked follow-up — REQUIRES MANUAL FILING IN LINEAR (no Linear MCP this session)

**TODO for Smadar:** file the following ticket in Linear, then update PR #356 description (replace "MEH-XXX" placeholder with actual number). The PR is already merged but its description is editable.

```
Title: 🍎 Provision Apple OAuth — env vars + iPhone smoke vs pyjwt 2.12
Priority: 4 (Low) — only relevant if/when Apple OAuth becomes a product priority. Not a launch blocker.

## מטרה
Apple OAuth is wired in code (frontend AppleAuthButton + backend /auth/apple endpoint) but dormant in production due to unset env vars. This ticket is the gate to enabling it.

## Prerequisite (HARD GATE — do not skip)
Before flipping NEXT_PUBLIC_APPLE_CLIENT_ID on Vercel or APPLE_CLIENT_ID on Railway, run iPhone manual smoke against:
- /login → tap "Sign in with Apple" → complete Apple ID auth
- Verify redirect to /producers, logged-in state, no 500 errors
- Check Railway logs for [APPLE AUTH] entries

This validates pyjwt 2.12.0 on its actual code path — coverage that MEH-337 PR #356 deferred. If smoke fails: revisit MEH-337, re-test pyjwt bump on real Apple flow before re-enabling.

## Provisioning steps
1. Apple Developer Account ($99/year)
2. Services ID + Sign in with Apple key in Apple console
3. Configure redirect URIs (production + staging)
4. Add env vars:
   - Vercel: NEXT_PUBLIC_APPLE_CLIENT_ID (production + preview)
   - Railway: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (production + staging)
5. Run prerequisite smoke (above) on Vercel preview FIRST
6. Deploy to staging, smoke again
7. Deploy to production

## Linked tickets
- MEH-337 (pyjwt bump, deferred Apple smoke to this ticket)
- MEH-170 (original Apple wiring)
- MEH-253 (503 fix when unconfigured)

## Branch
feature/meh-XXX-provision-apple-oauth (when triggered)

## Definition of Done
- [ ] Env vars set on Vercel + Railway (production)
- [ ] iPhone smoke passes on production preview BEFORE prod env enable
- [ ] iPhone smoke passes on production after env enable
- [ ] Railway logs show successful [APPLE AUTH] entry
- [ ] No 500s on /auth/apple endpoint
- [ ] HANDOFF.md + CHANGELOG.md updated
```

### Audit findings (out of scope, future tickets)
- **Architectural smell flag (MEH-271 audit):** the codebase carries TWO JWT libraries — `joserfc` (primary, all our token issuance/decode) and `pyjwt` (one Apple OAuth call site). Worth a future ticket to consolidate to one library.
- **Linear MEH-337 ticket text drift:** the auto-posted description (linear-bot comment on PR #356) calls pyjwt the "primary library". Stale — actual primary is joserfc. Worth a Linear-side cleanup post-merge.
- **Other CVEs unchanged in pip-audit AFTER:** pip / python-multipart / requests / starlette — tracked under MEH-336 / MEH-338. Out of scope for MEH-337.

### Next task
- Pending Smadar's call. Options:
  - File the Apple OAuth provisioning follow-up ticket in Linear, link it back to PR #356
  - MEH-338 (`starlette 0.41.3 → 0.49.1`, CVE-2025-62727 — needs FastAPI compat coordination)
  - MEH-336 umbrella (flip CI audit gates from `continue-on-error: true` to required, after backend audit baseline is reduced)
  - Carry-over: MEH-329 + MEH-333 spot-checks on staging once Railway redeploys

---

## 2026-04-26 — MEH-333 merged (inline login link on email-exists error)

### Status
- **PR #355** — `feat(MEH-333): inline login link on email-exists error, pre-fill email from URL` — **merged to `staging`** (squash, commit `8bca8cc`).
- **Branch:** `feature/meh-333-inline-login-link` (off `staging`); now stale — local branch can be deleted.
- All CI green at merge: Frontend build, Frontend lint (RTL + Next.js), Backend tests (pytest), Adversarial review, API contract audit (static), Playwright E2E (Vercel preview).
- **Mobile QA: DEFERRED** to staging deployment verification (per Smadar's "skip mobile QA" call this session). Spot-check on `staging.mehamakor.online` after Railway redeploy: register existing email as consumer + producer, click `התחברי` link, confirm landing on `/login` with email pre-filled (test `user+tag@gmail.com` for `+` survival through `encodeURIComponent`).

### What shipped
- **`frontend/app/register/page.js`** (consumer register): added `emailExistsError` boolean state. On submit catch, detect `status === 400 && detail.startsWith("האימייל כבר קיים")` → set boolean (vs. plain `setError`). Renders amber `<p>` + inline `<Link href="/login?email=...">התחברי</Link>`. Clears on email-field edit.
- **`frontend/app/register/producer/page.js`** (producer register): added `import Link from "next/link"`. Two display surfaces — (a) blur warning (`emailExistsWarning`): `<a>` → `<Link>` swap, href changed from `?redirect=` to `?email=`. (b) submit 409 (`!isUpgrade` branch): added `emailExistsSubmitError` boolean, renders same amber `<p>` + `<Link>` pattern as consumer for visual consistency. The `isUpgrade` 409 branch ("כבר יש לך עסק רשום") unchanged.
- **`frontend/app/login/page.js`**: `useState("")` → `useState(params.get("email") || "")` (line 39). `LoginPageBody` already wrapped in `<Suspense>` (line 28), so `useSearchParams` was safe — no new wrapping needed.

### Key decisions this session
| Decision | Reason |
|----------|--------|
| URL `?email=...` over `sessionStorage` | Email is not sensitive enough to warrant cross-tab state complexity; matches existing `?redirect=` pattern on `/login`; shareable links work. Tradeoff: email lands in browser history + server logs. |
| Detection by HTTP status, not message string | Initial plan used `detail === "האימייל כבר קיים במערכת"` exact match; would have failed on producer 409 (which appends suffix). Fixed pre-implementation: consumer = `status === 400 && detail.startsWith("האימייל כבר קיים")`, producer = existing `status === 409` path (no string match). |
| Producer submit 409: convert from `setError(string)` to `emailExistsSubmitError` boolean for `!isUpgrade` branch | Visual consistency with consumer — same JSX render pattern, same link styling. The `isUpgrade` 409 ("כבר יש לך עסק רשום") stays as a plain string error since no email-exists context applies. |
| Mobile QA deferred to staging verification | Sandbox can't reach `staging.mehamakor.online` (egress firewall, same as MEH-329). Smadar to spot-check after Railway redeploy. |

### Audit finding (out of scope, future ticket recommended)
Backend status-code drift detected during MEH-333 audit:
- `backend/app/routers/auth.py:223` (consumer register POST `/auth/register`) returns **400** for email-exists.
- `backend/app/routers/auth.py:281` (producer register POST `/auth/register/producer`) returns **409** for the same condition.
Both interpreted as "email already in system". Recommend a future Linear ticket to normalize to **409** across both endpoints. Frontend currently handles both via separate code paths (the prefix-match on consumer is defensive against future suffix changes).

### Linear status
- **MEH-333:** to be moved to Done manually (no Linear MCP integration available in this session).

### Next task
- Pending Smadar's call. MEH-330 (Dependabot + audit) is still **code complete, not pushed** per pre-MEH-329 HANDOFF entry below — picking that up is one option. MEH-336 / MEH-337 / MEH-338 audit-baseline backlog is another.

### Pending verifications carried forward
- **MEH-329 spot-check** still pending: paste `<script>alert(1)</script>` into producer description / contact form / home-product description on staging; confirm DB stores stripped text and frontend renders safely.
- **MEH-333 spot-check** (this session): see "Mobile QA: DEFERRED" above.

---

## 2026-04-26 — MEH-329 merged (XSS sanitization sweep)

### Status
- **PR #353** — `feat(MEH-329): XSS sanitization sweep — bleach 6.3.0 input-layer defense` — **merged to `staging`** (squash, commit `8deb697`).
- **Branch:** `feature/meh-329-xss-sweep` (off `staging`); now stale — local branch can be deleted.
- All CI green at merge: pytest (155 passed), Next build, ESLint, pip-audit, npm audit, Playwright E2E, Adversarial review.
- Post-merge: sandbox could not reach `staging.mehamakor.online` (egress firewall, 403 `host_not_allowed`) so the rule-17 health Monitor was skipped. Smadar to spot-check staging.mehamakor.online manually after Railway redeploy completes.

### What shipped
- **NEW** `backend/app/services/sanitization.py` — `sanitize_text` helper. Strips HTML tags via `bleach.clean(value, tags=[], strip=True)`, caps length, returns `None` on empty.
- **NEW** dependency: `bleach==6.3.0` (latest stable per pip index 2026-04-26; strict-pinned in `backend/pyproject.toml` + `backend/uv.lock`).
- **30 `@field_validator` decorations across 11 schemas:**
  - `backend/app/schemas/schemas.py`: `ProducerRegister.description`; `ProducerAdminCreate.description`/`short_description`/`admin_notes`; `ProducerUpdate.description`/`short_description`; `HomeProductCreate`/`Update.title`/`description`/`location_notes`/`allergens`; `RatingSubmit.comment`; `ExperienceCreate`/`Update.title`/`description`/`requirements`/`address`.
  - `backend/app/routers/marketing.py`: `ContactIn.name`/`message`.
  - `backend/app/routers/events.py`: `EventCreate`/`Update.description`/`location`.
  - `backend/app/routers/reviews.py`: `ReviewCreateNested.body`.
- **Tests:** new `tests/test_sanitization.py` (11 unit tests pinning bleach 6.3.0 behavior); 3 integration tests appended to `tests/test_api.py::TestSanitizationIntegration`.
- **Frontend:** 0 unsafe `dangerouslySetInnerHTML` matches. 2 `ld+json` renders (`frontend/app/[slug]/page.js:43`, `frontend/app/producer/[id]/page.js:28`) annotated with `// eslint-disable-next-line react/no-danger -- ld+json schema; producer text fields sanitized server-side (MEH-329)`.
- **Docs:** `docs/CHANGELOG.md` entry; `docs/SECURITY.md` § 9 placeholder replaced with shipped pointer; `docs/MANUAL_TESTING.md` 3 manual-XSS check cases.

### Key decisions this session
| Decision | Reason |
|----------|--------|
| `bleach==6.3.0` (not `>=6.1.0` per spec) | Latest stable per `pip index versions bleach` on 2026-04-26; matches project's `==`-only pin style. |
| `HomeProduct.title` capped at 200, not 100 (spec asked 100) | Column is `String(200)` (`models.py:385`); existing `HomeProductModerationRequest.title` is `max_length=200`. Lowering to 100 would silently truncate legitimate 101–200-char titles without raising 422 — that's a behavior change, not defense-in-depth. Approved by reviewer pre-implementation. |
| Scope expansion (5 fields beyond spec): `ProducerAdminCreate.admin_notes`, `ExperienceCreate`/`Update.requirements`, `ExperienceCreate`/`Update.address` | Same DB columns / same risk surface as in-spec siblings. Approved by reviewer. |
| No DB backfill of existing rows with stored HTML | Sanitization on write only. No exploit vector today (React encodes); risk monitored if `dangerouslySetInnerHTML` ever added to a user-supplied field. Two existing dSIH usages render `JSON.stringify(jsonLd)` only. |
| Behavior-lock unit tests (not modify `sanitize_text` to match spec expectations) | bleach 6.3.0 with `tags=[], strip=True` (a) preserves inner text of stripped tags — `<script>alert(1)</script>hello` → `"alert(1)hello"`; (b) does NOT decode HTML entities — `&lt;b&gt;` stays as-is. Both XSS-safe (literal text, not executable). Tests `test_strips_script_tags` and `test_html_entities_decoded` lock the actual bleach output, per reviewer rule "behavior lock, not security requirement". |
| Integration test gap (acceptable): no POST `/reviews` or POST `/rate/{token}` integration test | Reviews + ratings sanitization covered by unit tests + validator-decoration code review. Approved by reviewer. |
| Push-approval discipline (forward) | "GO" on plan ≠ push permission. Future PRs require an explicit "push approved" after verifications. The retroactive ack on PR #353 is one-time; do not repeat. |

### Next task
- **MEH-333** (Medium, ~30–45 min quick win) — pick this up next session.
- **Pending Smadar verification:** spot-check `staging.mehamakor.online` after Railway redeploy completes — paste `<script>alert(1)</script>` into producer description/contact form/home-product description; confirm DB stores stripped text and frontend renders safely.

### Open tickets (carried forward)
| Ticket | Priority | Summary |
|---|---|---|
| **MEH-336** | umbrella | Clear MEH-330 audit baseline (frontend 13 high / 6 moderate; backend 8 vulns) and flip the CI audit gates from `continue-on-error: true` to required. Tracks MEH-337 + MEH-338 + the residual backlog. |
| **MEH-337** | High | `pyjwt 2.9.0 → 2.12.0` (CVE-2026-32597). Auth-critical; touches `backend/app/auth.py`. Run full `tests/test_api.py` regression on bump. |
| **MEH-338** | High | `starlette 0.41.3 → 0.49.1` (CVE-2025-62727). Framework; coordinate with `fastapi==0.115.6` compat — likely requires fastapi bump. |

### Known issues discovered but not yet filed
- 9 test files at `tests/test_*.py` use `from tests.conftest import …` and fail collection (ModuleNotFoundError: 'tests'). This is **pre-existing on `staging`** (verified pre-merge), not introduced by MEH-329. Not blocking — workflow rule 5 canonical pre-merge target is `pytest tests/test_api.py` only, which passes. Worth filing as a small chore ticket: either fix imports to `from conftest import …` (matches how `test_api.py` does it) or add a root `conftest.py` with `sys.path` injection.

---

## 2026-04-26 — Session in progress (MEH-330: Dependabot + audit)

### Status
- **MEH-330** — pip-audit + npm audit CI workflow + Dependabot config — **code complete, NOT pushed.** Awaiting Smadar's push approval.
- **Current branch:** `feature/meh-330-dependabot-audit` (off `staging`).
- **Files added/changed:**
  - **NEW** `.github/workflows/dependency-audit.yml` — 2 jobs (`pip-audit` + `npm-audit`), `pull_request` (paths-filtered) + weekly cron + `workflow_dispatch`, `permissions: contents: read` per job, both `continue-on-error: true` with `TODO(MEH-336)`.
  - **NEW** `.github/dependabot.yml` — 3 ecosystems (pip / npm / github-actions), weekly Mon 06:00 Asia/Jerusalem, target `staging`, limit 5 PRs.
  - `docs/SECURITY.md` — new §8c "Dependency audits + Dependabot".
  - `docs/SECURITY-CHECKLIST.md` — TRAP 8 + checklist row + table-of-contents row.
  - `docs/DEPLOYMENT.md` — branch-protection note explaining audits are NOT required checks (sprint 1, MEH-336 to flip).
  - `docs/CHANGELOG.md` — one-line entry.
  - `HANDOFF.md` — this entry.

### Baseline counts at MEH-330 ship (2026-04-26)
- **Frontend (`npm audit --audit-level=high`):** 13 high / 6 moderate (19 total at high+).
- **Backend (`uv run --with pip-audit pip-audit`):** 8 vulns across 5 packages.

### New tickets opened this session (Linear, pre-merge per Smadar)
| Ticket | Priority | Summary |
|--------|----------|---------|
| **MEH-336** | umbrella | Clear MEH-330 audit baseline + flip CI gate from warn-only to required. Tracks frontend 13 high / 6 moderate + backend 8-vuln backlog. Closes when both CI jobs flip `continue-on-error: false`. |
| **MEH-337** | High | `pyjwt 2.9.0 → 2.12.0` (CVE-2026-32597). Auth-critical; touches `backend/app/auth.py`. Run full `tests/test_api.py` regression on bump. |
| **MEH-338** | High | `starlette 0.41.3 → 0.49.1` (CVE-2025-62727). Framework; coordinate with `fastapi==0.115.6` compat — likely requires fastapi bump. |

### Key decisions this session
| Decision | Reason |
|----------|--------|
| `uv run --with pip-audit pip-audit` (not `pip-audit -r <(uv export ...)`) | Audits the actually-installed venv, not the requirements file. Backend has no `requirements.txt`; uv is the only dep manager (`backend/pyproject.toml` + `uv.lock`). Mirrors what CI installs for pytest in `pr-checks.yml:78–84`. |
| `npm audit --audit-level=high` with NO `--omit=dev` | Spec is explicit. Dev-tool CVEs (e.g. `glob` command injection) execute on dev + CI machines that build the production artifact — supply-chain risk, not just runtime. Hiding 3 highs to make CI green = "weaken to make a test pass" anti-pattern. |
| Warn-only gate (`continue-on-error: true`) for sprint 1 | Avoids one giant unmergeable PR. TODO comment + umbrella MEH-336 force the flip later. |
| Separate workflow file (not folded into `pr-checks.yml`) | Combining `on: pull_request` + `on: schedule` in pr-checks.yml would either trigger build/pytest/adversarial on cron, or require per-job `if:` guards — both worse. Different gate semantics: pr-checks = required, dependency-audit = warn→required. |
| `permissions: contents: read` per-job (not workflow-level) | Least-privilege `GITHUB_TOKEN`. Per-job (not workflow-level) so a future job added to the file is independently scoped. Supply-chain hardening extension to spec. |
| Dependabot weekly (not daily) | Matches `dependency-audit.yml` cron cadence; `open-pull-requests-limit: 5` per ecosystem prevents queue overflow. |
| All Dependabot PRs target `staging` | CLAUDE.md branch strategy — never `main`. |

### Pending before push (in order)
1. Local verification (yaml lint, `npm run build`, `pytest tests/test_api.py`, re-run both audits).
2. `/adversarial-review` on changed files (rule 5a).
3. Stage + commit (one commit per logical unit: workflow+dependabot YAML, then docs).
4. **Wait for Smadar's push approval.**
5. After push: open draft PR → `staging` (PR description per plan v2 §16).
6. Post Vercel preview URL once Vercel publishes the hash.

### Lessons learned
- `uv` ships pip-audit cleanly via `uv run --with` — no need to install pip-audit separately into the project, no need to maintain a dev-deps entry. CI step is one line.
- `npm audit` with `--omit=dev` excludes 3 highs in this codebase — `glob` (`@next/eslint-plugin-next`), `picomatch` (`@typescript-eslint`), `brace-expansion` — all of which still execute during the build. Confirms the spec's no-omit choice was right.
- `pr-checks.yml` already wires `astral-sh/setup-uv@v3` with cache key `backend/uv.lock`. New `dependency-audit.yml` reuses that cache transparently — verified by reading the action docs (cache-by-key shared across workflows in the same repo).

### Next session start
1. Read HANDOFF.md
2. `git fetch --prune origin`
3. If MEH-330 PR merged → `git pull origin staging` and pick next ROADMAP ticket. If not merged → resume on `feature/meh-330-dependabot-audit`.
4. Pre-launch order from MEH-327 close: MEH-329 (XSS sweep) is next non-MEH-330 pre-launch item.

---

## 2026-04-26 — Session close (MEH-327 merged)

### Status
- **MEH-327 ✅ MERGED** — PR #351 squashed to `staging` as `f1982d2`. Token Sidejacking defence (OWASP JWT Cheat Sheet) live on staging.
  - 8 token-issuing endpoints emit `__Secure-Fgp` cookie + `userFingerprint` claim
  - `get_current_user` validates the SHA-256 binding before any DB write (fail-open for pre-MEH-327 tokens, max 15-min window)
  - `/auth/logout` clears the cookie
  - 7 tests in `TestFingerprintCookie` + 1 fix to `test_logout_all_devices_rotates_refresh_cookie`
  - Docs synced: `SECURITY.md §8b`, `CHANGELOG.md`, `.ai/diagrams/auth-flow.md`
- **Current branch:** `staging` (clean, post-merge)
- **Next task:** TBD — MEH-335 hardening items are post-launch (Medium); next pre-launch ticket per ROADMAP.

### CI iteration log (4 fix cycles before green)
The first green CI run came after 4 separate diagnoses. **Root cause** of the long chain: httpx's `Headers.items()` joins multiple `Set-Cookie` headers into a single comma-separated string, breaking every `startswith()` filter on any cookie after the first. Symptom masked by `pytest -x` — failures in `TestRefreshTokenFlow` blocked `TestFingerprintCookie` from ever running, hiding 4 sibling tests with the same broken extraction. Documented in MEH-335 description for future reference.

| Iter | Commit | Fix | Outcome |
|------|--------|-----|---------|
| 1 | `b6ca28a` | Initial chunks A–F | CI red: `test_logout_all_devices_rotates_refresh_cookie` 401≠200 (TestClient drops `Secure` cookies over `http://testserver`) |
| 2 | `2a0ddfe` | Pass `__Secure-Fgp` explicitly via `cookies={...}` | CI red: `_fp_value` returned `None` (root cause not yet found) |
| 3 | (diagnosis) | Standalone repro showed `headers.items()` joins multiple Set-Cookie headers — `headers.get_list("set-cookie")` returns them individually | — |
| 4 | `bb184bb` | Replace `[v for k,v in headers.items() if k=="set-cookie"]` with `headers.get_list("set-cookie")` in both `_refresh_cookies` AND `_all_set_cookies` helpers | CI green ✅ |

### New tickets opened this session
| Ticket | Priority | Summary |
|--------|----------|---------|
| MEH-335 | Medium (post-launch hardening) | MEH-327 follow-ups: (1) **P2** add `logger.warning` on fingerprint mismatch in `auth.py:163-165` — the actual attack signature currently has zero security log signal; (2) **P3** downgrade `logger.info` fail-open log to `debug` (fires per-request during 15-min transition window); (3) **P3** missing test: `get_current_user_optional` with mismatched fp cookie (current behavior correct but untested); (4) **process** — root cause of the 4-iteration debug chain (httpx headers.items() Set-Cookie joining + `pytest -x` masking sibling failures) — consider running pytest without `-x` on auth-touching PRs to surface all related failures up front. |

### Key decisions this session
| Decision | Reason |
|----------|--------|
| `SameSite=Lax` (not Strict) for `__Secure-Fgp` | `Strict` breaks cross-site GET navigations from email links (`/verify-email`, `/reset-password`). Deviation documented in `docs/SECURITY.md §8b`. |
| `max_age` matches refresh cookie (14d) | Fingerprint must outlive the 15-min access token — 15-min TTL would create a timing edge-case where a live token arrives with an expired fp cookie. |
| Fail-open for missing `userFingerprint` claim | Pre-MEH-327 tokens (15-min max window) have no claim — mirrors MEH-206 (`tv`) and MEH-326 (`scope`) fail-open patterns. |
| Fingerprint gate before `_maybe_bump_last_active` | Invalid tokens must not write to the DB. |
| `secure=True` unconditional on fp cookie (rejected conditional `secure=(env != "development")`) | Conditional `secure` recreates the env-drift class of bug caught in MEH-332. Tests must adapt to the cookie attrs, not the other way around. Dev workflow constraint: must use HTTPS. |

### Lessons learned
- **httpx `Headers.items()` joins multiple `Set-Cookie` headers** into one comma-separated string. Use `Headers.get_list("set-cookie")` for individual entries. Critical for any test that asserts on cookies set alongside another cookie in the same response.
- **`pytest -x` hides sibling failures with the same root cause.** When debugging an auth/cookie change that touches multiple tests, run without `-x` on the first failure to see whether the same bug has spread.
- **`__Secure-` cookie prefix REQUIRES `Secure=True` per RFC 6265bis.** Browsers reject `__Secure-*` cookies without the flag — conditional `secure` is not a viable test workaround. Adapt the test, not the production cookie attrs.
- **TestClient `http://testserver` drops `Secure` cookies via httpx (RFC 6265bis enforcement).** Tests that need a Secure cookie carried forward must pass it explicitly via `cookies={...}`, mirroring the established MEH-326 refresh-token test pattern.

### Next session start
1. Read HANDOFF.md
2. `git fetch --prune origin && git pull origin staging`
3. Review MEH-335 hardening backlog (Medium, post-launch — defer until pre-launch tickets clear)
4. Pick next ROADMAP ticket per priority

---

## 2026-04-26 — Session close (MEH-332 closed, docs-only)

### Status
- **MEH-332 ✅ FIXED** — root cause: `FRONTEND_URL=https://mehamakor.online` was set on Railway staging environment (bulk-copied from production). Smadar fixed manually on Railway → `https://staging.mehamakor.online`. Verified: staging reset-password + verify-email links now point to staging.
- **Branch:** `feature/meh-332-staging-reset-url` — docs-only PR (no code changes).
- **Files changed:** `docs/DEPLOYMENT.md` (added FRONTEND_URL row to staging env var table), `backend/.env.example` (added per-env override warning + Staging line), `docs/CHANGELOG.md` (one-line entry), `HANDOFF.md` (this entry).
- **Next task:** MEH-327 — Ultra Plan #2: fingerprint cookie (next pre-launch security ticket).

### New tickets opened this session
| Ticket | Priority | Summary |
|--------|----------|---------|
| MEH-334 | Low (post-launch) | Boot-time guard for `FRONTEND_URL` / `ENV` mismatch — warn on startup if `ENV=staging` but `FRONTEND_URL` lacks `staging.` (or `ENV=production` but `FRONTEND_URL` contains `staging.`). Defense-in-depth against the MEH-332 class of misconfiguration. |

### Decisions this session
| Decision | Reason |
|----------|--------|
| Docs-only fix (no code change to `_send_reset_email` / `_send_verify_email`) | Single source of truth = `settings.frontend_url` from env. Deriving from request `Host` header opens host-header-injection / password-reset-poisoning class of bugs. Env var stays the right answer. |
| Add row to `docs/DEPLOYMENT.md` staging table, not a new "do not copy" section | Discoverability: anyone setting up staging reads that table top-to-bottom. Separate warning section gets skipped. |
| Keep `backend/.env.example` default at production value | Matches existing convention; the new comment block is the affirmative override warning. |
| Defer boot-time mismatch guard to MEH-334 (post-launch) | Today's docs fix prevents recurrence; runtime guard is defense-in-depth, not blocking launch. |

### Lessons learned
- **Env var docs must list per-environment overrides, not just production values.** The staging env var table in `docs/DEPLOYMENT.md` §A listed `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`, `ENV`, etc. — but omitted `FRONTEND_URL` because it was treated as a "set once, same everywhere" var. Result: staging silently inherited the production hostname for ~3 weeks, breaking every email link from staging. Going forward: any env var that differs between environments MUST appear in the staging table with the staging value spelled out.
- **Grep for siblings before closing.** `settings.frontend_url` is referenced in 7 places (`backend/app/routers/auth.py:632, 807, 861, 862, 874, 971, 993` + `backend/app/services/experience_notifications.py:43, 55, 72`). One env-var fix repaired all of them — but if any of them had a hardcoded fallback, the bug would have persisted. Audit confirmed clean.
- **Pytest mocks don't catch env-config bugs (MEH-331 lesson echoes here).** `tests/test_api.py` mocks `send_email` at the router level. The URL string passed in is asserted, but the test fixture sets its own `FRONTEND_URL` — so a wrong production value in Railway is invisible to the test suite. Only a live email or a Railway env var snapshot in CI would catch this. Manual verification on staging is non-optional for any env-derived behavior.

### Next session start
1. Read HANDOFF.md
2. `git fetch --prune origin && git pull origin staging`
3. Branch: `git checkout -b feature/meh-327-fingerprint-cookie`
4. Read MEH-327 ticket for next-task spec.

---

## 2026-04-26 — Session close (MEH-326 merged, next: MEH-332)

### Status
- **MEH-326 ✅ MERGED** — PR #349 merged to staging. SHA `7b7f880`. Manual tests A/B/C passed on staging.
- **Current branch:** `staging` (clean, up to date)
- **Next task:** MEH-332 — reset-password email URL points to production from staging (blocks staging email tests, HIGH)

### New tickets opened this session
| Ticket | Priority | Summary |
|--------|----------|---------|
| MEH-332 | High | Reset-password email URL hardcoded to production — breaks staging email tests |
| MEH-333 | Medium | Inline login link in "email exists" error (UX, low urgency) |

### Pre-launch order
1. **MEH-332** — blocks staging email flow, fix first
2. **MEH-327** — Ultra Plan #2: fingerprint cookie
3. **MEH-329** — XSS sweep
4. **MEH-330** — Dependabot
5. **MEH-333** — UX polish, low urgency

### Decisions this session
| Decision | Reason |
|----------|--------|
| No sessionStorage flag in refresh interceptor | SKIP_REFRESH list + in-flight `refreshPromise` sufficient; no extra storage needed |
| `api.post("/auth/logout")` fire-and-forget in logout | Header.jsx callers are sync onClick; state must clear instantly |
| `db.refresh(user)` in logout_all_devices | Belt-and-suspenders against expire_on_commit stale-tv; MEH-265 lesson |
| `SameSite=Lax` not Strict | Strict breaks legitimate top-level navigation flows |
| `delete_cookie` with symmetric attrs (R1 adversarial) | RFC 6265 doesn't require it, but defense-in-depth + symmetry with `_set_refresh_cookie` |
| Defer R2 (axios retry loop guard) | Rate-limited at 30/min; no known production scenario triggers it; file as follow-up |

### Lessons learned
- **Stop hook no-push rule:** during multi-chunk features, stop hook fires after every commit and prompted auto-push. Needed explicit "no push until approved" rule per chunk. Consider documenting in CLAUDE.md workflow rules.
- **axios `config.url` stays relative** (verified via axios PR #2391): SKIP_REFRESH list with `/auth/refresh` prefix is safe against infinite recursion.
- **TestClient cookie-jar collision:** session client accumulates Set-Cookie headers across requests. Stale-cookie rotation tests need `fresh_client = TestClient(app)` with no prior history.
- **Adversarial review caught R1** (`delete_cookie` missing symmetric attrs) that chunk-by-chunk review missed. `/adversarial-review` before push is load-bearing, not ceremonial.

### Next session start
1. Read HANDOFF.md
2. `git fetch --prune origin && git pull origin staging`
3. Branch: `git checkout -b feature/meh-332-reset-password-url`
4. Investigate: check `FRONTEND_URL` env var in Railway staging environment — `_send_reset_email` uses `settings.frontend_url` which should already be correct if env var is set.

---

## 2026-04-26 — MEH-326 JWT refresh tokens (code complete, not yet merged)

### Status
- **MEH-326 code complete** — all backend, frontend, tests, docs done.
- **Awaiting:** local pytest on Smadar's Windows machine, then push + Vercel preview.
- **Branch:** `feature/meh-326-jwt-refresh` — 12 local commits, 1 pushed (5bdca16), draft PR #349 open.

### What's done this session

**Backend — `backend/app/auth.py`**
- `create_access_token`: added `scope="access"` claim, TTL 15min
- `create_refresh_token`: new — 14d TTL, `scope="refresh"`, same HS256 key
- `decode_refresh_token`: new — returns claims or None, never raises
- `get_current_user`: rejects `scope != "access"`; absent scope → fail-open (backward compat)

**Backend — `backend/app/config.py`**
- `access_token_expire_minutes` default: 1440 → 15
- `refresh_token_expire_days`: new, default 14

**Backend — `backend/app/routers/auth.py`**
- `_set_refresh_cookie(response, user)`: new helper, single source of truth for cookie attrs
- `POST /auth/refresh`: new endpoint, rotates both tokens, rate-limited 30/min
- `POST /auth/logout`: new endpoint, 204, no auth required, clears cookie
- 7 token-issuing endpoints wired: login, register, register_producer, register_producer_oauth, google_auth, apple_auth, logout_all_devices (with db.refresh belt-and-suspenders on the last one)

**Frontend — `frontend/lib/api.js`**
- `withCredentials: true` on axios instance
- Replaced simple 401 handler with refresh-aware interceptor: SKIP_REFRESH list, `refreshPromise` dedup, retry-on-success, `_expireSession` on failure

**Frontend — `frontend/lib/auth-context.js`**
- `logout`: fire-and-forget `api.post("/auth/logout")` after state clear
- `deleteAccount`: same pattern after `api.delete("/auth/me")`

**Tests — `tests/test_api.py`**
- 10 new tests in `TestRefreshTokenFlow` class (lines 1620–1780)
- Critical: `test_old_24h_access_token_still_validates` guards backward compat
- Fixed: `test_logout_all_devices_rotates_refresh_cookie` uses fresh `TestClient` to avoid cookie-jar collision

**Docs updated:**
- `docs/DEPLOYMENT.md`: ACCESS_TOKEN_EXPIRE_MINUTES=15, REFRESH_TOKEN_EXPIRE_DAYS=14
- `docs/AUDIT-SECURITY-FOLLOWUP.md`: §3 MEDIUM finding #2 marked RESOLVED
- `.ai/diagrams/auth-flow.md`: all 24h refs updated, §5 refresh sequence diagram added
- `docs/SECURITY.md`: token lifetime + CSRF caveat
- `docs/MANUAL_TESTING.md`: Cases A/B/C
- `docs/CHANGELOG.md`: one-line entry

### Pending before merge
1. `cd backend && backend/.venv/bin/python -m pytest tests/test_api.py -q` — run on Smadar's Windows (Postgres required)
2. `cd frontend && npm run build` — verify no build errors
3. `git push origin feature/meh-326-jwt-refresh` — push remaining 11 local commits
4. Share Vercel preview URL with Smadar
5. Manual test cases A/B/C from `docs/MANUAL_TESTING.md`

### Decisions this session
| Decision | Reason |
|----------|--------|
| No sessionStorage flag | Skip list + in-flight Promise sufficient loop guard |
| `api.post("/auth/logout")` fire-and-forget in logout | Header.jsx callers are sync onClick; state must update instantly |
| `db.refresh(user)` in logout_all_devices | Belt-and-suspenders against expire_on_commit drift; MEH-265 lesson |
| `SameSite=Lax` not Strict | Strict breaks top-level navigation flows |
| axios PR #2391: config.url stays relative | Skip list with `/auth/refresh` prefix is safe; no infinite recursion risk |
| fresh TestClient for tv-bump 401 assertion | Session client stores new_refresh; sending old_refresh on top = non-deterministic |

### Lessons learned
- Stop hook auto-pushes; needed explicit "no push until approved" rule per chunk
- axios `config.url` verified relative (not absolute) via PR #2391 — critical for SKIP_REFRESH correctness
- TestClient cookie-jar collision: session client accumulates cookies across requests; stale-cookie tests need fresh client

### Next session start
Read HANDOFF.md → confirm pytest passed on Windows → push → Vercel preview URL to Smadar → manual tests A/B/C.

---

## 2026-04-25 End-of-day — MEH-331 closed

### Status
- **MEH-331 CLOSED** — verify-email / reset-password URL truncation fixed in two PRs.
- **MEH-191 RESOLVED** — "Verify email button not working" was the user-facing ticket for this root cause.
- Both PRs squash-merged to `staging`. Local feature branches can be deleted.

### What shipped

**PR #347 — `feature/meh-331-email-html-fallback`** — HTML email body (partial fix)
- `email.py`: added `html: str | None = None` param to `send_email`; Resend call includes `"html"` key when set.
- `auth.py`: `_send_verify_email` + `_send_reset_email` each build RTL HTML body with `<a href>` button, plain-URL fallback, `dir="rtl"` + `text-align:right` belt-and-suspenders.
- **Root cause at the time was wrong.** Plain-text line-wrapping hypothesis was plausible but incorrect.

**PR #348 — `feature/meh-331-cte-base64-attempt`** — CTE base64 header (actual fix attempt)
- `email.py`: inside `if html:` block, adds `params["headers"] = {"Content-Transfer-Encoding": "base64"}` to ask Resend's MTA to use base64 instead of quoted-printable.
- Real root cause: **Quoted-Printable (RFC 2045) encoding** — Resend's MTA wraps HTML lines at 76 chars by inserting `=\r\n` soft breaks. These land inside `href` attribute values, splitting the token mid-string. PR #347's `<a href>` button was structurally correct but QP encoding broke the URL at the transport layer anyway.
- Status: **UNTESTED** — requires Gmail "Show original" to confirm `Content-Transfer-Encoding: base64` on the `text/html` MIME part. If Resend ignores this header → fall back to Option 1 (short-code redirect column).

### Verification required before next feature work
1. Fresh register on staging → Gmail "Show original"
2. `text/html` MIME part must show `Content-Transfer-Encoding: base64` (not `quoted-printable`)
3. Raw source must have no `=\r\n` mid-URL
4. Click button → "האימייל אומת בהצלחה"
5. Repeat for reset-password flow
6. Mobile Gmail (iOS + Android)

### Open pre-launch security tickets (next up)
| Ticket | Title | Priority |
|--------|-------|----------|
| MEH-326 | JWT refresh tokens | High |
| MEH-327 | Fingerprint cookie | High |
| MEH-329 | XSS sanitization sweep | High |
| MEH-330 | Dependabot + audit | Medium |

After MEH-326/327/329/330 → MEH-305/306 (password policy, force-logout on password change — dropped from MEH-318).

### Lessons learned this session

**Lesson 1 — pytest mocks at router level cannot catch transport-layer bugs.**
`tests/test_verify_email.py` mocks `send_email` at the router level. This validates that `_send_verify_email` *calls* send_email correctly, but it cannot detect MTA encoding behavior. For email delivery bugs, the ONLY reliable test is: send a real email to Gmail → "Show original" → check MIME headers. No pytest mock can substitute for this.

**Lesson 2 — Demand file:line evidence + raw bytes before approving any email-content fix.**
PR #347 was approved and merged based on a plausible theory (plain-text SMTP line-wrapping) without raw evidence (actual truncated token bytes vs DB token bytes). The correct protocol: before declaring root cause, produce `DB token[:8]` vs `URL token[:8]` comparison, and match the truncation point to the specific encoding boundary (76 chars for QP, 72 for SMTP fold). Theory without raw bytes = hypothesis, not root cause.

### Decisions table
| Decision | Reason |
|----------|--------|
| CTE base64 header (1-line, 30-sec test) before Option 1 (short-code redirect) | Costs nothing if Resend ignores it; fixes the bug if honored |
| Reject shorter token (Option 2) | OWASP recommends 128+ bits; `token_urlsafe(32)` = 256 bits. Fragile to URL prefix changes |
| If CTE header fails → Option 1: short-code redirect column | 16-char base62 code, ~95 bits entropy, industry standard; URLs stay under 62 chars on staging |
| PR #347 kept (not reverted) | Plain-text fallback + HTML button are correct regardless of CTE outcome; only the CTE encoding fix is uncertain |

---

## 2026-04-25 Session — MEH-331 attempt #2 (Resend CTE base64 header)

### What shipped
- Branch: `feature/meh-331-cte-base64-attempt` → draft PR to `staging`
- **Reversal**: PR #347's diagnosis was wrong. Plain-text line-wrapping was a red herring. Real root cause: **Resend's MTA applies quoted-printable encoding to the HTML body** AFTER our `<a href>` is built. QP inserts `=\r\n` soft breaks at 76-char boundaries, which can land inside an href attribute value, truncating the URL.
- Evidence: user repro showed truncation persists with HTML emails (`?token=PHJuHuDN...sraTQMg` → submitted as `qaoEAG8LG8sraTQMg`). QP break math matches.
- Research (resend.com/docs, GitHub issues): Resend API has no documented `content_transfer_encoding` parameter. The `headers` field is the only knob.
- This PR: pass `headers={"Content-Transfer-Encoding": "base64"}` to `resend.Emails.send` when html is set. **Untested** — Resend may not propagate this to the HTML MIME part. If Gmail "Show original" still shows QP, fall back to Option 1.

### Decisions this session
| Decision | Reason |
|----------|--------|
| Try CTE-base64 header first (1-line, 30-second test) | Costs nothing if Resend ignores it; fixes the bug if Resend honors it |
| Reject Option 2 (shorter token) | OWASP Forgot Password Cheat Sheet recommends 128+ bits; 88-bit reset tokens borderline. Also fragile to URL prefix changes |
| If Option 3 fails → Option 1 (short-code redirect, separate column) | 95-bit base62 code, no token entropy reduction, industry standard |
| CHANGELOG must explicitly note PR #347 was incomplete | Future sessions need to know the previous "fix" didn't work |

### Verification protocol (BEFORE merge)
1. Fresh register on staging → open Gmail → "Show original"
2. Confirm `Content-Transfer-Encoding: base64` on the `text/html` MIME part (not `quoted-printable`)
3. Confirm raw source has no `=\r\n` mid-URL
4. Click button → "האימייל אומת בהצלחה"
5. Same for reset-password flow
6. Mobile Gmail (iOS + Android)
7. ONLY after all pass: merge

### Next session
- If CTE-base64 worked: close MEH-331, move to MEH-305/306 (password policy)
- If CTE-base64 failed: open MEH-XXX for short-code redirect, implement Option 1

---

## 2026-04-25 Session — MEH-331 HTML email fix (verify + reset links) — INCOMPLETE

### What shipped
- Branch: `feature/meh-331-email-html-fallback` → draft PR to `staging`
- Root cause confirmed: plain-text SMTP line-wrapping truncated 87-char verify URL at ~72 chars. Email client auto-detected the continuation fragment as a standalone clickable URL. Frontend received partial token → backend 404.
- Fix: `email.py:send_email` now accepts optional `html: str | None = None`; Resend call conditionally includes `"html"` key when set.
- `auth.py:_send_verify_email` + `auth.py:_send_reset_email` both now build RTL HTML body (table layout, `dir="rtl"` + `text-align:right` belt-and-suspenders, `#2e6853` button, plain-URL fallback). Plain-text body unchanged.
- Same fix applied to `_send_reset_email` (same root cause, same overflow: 89 chars).

### Decisions this session
| Decision | Reason |
|----------|--------|
| HTML email via `html=` param on `send_email` (not a separate function) | All callers remain backward-compatible; optional param with default None |
| `text-align:right` AND `dir="rtl"` on both table AND td | Gmail forces `dir="ltr"` on outer body; belt-and-suspenders per user clarification |
| Fix `_send_reset_email` in same PR | Same root cause (89-char URL); same fix; single PR scope |
| Plain-text body kept as fallback | Resend sends both; some clients prefer text-only |

### Next session
- Wait for Gmail live test (fresh register → verify link; forgot-password → reset link)
- After BOTH pass on Gmail → user says "merge" → merge to staging
- After staging deploy: smoke test on staging.mehamakor.online
- Then: pick up MEH-305/306 (password policy)

## 2026-04-25 Session — MEH-320 verify-email 400 diagnostics (PR1 of 2)

### What shipped
- Branch: `feature/meh-320-verify-email-400-fix` → draft PR to `staging`
- Backend: `/auth/verify-email` now logs `[VERIFY-EMAIL] token_not_found ...` / `token_expired ...` / `verified ...` and returns 404 (not found) or 410 (expired) instead of bare 400. Same MEH-304 pattern applied to reset-password.
- Tests: new `tests/test_verify_email.py` — 5 cases (valid token, single-use, expired, invalid, register fires email with stored token).
- No frontend changes — `verify-email/page.js:30` reads `err.response?.data?.detail` regardless of status code; verified via grep that nothing else branches on the response status.

### Decisions this session
| Decision | Reason |
|----------|--------|
| URL-encoding hypothesis (from task brief) DISPROVED | `secrets.token_urlsafe(32)` produces only `[A-Za-z0-9_-]` — RFC 3986 unreserved chars, never re-encoded by Axios `params` or FastAPI query parser |
| Two-PR sequence: diagnostics first, fix second | Static analysis cannot identify the staging root cause; the endpoint logic appears correct. Logging is the diagnostic tool; the actual fix waits on Railway log evidence |
| Status-code split 404 / 410 (not bare 400) | Same as MEH-304 reset-password. Lets the frontend distinguish "wrong link" from "expired link" if we ever want to show different copy |
| No frontend change in this PR | `err.response?.data?.detail` works identically for 400/404/410; `Header.jsx:363` reads `email_verified` from `/auth/me`, unrelated to this endpoint |

### Next steps after merge (decision tree for PR2)
After deploy, click a real verification link in staging and check Railway logs for `[VERIFY-EMAIL]` entries:

**If `token_not_found token_prefix=...` →**
- Query staging DB: `SELECT email_verify_token FROM users WHERE email = '<test_email>'` — is the token actually stored?
- Compare DB value vs the value in the email URL (`token_prefix` in log) — any mismatch means storage / transmission bug.
- Check whether `_send_verify_email` fired with the same token that was stored (the new `test_register_stores_token_and_sends_email` test guards this at the unit level — if it passes locally but staging mismatches, the issue is environmental).
- Check for a duplicate background task firing twice → token rewritten between email send and click.

**If `token_expired user_id=… expires=… now=…` →**
- If `expires=None`: register path didn't write `email_verify_expires` — check `auth.py:104` (consumer) and `auth.py:206` (producer); also check whether the staging DB column is missing (run `\d users` in psql).
- If `expires < now`: check Railway server timezone vs `datetime.utcnow()`. Both columns are naive UTC; staging running non-UTC TZ would skew the comparison. Compare `now=` from the log against current real wall-clock UTC.
- If `expires > now` but still rejected: shouldn't be possible — re-read the comparison logic.

### Next session
- Wait on Vercel preview + CI on PR.
- After merge: pop a fresh registration in staging, watch Railway logs for `[VERIFY-EMAIL]` line, file MEH-320 follow-up with the evidence and the targeted fix.

---

## 2026-04-25 Session — MEH-318 form state bug sweep (pre-RHF cleanup)

### What shipped
- Branch: `feature/meh-318-form-state-bug-sweep` → draft PR to `staging`
- 7 fixes across `frontend/app/register/page.js` and `frontend/app/register/producer/page.js`. No password-rule changes (deferred to MEH-306). No backend, no new deps.
- Fix #2: dietary checkboxes + category multi-select now route through new `setAndSave` helper → draft persistence covers all writes (was: only text fields hit `saveDraft`)
- Fix #5: `handleEmailBlur` clears `emailExistsWarning` before early-return guard (erasing the email no longer leaves the warning stuck)
- Fix #6: back button (step 2 → step 1) clears `error` alongside `stepError`
- Fix #7: `useState` step initializer wrapped in try/catch (private mode / quota crash guard)
- Fix #8: `restoreDraft` validates parsed object shape; bad drafts dropped from localStorage
- Fix #9: step-2 submit chain clears `error` once at top for visible reset cycle
- Fix #10: stale-closure footgun on `set()` removed in BOTH register forms (functional updater)

### Decisions this session
| Decision | Reason |
|----------|--------|
| Drop the password-rule fixes (#1, #3, #4) from this PR | MEH-305 / MEH-306 will replace `passwordValid()` + `<PasswordStrength>` within days; touching either today would conflict |
| Defer the upgrade-loophole fix (consumer→producer with weak password) | Closed implicitly by MEH-306's force-logout-on-password-change design; no separate ticket needed |
| 2 commits for code (producer / consumer) instead of finer splits | Producer-file changes are interlinked via the `setAndSave` helper; artificial split would obscure intent |
| Skip local Playwright run | Sandbox has no localhost dev server or Vercel preview; CI will run on the preview |

### Next session
- Wait on Vercel preview for PR; smoke-test the 7 fixes per the format in the PR body
- After MEH-318 lands: pick up MEH-305 / MEH-306 password-policy work (the dropped Fix #1 ground)

---

## 2026-04-25 Session 1 update (Claude Chat research-6 + MEH-308 follow-up)

### Issues closed today

| MEH | Title | Status | Notes |
|-----|-------|--------|-------|
| 287 | Producer registration WhatsApp welcome | Done | yesterday actually, missed in last HANDOFF |
| 191 | Real forgot password flow | Done 10:46 | + MEH-304 reset-password 400 fix |
| 304 | reset-password 400 bug | Done 10:46 | follow-up to MEH-191 |
| 150 | Email provider migration to Resend | Done 10:18 | |
| 308 | DELETE /auth/me cascade Producer | DUPLICATE | already fixed in MEH-249 |

### Issues opened today

| MEH | Title | Status | Notes |
|-----|-------|--------|-------|
| 307 | Forgot password frontend | DUPLICATE of 191 | Claude Chat blind spot |
| 308 | DELETE cascade Producer | DUPLICATE of 249 | found via investigation |
| 309 | OAuth ghost users | Backlog Medium | blocked on MEH-297 |
| 311 | RecipeIngredient FK gap | Backlog High | new finding from MEH-308 investigation; 2 sibling FKs (`recipes.category_id`, `recipes.submitted_by`) flagged in description for separate MEHs |

### Research artifact created

- `research-6-registration-flow.md` (16KB) — registration flow E2E audit
- **Caveat:** based on AUDIT-EDGE-CASES.md (April) without cross-checking Linear Done state. 2 of 6 recommendations were duplicates of already-fixed issues. Future Claude Chat research sessions: search Linear FIRST, audit docs SECOND.

### Lessons learned

- **HANDOFF.md must be updated at end of every session** (CLAUDE.md Rule 9). 24h drift caused 2 duplicate issues to be opened today.
- **Claude Chat ≠ Claude Code.** Chat doesn't have visibility into recent commits or Linear state changes — must search before opening issues.
- **Bug Protocol step 2 (grep siblings) catches real gaps.** MEH-308 investigation found RecipeIngredient FK gap that no audit caught, plus 2 additional sibling FKs missing `ondelete` (`recipes.category_id`, `recipes.submitted_by`).

### Next session

- Decide: which High-priority issue from Backlog ships next?
  Candidates: MEH-198 (email verify resend), MEH-258 (SECURITY-CHECKLIST), MEH-301 (mirror loud-error pattern), MEH-272 (Producer CHECK constraints), MEH-311 (RecipeIngredient FK gap — quick win, scoped tightly).
- MEH-297 + MEH-290 are big features — separate planning needed.

---

## 2026-04-25 Session — MEH-244 production drift diagnosis

### What shipped
- PR #339 (draft) — `feature/meh-244-close-production-drift → staging`
- Cross-env probe confirmed **Drift count: 0** — staging and production are in sync
- `.github/workflows/deploy.yml` — `continue-on-error: true → false` on both `api-contract-static` and `api-contract-probe-staging`; CI now gates PRs as intended
- `docs/AUDIT-API-CONTRACT.md` — MEH-244 closed with probe result; 23 dead routes triaged (4 delete candidates: `GET /admin/producers/pending`, `POST /admin/producers/{id}/reject`, `GET /admin/stats`, `PUT /admin/reviews/{id}/hide`)
- `docs/CHANGELOG.md` — one-line entry added
- `.github/workflows/e2e.yml` — removed `startsWith(environment, 'Preview')` filter that caused 2-second failure on every E2E run (confirmed root cause)

### Next tasks

1. **Review + merge PR #339** (docs + CI config only — no mobile testing needed, no adversarial needed since no code changed)
2. **4 delete-candidate routes** — open a separate MEH ticket before removing (each needs IDOR/test audit first per security rule); routes: `GET /admin/producers/pending`, `POST /admin/producers/{_}/reject`, `GET /admin/stats`, `PUT /admin/reviews/{_}/hide`
3. **staging → main promotion** — main is behind staging by many commits

## 2026-04-25 Session — MEH-150 + MEH-304

### What shipped

**MEH-150 (PR #335 — merged to staging):** Completed Resend migration paper trail.
- `backend/.env.example`: removed SMTP_* vars, added RESEND_API_KEY section
- `marketing.py`, `experiences.py`, `admin_experiences.py`: stale "SMTP" comments → "Resend / RESEND_API_KEY"
- `docs/CHANGELOG.md`: entry added

**MEH-304 (PR #337 — draft, open):** Observability-first diagnosis PR for `/auth/reset-password` returning 400 in production.
- `backend/app/routers/auth.py`: split combined `400` into `404` (token not found, `[RESET] token_not_found`) and `410` (token expired, `[RESET] token_expired`). Added `[FORGOT-PW] token_stored` and `[RESET] password_updated` log lines.
- `frontend/app/reset-password/page.js`: error handler now checks HTTP status codes (404/410) instead of Hebrew string matching.
- `tests/test_api.py`: `TestResetPasswordFlow` — 5 test cases: happy path, 404, 410, 422, short password. Closes MEH-191 test gap.

### PR #337 CI status

All 5 CI failures are **pre-existing on staging** — same pattern as PR #335 (docs-only). All complete in <2 seconds (physically impossible for real test runs). No action needed.

### Next task (MANDATORY after PR #337 merges to staging)

1. Wait for Railway redeploy to complete
2. Trigger forgot-password for a real user on staging (e.g. `sapir000s@gmail.com`)
3. Open Railway logs → paste the `[FORGOT-PW] token_stored` log line here
4. Click the reset link from the email → submit the form
5. Paste the resulting log line (`[RESET] token_not_found` OR `[RESET] token_expired` OR `[RESET] password_updated`)
6. Based on the log: write the actual fix (MEH-304 root cause fix — separate PR)

**If `[RESET] token_not_found` fires:** token is not being written to DB, or a different token is stored than the one in the email. Check `forgot_password` → `user.reset_token = token` → `db.commit()` path, and compare token in `[FORGOT-PW] token_stored` log vs token prefix in `[RESET] token_not_found` log.

**If `[RESET] token_expired` fires:** `reset_token_expires_at` is in the past when reset is attempted. Check timezone drift (DB `now()` vs Python `datetime.utcnow()`).

### Open PRs

| PR  | MEH     | Title                                                       | Status |
|-----|---------|-------------------------------------------------------------|--------|
| 337 | MEH-304 | obs: structured logging + 404/410 split for /auth/reset-password | Draft — needs Vercel preview test + merge |
| 339 | MEH-244 | ci: flip api-contract CI to hard failure after 0-drift confirmation | ✅ Merged to staging 2026-04-25 |

### Decisions this session

| Decision | Reason | Date |
|----------|--------|------|
| Cross-env probe via `foodmamkor-staging.up.railway.app` (not `staging.mehamakor.online`) | The Railway URL returned responses; both point to same container | 2026-04-25 |
| All 4 admin alias delete candidates need separate MEH ticket | Deletion requires IDOR/test audit; can't do inline | 2026-04-25 |
| Observability-first for MEH-304 (no fix yet) | Root cause cannot be determined from static analysis; DB query confirmed code bug but not which branch fires | 2026-04-25 |
| No token_version increment in reset flow | Out of scope per user direction — pending separate session-invalidation policy research | 2026-04-25 |
| Frontend error handler: HTTP status codes not Hebrew string matching | Status codes are stable; Hebrew string matching is fragile across content changes | 2026-04-25 |
| Remove `startsWith(environment, 'Preview')` from e2e.yml | Vercel environment naming inconsistent across SDK versions; filter always false; tests are read-only, safe against any deployment | 2026-04-25 |

---

## 2026-04-25 Session — MEH-287 WhatsApp welcome

### What shipped
- `backend/app/schemas/schemas.py` — new `ProducerRegistrationResponse(Token)` adds `whatsapp_sent: bool`
- `backend/app/routers/auth.py`: pre-flight `whatsapp_expected`; silent return → `logger.error`; `logger.warning` → `logger.error(exc_info=True)`; returns bool
- `frontend/app/register/producer/page.js` — step-3 success screen copy + banner conditional on `whatsapp_sent` (default `true` for older servers)
- `tests/test_whatsapp_notify.py` — 3 cases: missing Twilio env, full env + Twilio stubbed, missing phone

### Accident + fix
PR #329 was accidentally merged to `main` instead of `staging`.
- PR #332 (hotfix/revert-pr-329) reverted it from `main` ✅
- PR #333 (feature/meh-287-whatsapp-welcome-fix → staging) re-landed it correctly ✅

### Sibling audit findings
6 endpoints in `auth.py` still return naked `Token` with silent-fail side effects (`/register`, OAuth). Proposed follow-ups logged in Linear.

---

## 2026-04-25 Session 6 update — PR cleanup batch + MEH-265

### What was done

**PR cleanup batch:**
- PR #332 merged to `main` — reverted accidental MEH-287 merge (#329) to production
- PR #333 merged to `staging` — MEH-287 (whatsapp_sent flag) via correct flow; all CI green
- PR #330 closed as duplicate — same branch/HEAD as already-merged PR #331 (MEH-258)
- PR #322 closed as stale — Session 4 HANDOFF draft, superseded by Session 5 + this session

**MEH-258 confirmed live on staging** (PR #331, commit `89cad07`):
`docs/SECURITY-CHECKLIST.md`, `CLAUDE.md` docs map pointer, `.github/pull_request_template.md` trap reference.

**MEH-265 post-mortem written** — `docs/INCIDENTS/2026-04-migrate-columns-drift.md`:
covers the 2026-04-23 `/auth/login` 500 incident, why CI didn't catch it, the bundled-hotfix
mistake, and prevention (MEH-266 checklist + MEH-267 Alembic). PR template Database Checklist
updated to reference Alembic instead of stale `_migrate_columns()` wording.

### Staging verifications (2026-04-25, end of session)

- ✅ **MEH-299 verified** — Google login → `avatar_url` starts with `https://res.cloudinary.com`
- ✅ **MEH-300 verified** — `/producer/dashboard` loads with no 422 in Network tab

### Next tasks

1. **CSP cleanup (MEH-298 follow-up):** Remove `*.googleusercontent.com` from `img-src` in `next.config.js` — MEH-299 confirmed working, stopgap no longer needed for new logins. Keep entry until old users have cycled through (safe to remove in next session).
2. **MEH-271 check** — branch `feature/meh-271-arch-smell-detection` was pushed in Session 4. Verify it landed via PR #334 (`e5cb9c1` in staging log) or open a PR if still pending.

### Open PRs

None actionable. All stale drafts closed.

### Decisions this session

| Decision | Reason | Date |
|----------|--------|------|
| Close PR #330 instead of rebasing | Same branch/HEAD already merged as PR #331; conflict was "add/add" on SECURITY-CHECKLIST.md | 2026-04-25 |
| Close PR #322 instead of merging | Session 4 HANDOFF content superseded; staging HEAD already has Session 5 updates | 2026-04-25 |
| Revert PR #329 via PR #332 to main | MEH-287 was accidentally merged to main instead of staging; revert restores production to correct state | 2026-04-25 |

---

## 2026-04-24 Session 6 update

### Opened this session

| PR  | MEH     | Title                                                       | Status |
|-----|---------|-------------------------------------------------------------|--------|
| 335 | MEH-150 | docs: complete Resend migration — .env.example + stale SMTP comments | Draft, CI green |

### What was done

**MEH-150** — The core email migration (email.py, config.py, pyproject.toml `resend==2.29.0`, tests) was already complete from a prior session. This PR finishes the paper trail:
- `backend/.env.example`: removed `SMTP_HOST/PORT/USER/PASSWORD`, added `RESEND_API_KEY` section with setup instructions
- `marketing.py`, `experiences.py`, `admin_experiences.py`: updated in-code comments that still referenced "SMTP" → "Resend / RESEND_API_KEY"
- `docs/CHANGELOG.md`: entry added

Sentry logging skipped — Sentry is not installed anywhere in this project.

### Vercel preview
`food-mamkor-git-feature-m-4f9aa8-levismadar80-ship-its-projects.vercel.app` (building at session end)

### Next tasks (after PR #335 merges)
1. Merge PR #322 (HANDOFF docs-only, no CI gate needed)
2. Verify MEH-299 on staging: Google login → `avatar_url` starts with `https://res.cloudinary.com`
3. Verify MEH-300 on staging: `/producer/dashboard` no longer shows 422
4. Manual email test: trigger welcome email on staging → confirm received (check Resend dashboard → Emails tab)

---

## 2026-04-24 Session 5 update

### Merged this session

| PR  | MEH     | Title                                              | Notes |
|-----|---------|----------------------------------------------------|-------|
| 327 | MEH-300 | Fix GET /producers/me → 422 (router ordering)      | `producer_me.router` moved before `producers.router` in `main.py:143–147`. 4 regression tests added. |
| 328 | MEH-299 | Self-host Google OAuth avatars to Cloudinary       | `_upload_google_avatar_or_none()` helper in `auth.py`. 5 call sites patched. 5 unit tests added. |

### Task 2 (MEH-298)
Already completed as PR #325 in a prior session. Skipped.

### What was fixed

**MEH-300 root cause:** `producers.router` has no prefix and registers `/producers/{producer_id}` (catch-all). It was included at `main.py:145` before `producer_me.router` at `main.py:147`. FastAPI matches in registration order, so `GET /producers/me` was captured with `producer_id="me"`, failing UUID parse → 422. Fix: swap include order.

**MEH-299 design:** New `_upload_google_avatar_or_none(picture_url)` helper in `auth.py` (lines ~22–69). Downloads via `httpx.get(timeout=5)`, uploads to `mehamakor/avatars/` (400×400 face crop), returns Cloudinary `secure_url`. Fail-open on any error — login never blocked. Dev fallback (no `CLOUDINARY_CLOUD_NAME`) returns original URL unchanged. Computed once per OAuth flow to avoid double-upload for new users.

### Verification for MEH-299
After Railway staging deploy: log in with Google → DevTools → `GET /auth/me` → `avatar_url` should start with `https://res.cloudinary.com`. Existing users with old `googleusercontent.com` URLs need to log out + back in (backfill only runs when `avatar_url` is empty).

### Open PRs (live)

| PR  | MEH     | Title                          | Status | Notes |
|-----|---------|--------------------------------|--------|-------|
| 322 | —       | Session 4 HANDOFF update       | Draft  | Docs-only, needs merge |
| 273 | MEH-242 | Pre-launch edge cases audit    | Draft  | Stale 48h+ |

### Next tasks

1. Merge PR #322 (HANDOFF update — docs only, no CI gate needed)
2. Verify MEH-299 on staging: Google login → `avatar_url` = Cloudinary URL
3. Verify MEH-300 on staging: `/producer/dashboard` no longer shows 422 in Network tab
4. Consider removing `*.googleusercontent.com` from CSP `img-src` in `next.config.js` once MEH-299 is confirmed working

### Decisions this session

| Decision | Reason | Date |
|----------|--------|------|
| Fix MEH-300 via router reorder (not adding a new route) | `producer_me.py` already had `@router.get("")` — bug was purely in `main.py` include order | 2026-04-24 |
| MEH-299 helper in `auth.py` (not a shared util file) | Single call site in one module; extraction would add a file for no reuse benefit | 2026-04-24 |
| MEH-299 fail-open on any error | Login must never be blocked by a non-auth service; Cloudinary/httpx errors are non-critical | 2026-04-24 |

---

## 2026-04-25 Session 4 update (MEH-271 + MEH-258)

## 2026-04-25 Session 4 update

### Opened this session

| PR  | MEH     | Title                                              | Status |
|-----|---------|----------------------------------------------------|--------|
| —   | MEH-271 | Arch smell detection section in workflow.md        | Pushed, not yet opened as PR — branch `feature/meh-271-arch-smell-detection` |
| —   | MEH-258 | SECURITY-CHECKLIST.md (7 traps, broken→fix→verify) | Pushed, not yet opened as PR — branch `feature/meh-258-security-checklist` |

### Linear tickets closed this session

- **MEH-271** — marked Done ✅
- **MEH-258** — pending close (after this commit)

### What was done

**MEH-271** — new `## Architectural smell detection` section in `.claude/rules/workflow.md`.
Two smells: (1) two parallel mechanisms owning the same state, (2) "remember to update X when Y" phrases in docs.
Includes grep commands to detect, and escalation rule (open Linear ticket, don't fix inline).

**MEH-258** — rewrote `docs/SECURITY-CHECKLIST.md` from scratch to match Linear spec:
7 past-incident traps (MEH-256/254/248/163/241/249/244), each with broken pattern → why → fix → question → verify command.
Also: CLAUDE.md docs map pointer added, PR template reference added, env-var table, copy-paste PR checklist.

### DoD status (MEH-258)

- [x] `docs/SECURITY-CHECKLIST.md` — 7 concrete traps, broken→fix→verify format
- [x] `CLAUDE.md` docs map — pointer added after `SECURITY.md` row
- [x] `.github/pull_request_template.md` — reference added under "auth or permissions changed"
- [x] `HANDOFF.md` — this update
- [ ] Build green — docs-only, no code changed, CI should pass trivially
- [ ] PRs not yet opened — both branches pushed

### Next tasks

1. Open PRs for MEH-271 + MEH-258 (branches already pushed)
2. Continue session 3 follow-ups:
   - Verify staging `/auth/me` 200 for a producer user (MEH-283 post-merge check)
   - Verify staging `/login` + Google OAuth on staging.mehamakor.online (MEH-274)
   - Merge PR #320 (MEH-286) after CI green — docs-only
3. MEH-280 + MEH-281 — two remaining failing Playwright specs

### Note on PR template stale section

`.github/pull_request_template.md` still references `_migrate_columns()` in the Database Checklist
section (lines 50–55). That function was deleted in MEH-267 (PR #311). The section is now misleading.
Separate cleanup task needed — not in scope of MEH-258.

---

## 2026-04-24 Session 3 update

### Merged this session

| PR  | MEH     | Title                                         | Notes |
|-----|---------|-----------------------------------------------|-------|
| 318 | MEH-274 | `useGoogleSignIn` singleton hook + COOP fix   | Merged to staging. Preview OAuth skipped — Google doesn't allow wildcard origins |
| 306 | MEH-266 | DB migration PR template                      | Rebased onto staging (`git rebase origin/staging`), CI passed, merged |
| 319 | MEH-283 | `rejection_reason` ORM column + Alembic migration `b2e8f947c316` | URGENT hotfix — `/auth/me` returned 500 for all producer users post MEH-267. Two commits: ORM model + migration file, then CI drift gate update (`EXPECTED_REV`) |

### Opened this session

| PR  | MEH     | Title                                | Status |
|-----|---------|--------------------------------------|--------|
| 320 | MEH-286 | File preservation protocol           | Draft — docs/config only, CI running |

### Critical follow-up (MEH-283)

Railway auto-runs `alembic upgrade head` on every deploy (wired in MEH-267 Dockerfile). Merging PR #319 to staging triggers a Railway redeploy which applies migration `b2e8f947c316` (adds `producers.rejection_reason`). **Verify staging `/auth/me` returns 200 for a producer account** — if still 500, check Railway deploy logs.

### New Alembic convention established

Every new Alembic migration PR must update `EXPECTED_REV` in `.github/workflows/pr-checks.yml`. Current head: `b2e8f947c316`. Table count: 34.

### MEH-286 Linear ticket

Marked **Done**. PR #320 linked.

### Open PRs (live)

| PR  | MEH     | Title                          | Status | Notes |
|-----|---------|--------------------------------|--------|-------|
| 273 | MEH-242 | Pre-launch edge cases audit    | Draft  | Stale 48h+ |
| 299 | MEH-173 | Install marketing skills (38)  | Ready  | MEH-280/281 specs blocking |
| 320 | MEH-286 | File preservation protocol     | Draft  | CI running |

### Next tasks

1. Verify staging `/auth/me` 200 for a producer user (MEH-283 post-merge check)
2. Verify staging `/login` console clean + Google OAuth works on staging.mehamakor.online (MEH-274 post-merge manual check)
3. Merge PR #320 (MEH-286) after CI green — docs-only, no mobile testing needed
4. MEH-280 (`08-calendar-view` aria-label mismatch) + MEH-281 (`07-gps-button` NaN race) — pre-existing Playwright flakes

---

## 2026-04-24 Session 2 update (post-merge batch)

Updated ~15:00 UTC. Supersedes the MEH-277 reality-check block below.

### Open PRs (live)

| PR  | MEH     | Title                          | Status | CI blocker        |
|-----|---------|--------------------------------|--------|-------------------|
| 273 | MEH-242 | Pre-launch edge cases audit    | Draft  | stale 48h         |
| 299 | MEH-173 | Install marketing skills (38)  | Ready  | MEH-280/281 specs |
| 306 | MEH-266 | DB migration PR template       | Ready  | build+lint FAIL — needs rebase onto staging |

### Recently merged (session 2 batch — 2026-04-24)

- **PR #315 (MEH-277)** — HANDOFF.md reality-check refresh. Merged ~10:50.
- **PR #307 (MEH-264)** — Vercel Automation Bypass Secret wired into `e2e.yml` + `playwright.config`. Playwright bypass now working. Merged ~11:30.
- **PR #316 (MEH-278)** — COOP header `same-origin-allow-popups` in `next.config.js` for Google One Tap / FedCM. Merged ~15:00.
- **PR #317 (MEH-279)** — Replace `networkidle` with `domcontentloaded` + explicit `waitForSelector` in `07-gps-button` and `08-calendar-view` E2E specs. Merged ~15:00.

PRs #309 and #310 (old branch names without MEH numbers) were closed and replaced by #317 and #316 respectively.

### Known open issues

- **MEH-274: OAuth regressions post-#302.** PR #316 (COOP header) now merged — covers Bug 3 (postMessage block). Remaining scope: multi-init GSI warning, 409 on `/register/producer/oauth`. No branch yet.
- **MEH-280: `08-calendar-view.spec.ts` — `role="grid" aria-label="לוח שנה"` not found.** Test/component mismatch from MEH-107 (PR #298). Playwright now runs but spec fails. Do not block other PRs on this — it predates all recent work.
- **MEH-281: `07-gps-button.spec.ts` mobile — Leaflet `NaN,NaN` console errors.** Race condition between geolocation mock and Leaflet map init in CI. Mobile viewport only. Same status as MEH-280.
- **MEH-269: Playwright E2E flake** — partially resolved. MEH-280 + MEH-281 are the two remaining known-failing specs. Once those are fixed, E2E should be clean.

### Blockers

- **PR #306 build+lint failing** — template-only change (`.github/pull_request_template.md`) but base is stale. Needs `git rebase origin/staging` before CI will pass.
- **MEH-280 + MEH-281** — two Playwright specs now known-failing. Any PR that touches calendar or GPS map will show Playwright red until these are fixed. They are pre-existing and unrelated to recent merges.

### Linear tickets created this session

- MEH-278: COOP header for Google OAuth (retroactive — PR #316 merged)
- MEH-279: Replace networkidle in Playwright (retroactive — PR #317 merged)
- MEH-280: Fix `08-calendar-view` spec aria-label mismatch
- MEH-281: Fix `07-gps-button` mobile Leaflet NaN race condition

Note: MEH-278 and MEH-279 were created retroactively (Linear free-tier blocked earlier; resolved later in session).

---

## 2026-04-24 Reality-check (MEH-277)

Audit after multiple parallel sessions landed work without coordinated handoff. The sections below reflect live state as of 2026-04-24 ~10:30 UTC. Older "## Current" / "## Previous" sections below are preserved for history but **superseded** by this block.

### Open PRs (live) — superseded, see block above

| PR  | MEH     | Title                          | Status | CI blocker        |
|-----|---------|--------------------------------|--------|-------------------|
| 273 | MEH-242 | Pre-launch edge cases audit    | Draft  | stale 48h         |
| 299 | MEH-173 | Install marketing skills (38)  | Ready  | Playwright only   |
| 306 | MEH-266 | DB migration PR template       | Ready  | build+lint FAIL   |
| 307 | MEH-264 | Vercel bypass for Playwright   | **MERGED** | —            |
| 309 | (none)  | Replace networkidle waits      | **CLOSED** (→ #317) | —     |
| 310 | (none)  | COOP header for Google OAuth   | **CLOSED** (→ #316) | —     |

Older "## Open PRs" table lower in this file (listing #265–#274) is stale — those PRs have all been resolved long ago.

### Recently merged (this session batch)

- **PR #311 (MEH-267)** — Alembic migration scaffold; `_migrate_columns()` removed, Alembic is sole schema authority. Merged 04-24 09:57.
- **PR #312 (MEH-275 retroactive; branch said MEH-261)** — "My environment" section added to CLAUDE.md. Merged 04-24 ~10:00.
- **PR #313 (MEH-276 retroactive; branch said MEH-262)** — "Commit discipline" section added to CLAUDE.md. Merged 04-24 ~10:15.

The `MEH-261` / `MEH-262` numbers on those two branches were **already taken in Linear** when the parallel session picked them — see MEH-275 + MEH-276 for the number-collision story and the retroactive remap.

### Known open issues

- **MEH-274: OAuth regressions post-#302.** Blocked by PR #310 (COOP header) merge — see Linear for full scope. The root-cause DB-column gap from MEH-206/MEH-192 was already resolved via MEH-267 Alembic; MEH-274 covers the remaining OAuth/FedCM surface (COOP, multi-init GSI warnings, 409 on `/register/producer/oauth` when fired from wrong page).
- **MEH-269: Playwright E2E flake** — non-blocking; tracked.

### Blockers

- **Playwright E2E fails on every recent PR.** PR #307 (Vercel protection bypass) unblocks E2E signal for all others. Merge order: **#307 first → re-run CI on #299 / #309 / #310 / #306** before merging any of them. (**RESOLVED — #307 merged this session.**)
- **PR #306 has Frontend build + Frontend lint failing** despite being a template-only change (`.github/pull_request_template.md`). Investigate before merge — likely base-branch divergence or stale CI cache; the template text itself cannot break the build.

### Stale branches to clean up (cleanup is a separate task)

- `hotfix/meh-206-meh-192-migrate-columns` — **dead code** post-MEH-267. The `_migrate_columns()` function this hotfix patches was deleted in PR #311. Abandon.
- **11 `claude/*` branches** violate Rule 3 / locked decision ("No `claude/*` branches. Use `feature/*`."). Cleanup candidates after confirming no unique unmerged work.
- **~60 stale `feature/*` branches** from before 2026-04-22 — most were squash-merged (squash hides original SHA so `git branch --merged` misses them). Cleanup candidates after per-branch SHA verification.

### Lessons learned

> **Before picking a MEH number for a new branch, verify in Linear the number is either unused or already your own ticket.** Collision evidence: MEH-261 and MEH-262 were both stolen by parallel sessions on 2026-04-24 (see MEH-275, MEH-276).

> **Single-session rule still being violated.** At least 3 parallel sessions landed work on 2026-04-24 (Alembic, E2E/OAuth fixes, doc edits). Rule 1 explicitly forbids this — the collision above is the predictable consequence. Every session start must grep remote branches by author+timestamp before picking a task.

### Promotion to main

- Main is behind staging by many commits. No promotion plan recorded yet. Follow-up task.

---

## Current — MEH-267 Alembic migration scaffold (2026-04-24)

**Branch:** `feature/meh-267-alembic-migration`
**PR:** #311 (draft) — `feature/meh-267-alembic-migration → staging`

**What was done (10 commits):**
1. `fb1a0a6` — Alembic scaffold + baseline revision (steps 1-2)
2. `4b8034b` — promote search_queries to ORM + GIN index, regen baseline (34 tables, `ef8fb1858f5b`)
3. `e70c862` — delete `_migrate_columns` (258 lines) — Alembic now owns schema
4. `f4ec1f7` — hotfix: remove `_migrate_columns` import/call from `tests/conftest.py` (ImportError)
5. `d5a3532` — refactor: remove `Base.metadata.create_all` from boot path + comment rot
6. `68fd3b8` — Dockerfile: prepend `alembic upgrade head &&` to Railway start command
7. `09ba725` — CI: migration drift gate (fresh Postgres → upgrade head → verify 34 tables + baseline rev)
8. `e05036a` — docs: `docs/MIGRATIONS.md` Hebrew developer guide
9. `ef6d361` — docs: CLAUDE.md adds locked decision + documentation map entry

**Root cause fixed (MEH-206, MEH-192):**
Dual schema mechanism (`create_all` on boot + `_migrate_columns` DDL) caused silent column drift.
Both removed. Alembic is the sole schema authority. Baseline `ef8fb1858f5b` stamped on staging + production.

**Known follow-ups (not in this PR):**
- MEH-269: Playwright E2E flake (~4m31s timeout on PRs #308/#310/#311). Pre-existing, non-blocking.
- MEH-XXX: Add `alembic check` to CI — catches ORM/migration drift that `upgrade head` misses.

**PR #311 DoD status:**
- [x] `npm run build` passes (build job green)
- [x] `pytest tests/test_api.py` passes (migration drift gate + pytest job green)
- [ ] `/adversarial-review` not yet run
- [ ] Not yet undrafted/ready for review

**Rollback plan (documented in PR #311 description):**
If `alembic upgrade head` fails on Railway deploy:
1. Railway auto-retries per `restartPolicyMaxRetries: 10` — check logs first.
2. Force-redeploy previous image from Railway dashboard (Deployments → previous → Redeploy).
3. If migration is the root cause: fix the revision file, push, Railway picks up new image.
4. For schemata that need explicit downgrade: use Railway Shell → `alembic downgrade -1`.

**Next step:** Run `/adversarial-review` on changed files, then unmark draft and request review.

---

## Previous — MEH-262 GPS test + staging build fix (2026-04-23)

**Branch:** `feature/meh-262-fix-gps-test-modal-handling`
**PR:** #305 (draft) — `feature/meh-262-fix-gps-test-modal-handling → staging`

**What was done:**
1. Diagnosed failing Playwright E2E tests — root cause was LocationModal (z-[9000]) masking the GPS button (z-[1000]) 800ms after page mount (test ran against a fresh localStorage with no `user_city`).
2. Fixed `07-gps-button.spec.ts` — added LocationModal dismiss via "דלגי לעכשיו" button (try/catch in case modal doesn't appear), and scoped GPS button locator to `:visible` to handle dual-MapClient DOM (both desktop + mobile containers render in parallel).
3. Fixed staging build (`Failed to compile`) — `settings/page.jsx` was missing `import Image from "next/image"`, `Plus`/`Package`/`Trash`/`X` from `@phosphor-icons/react`, and `const [phone, setPhone] = useState(user.phone || "")` — all lost when MEH-206 (#259) rewrote the file without carrying forward MEH-88's product section imports.

**Linear issues filed:**
- MEH-262: GPS test LocationModal flow fix ✅ (this PR)
- MEH-263: LocationModal z-index architecture concern (separate issue, not fixed yet)
- MEH-264: Vercel Automation Bypass Secret missing from E2E CI (separate issue, not fixed yet)

**PR #305 DoD status:**
- [x] `npm run build` passes (confirmed locally after import fix)
- [ ] CI checks need to go green on push — waiting for CI run
- [ ] `/adversarial-review` not yet run
- [ ] Not yet undrafted/ready for review

**Next step:** Wait for CI on PR #305. If green, run `/adversarial-review`, then unmark draft. PR #299 (MEH-173 marketing skills) was undrafted last session and may be ready to merge — check its CI status.

## Most recent — MEH-259 smoke test (2026-04-22, late night)

Seven-check post-deploy verification script. Fails loudly when a
security primitive is wrong. Covers MEH-256 (rate-limit isolation),
MEH-254 (IDOR), MEH-248 (password min_length), plus invariants
(auth required, security headers, CORS strict, rate-limit enforcement).

Files:
- `scripts/smoke_test.py` — 7 check functions + runner
- `scripts/smoke_test_prod.sh` — bash wrapper
- `docs/SMOKE-TEST.md` — runbook + add-a-check guide

Run: `scripts/smoke_test_prod.sh` (defaults to production) or
`scripts/smoke_test_prod.sh https://foodmamkor-staging.up.railway.app`.

**Not in CI yet** — run manually first, wire into the deploy workflow
as a follow-up once it's consistently green.

## MEH-256 rate-limit fix (PR #296, merged `2938ec9`)

Real fix using `X-Real-IP` as the primary signal (unspoofable, set by
Railway edge from own TCP-peer view). Supersedes PR #286 (closed as
superseded). Removes MEH-256 debug probe from rate_limit.py.

**⏭ Required ops action before the fix has effect:**
Set `TRUSTED_PROXY=1` on Railway staging + production backend
Variables. Without it the key function falls through to
`get_remote_address` and the bug persists. See `docs/DEPLOYMENT.md` §D.

## MEH-257 closed as Duplicate

Created earlier in the session before MEH-256 stabilized as the
canonical id. Same bug, same fix — MEH-256 closes it.

---

## Earlier in the session — MEH-260 staging deploy drift (2026-04-22, evening)

**Incident:** Railway `foodmamkor-staging` was running stale code for
**weeks**. Discovered during MEH-256 investigation when access logs
showed 404s on endpoints that exist in `staging` HEAD. Full writeup:
`docs/INCIDENTS/2026-04-staging-deploy-drift.md`.

**Two stacked root causes:**
1. Railway staging env's GitHub source was pointing at `main`, not
   `staging`. **User fixed via dashboard.**
2. Railway's BuildKit rejects the uv cache mount without a
   service-specific id. **Fixed in code** — PR #291
   (`458d651`) removed the cache mount entirely.

**Merged this session (all on `staging`):**
- #287 debug XFF logging → **reverted** via #288 before causing issues
- #288 revert MEH-256 debug
- #289 add `id=uv-cache` (first attempt — Railway rejected)
- #290 **closed** (merge conflict — superseded by #291)
- #291 remove uv cache mount (second attempt — expected to work)

**Current state — AWAITING HUMAN VERIFICATION:**
- Last staging commit: `458d651`
- Railway build should now succeed; user must verify:
  ```bash
  BACKEND=https://foodmamkor-staging.up.railway.app
  curl -s "$BACKEND/health"
  curl -s "$BACKEND/holiday-mode"
  python scripts/check_api_contract.py --probe "$BACKEND"
  ```

**Implications:**
- The 9 PRs merged earlier today (MEH-247/248/249/250/251/252/253/254/255)
  were all in a vacuum — all CI passes are meaningless until the
  probe confirms 0 orphans. Re-verify every CRITICAL/HIGH once staging
  is actually live (MEH-254 IDOR fix is the top priority).
- **MEH-244 (production drift)** is suspected to be the SAME root
  cause. Do NOT touch production until staging verification is clean.
- **MEH-256 XFF investigation** is blocked — debug `print` was removed
  in #288. If still needed, open a follow-up to re-add as structured
  `log.info` (cleaner lifecycle).

**Prevention follow-up (not done in this session):**
- Flip `api-contract-probe-staging` in `.github/workflows/deploy.yml`
  from `continue-on-error: true` to hard failure once baseline shows
  0 orphans.
- Add a weekly deploy-freshness check script.

---

## Previous — MEH-242 audit session + 9 PR batch (2026-04-22, day)

10 Linear issues opened from MEH-242 audit (MEH-246…255); 9 merged to
staging over the afternoon. Details in Linear / commit log. All of
those merges are **subject to re-verification** pending MEH-260
confirmation that staging is now running the right code.

## Open PR (MEH-245 deployment verification — 2026-04-22)
PR: #277 (feature/meh-245-deployment-verification → staging, draft, 3 commits)
Summary:
  MEH-245 pivoted mid-session from "frontend↔backend contract audit" to
  "deployment verification tool" after discovering the three console 404s
  flagged in MEH-244 were not static code drift:
    - /holiday-mode → exists at backend/app/main.py:407 on staging
      (commit 663e3b7). Root cause is staging↔production deploy drift.
    - /admin/group-buys → exists at backend/app/routers/group_buys.py:19
      (admin_router registered at backend/app/main.py:395). Same cause.
    - /auth/profile-image → lives only on the unmerged MEH-243 branch.
      Out of scope here; MEH-243 will ship both sides together.

  Shipped in this PR:
    - docs/AUDIT-API-CONTRACT.md — post-mortem + runbook for the 3 modes
    - scripts/check_api_contract.py — static / --probe URL / --cross-env.
      Static on staging: 178 frontend call sites, 154 backend routes,
      0 orphan frontend calls, 0 method mismatches, 23 dead backend
      routes flagged for triage (not deleted here).
    - .github/workflows/deploy.yml — two warn-only jobs
      (api-contract-static on every PR/push, api-contract-probe-staging
      after staging Railway redeploy). Flip to hard failure after MEH-244.

  MEH-244 was re-scoped in Linear to a post-MEH-245 diagnosis task — run
  the cross-env probe against production, redeploy if drift confirmed,
  close as not-reproducible otherwise.

Next (after #277 merges):
  1. Wait for staging redeploy, then run MEH-244 cross-env probe:
     `python scripts/check_api_contract.py --cross-env \
       --staging https://staging.mehamakor.online \
       --prod https://mehamakor.online`
     and triage per docs/AUDIT-API-CONTRACT.md → "The three known 404s".
  2. After MEH-244 closes with prod green, flip both CI jobs in
     .github/workflows/deploy.yml from `continue-on-error: true` to hard
     failure.
  3. Triage the 23 dead backend routes listed in docs/AUDIT-API-CONTRACT.md.

---

## Last session merged to staging (MEH-87 + MEH-83 + MEH-84 — 2026-04-22)
PRs opened this session:
  - #270 (MEH-87): Tab focus trap in LoginPromptModal — draft, CI pending
  - #272 (MEH-83): Lightbox on gallery images — draft, CI running
  - #274 (MEH-84): GPS center button on /map — draft, CI queued
PRs merged this session:
  - #264 (uv migration, claude/migrate-pip-to-uv-8p7aT) — merged to staging ✅

MEH-87 (Task 1) — LoginPromptModal Tab focus trap:
  Root cause: focus trap was missing (only ESC was handled, not Tab/Shift+Tab).
  Fix: `modalRef` on dialog div + Tab/Shift+Tab handler in existing `handleKey`
  useEffect; cycles through all focusable elements within the dialog.
  File: frontend/components/LoginPromptModal.jsx

MEH-86 (Task 2) — Infinite scroll on /producers:
  SKIPPED — spec pre-condition not met: requires ≥50 producers in DB, only 5.

MEH-83 (Task 3) — Lightbox on gallery images:
  New file: frontend/components/Lightbox.jsx (pure React, zero deps)
  Updated: frontend/components/ImageGallery.jsx — image wrapped in <button>,
    opens Lightbox on click; focus returns to trigger button on close.
  CSS: globals.css — lightboxFadeIn 200ms + lightboxImgFade 150ms keyframes.
  RTL: ArrowLeft=next, ArrowRight=prev; nav arrows use start-4/end-4.
  A11y: role=dialog, aria-modal, Tab trap, focus-on-close, body scroll lock.
  Test: frontend/e2e/flows/06-lightbox.spec.ts

MEH-84 (Task 4) — GPS center button on /map:
  Updated: frontend/app/map/MapClient.jsx
  Button: absolute bottom-24 end-4, 44×44px, z-[1000], hidden lg:flex (desktop only).
  Icon: NavigationArrow → CircleNotch spinner during wait.
  3 per-error-code toasts: denied / unavailable / timeout in Hebrew.
  NaN guard before flyTo. Mobile unchanged (has its own "קרוב אלי" in filter bar).
  Test: frontend/e2e/flows/07-gps-button.spec.ts

## Previous last session (uv migration — 2026-04-22)
PR: #264 (claude/migrate-pip-to-uv-8p7aT) — merged to staging ✅
Root cause: `requirements.txt` had no transitive pins; `slowapi`'s
  transitive deps resolved incompatibly with `fastapi==0.115.6` in CI.
Changes: backend/requirements.txt removed; pyproject.toml + uv.lock added;
  Dockerfile pip→uv; pr-checks.yml setup-uv@v3; docs/DEPLOYMENT.md §8+§9.

## Previous last session
Date: 2026-04-22
PRs merged: none this session
PRs open: #265 (MEH-236), #266 (MEH-187), #267 (MEH-88 — all CI green), #268 (MEH-89 — CI running)
Summary:
  MEH-236 (Task 1) — CardHeart can't undo favorite (heart stays filled after second click):
    Root cause: `guestSaved` state never reset on login, so `filled = favorited || guestSaved`
    stays true. Fix: `setGuestSaved(false)` at top of useEffect when user is defined.
    Secondary fix: DELETE 404 treated as success (stale cache / other device).
    PR #265: frontend/components/ProducerCard.jsx only.

  MEH-187 (Task 2) — Vercel Speed Insights Real User Monitoring:
    Added @vercel/speed-insights@1.3.1 + <SpeedInsights /> in layout.js.
    PR #266: frontend/package.json + package-lock.json + app/layout.js.
    Note: initial CI failure (npm ci lockfile mismatch) fixed in follow-up commit.

  MEH-88 (Task 3) — products.image_url schema change (v2, approved):
    Backend: _migrate_columns products.image_url TEXT; Product model; ProductCreate /
      ProductUpdate / ProductOut schemas; producer_me.py GET/POST/PUT/DELETE
      /producers/me/products with IDOR ownership checks.
    Frontend: ProducerDetail product cards — 64×64 thumbnail with Package icon fallback;
      settings BusinessTab — new ProductsSection (list + add with image upload + delete).
    Tests: tests/test_product_image.py (9 cases: create/update/clear/delete/IDOR/isolation).
    PR #267: all CI green (lint ✅, build ✅, tests ✅, adversarial ✅).

  MEH-89 (Task 4) — availability_return_date (v2, approved):
    No new DB column needed — vacation_until DATE already existed from MEH-155.
    Backend: ProducerUpdate schema gets availability_status + vacation_until so admin
      PUT /producers/:id can set them (previously producer-only).
    Frontend: ProducerDetail — 3 vacation banner locations now show "חוזרת ב-{date}"
      (he-IL locale) or "חוזרת בקרוב" fallback using producer.vacation_until.
    Frontend: Admin ProducerForm — new "זמינות" section with pill buttons + conditional
      date picker; vacation_until nulled in payload when status ≠ vacation.
    PR #268: CI running.

Previous session — PRs #265/#266 (MEH-236 + MEH-187, opened but not yet merged):
Summary:
  MEH-211 (batch 1 copy sweep) — MEH-202 + MEH-204 + MEH-207:
    4 files changed, text only, no logic/DB/design.
    MEH-202: "לממכר מזון" → "למכירת המוצרים" in register/producer step 4
      consent checkbox (page.js:405) + terms §2 paragraph 2 (terms/page.js:35).
      First paragraph of terms §2 (legal list) untouched.
    MEH-204: Search placeholder "חפשי ירקות טריים, בשר grass-fed..." →
      "לחם מחמצת, ביצים אורגניות, ירקות ופירות" in search/page.jsx:112 +
      language-context.js:34 (Hebrew locale). English locale untouched.
    MEH-207: /register/producer hero H1 "הוסיפי את העסק שלך" → "תני לעסק שלך בית";
      subtitle → "5 דקות. בלי עמלות. בלי מתווכים.";
      OAuth info box now email-only across 2 block spans (removes user.name to
      sidestep MEH-206 truncation bug).
    Post-fix verification: all 5 banned strings → zero results across frontend/.

  Previous session — MEH-218 — CLAUDE.md modular refactor (2026 best practices):
    Motivation: CLAUDE.md at 245 lines, over its own 245 cap. Duplicate compact
      triggers (40% vs 60%); 3 overlapping bug-handling sections; inline Mermaid
      diagrams duplicating .ai/diagrams/; Known Bug Patterns + custom commands
      that were documentation, not rules. Anthropic / HumanLayer / Hightower
      (March 2026) all recommend modular .claude/rules/ split.
    3 commits, docs + .claude/ only (zero code files touched):
      1. docs(meh-218) — docs/BUG_PATTERNS.md + docs/LOCKED_DECISIONS.md extracted
         verbatim with expanded "why" / "the trap" sections.
      2. feat(meh-218) — .claude/rules/ split into 7 domain files (rtl, security,
         testing, deployment, frontend, backend, workflow — 602 lines total).
         All rule content preserved verbatim.
      3. refactor(meh-218) — CLAUDE.md rewritten 245 → 138 lines. Removed:
         inline Mermaid diagrams (already in .ai/diagrams/), Known Bug Patterns
         section (→ docs/BUG_PATTERNS.md), Custom commands duplication, verbose
         rail/anthropic prose. Unified Bug Protocol (was 3 sections). Single
         /compact rule (was duplicated at 40% and 60%). Top-10 workflow rules
         summarized with pointer to .claude/rules/workflow.md.
    Verification: wc -l CLAUDE.md = 138 ≤ 150 cap; ls .claude/rules/ = 7 files;
      grep -r 'left-3\|right-3' .claude/ → only .claude/rules/rtl.md;
      no Mermaid or Architecture Diagrams section in CLAUDE.md.
    Zero rules deleted — every rule from the old file survived somewhere.
    Hard cap lowered from 245 → 150 lines; update policy: new domain rules
      go into .claude/rules/*.md, not back into CLAUDE.md.

Previous session (2026-04-22, earlier):
  PR #242 (MEH-213) — Business location types + canonical cities:
    Backend: City model + cities table (idempotent DDL); 4 new columns on producers
      (has_physical_location, offers_delivery, delivery_nationwide, delivery_cities TEXT[]);
      2 CHECK constraints (both-false blocked; nationwide XOR city-list); Pydantic v2
      model_validator for mutual-exclusion; GET /cities?q= autocomplete (60/min);
      scripts/seed_cities.py from data.gov.il; geo-search excludes delivery-only.
    Frontend: CitiesAutocomplete (debounced, ARIA combobox, keyboard nav);
      DeliveryBlock (3 states: nationwide / city chips / fallback + WhatsAppButton);
      ProducerDetail: conditional MiniMap + DeliveryBlock; ProducerCard: "משלוחים בלבד"
      badge; ProducerForm: "סוג העסק" section + cascading checkboxes + CitiesAutocomplete
      + client-side save guard; producer-completeness.js delivery-aware;
      CSV export 4 new columns; seo.js areaServed for delivery-only.
    Tests: test_producer_location_types.py (cities endpoint, both-false, nationwide+cities, geo-search exclusion).
    Build fix: CitiesAutocomplete JSDoc comment had "start-*/" which SWC parsed as
      closing the block comment — fixed on second commit.
    Merge: pulled latest staging (MiniMap.jsx Waze fix + ProducerReviews.jsx guard) into branch.

Previous sessions:
  PRs merged: #234 (MEH-141) + #236 (MEH-106) + #238 (MEH-212) + #237 (MEH-102) + #240 (MEH-102 bugfix) + #239 (Playwright E2E fixes) + #241 (MEH-102 bugfix v2)

Previous session context:
  PR #221: MEH-149 Cookie consent GDPR gate
  PR #222: MEH-157 Pending producer banner
  PR #223: MEH-152 WhatsApp desktop fallback
  PR #224: MEH-153 Cloudinary errors → Hebrew
  PR #225: MEH-155 Vacation badge auto-clear
  PR #226: MEH-156 JWT expiry re-auth
  PR #227: MEH-158 Modal focus return WCAG 2.1 AA
  PR #229: MEH-154 Excel mojibake detection
  PR #230: MEH-159 Pagination counter stale
  PR #232: MEH-151 Map SSR Googlebot
  MEH-160: SKIPPED (standing instruction from user)

## Current state
Branch: feature/meh-267-alembic-migration (PR #311, draft, CI green)
Last branch: feature/meh-83-lightbox (PR #272, CI running)
Staging HEAD: updated — PR #264 (uv migration) merged this session
Main HEAD: e42127e (production still behind staging — needs promotion)

## PRs merged this session
- #264 — uv migration (claude/migrate-pip-to-uv-8p7aT) ✅

## Open PRs
- #265 — MEH-236: CardHeart can't undo favorite (draft)
- #266 — MEH-187: Vercel Speed Insights (draft)
- #267 — MEH-88: products.image_url + CRUD — all CI green ✅ (draft)
- #268 — MEH-89: vacation return date in banner + admin form (draft)
- #270 — MEH-87: LoginPromptModal Tab focus trap (draft, CI pending)
- #272 — MEH-83: Lightbox on gallery images (draft, CI running)
- #274 — MEH-84: GPS button on /map (draft, CI queued)

## Next task
- Run `/adversarial-review` on PR #311 → unmark draft → request review → merge
- Open MEH-XXX: "Add `alembic check` to CI — catches ORM/migration drift that `alembic upgrade head` misses"
- MEH-86: Infinite scroll on /producers — BLOCKED until ≥50 producers in DB
- MEH-205: /search page redesign (discovery-first) — next feature in queue
- Review and merge #265 → #268 to staging (older open PRs, still valid)
- Promote staging → main (production is behind)

## Key decisions (don't revisit)
| Decision | Reason | Date |
|----------|--------|------|
| MEH-106: show count only when ≥5 | Low numbers reduce trust rather than build it | April 2026 |
| MEH-106: batch GROUP BY for list, scalar COUNT for detail | Avoids N+1; single query for full list page | April 2026 |
| MEH-141: admin_notes preserved on PATCH when body.admin_notes is None | Prevents data loss when status is reset without re-entering notes | April 2026 |
| MEH-141: examples stripped server-side | Prevent trailing whitespace stored in DB | April 2026 |
| MEH-141: modal z-[9000] (not z-50) | z-50 was hidden behind site header | April 2026 |
| MEH-143: role=producer AND is_producer=true (both) | Role gates dashboard; is_producer is durable even if admin clears producer_id | April 2026 |
| MEH-143: get_current_user_optional re-raises 403 | Blocked users must never be treated as anonymous — adversarial-review finding | April 2026 |
| MEH-143: upgrade guard checks producer_id OR is_producer | Prevents silent re-registration after admin clears producer_id | April 2026 |
| MEH-143: email-exists uses EmailStr + 30/min | 5/min was too low for blur-event cadence during form entry; 30/min balances UX vs enumeration | April 2026 |
| MEH-XXX: Email via Resend (not SMTP) | Railway blocks SMTP ports 25/465/587; Resend is HTTP | April 2026 |
| MEH-144: notifications via BackgroundTasks | Synchronous SMTP/Twilio blocked Vercel proxy → 502 + orphan users | April 2026 |
| MEH-144: 409 (not 400) for dup email on producer register | Actionable message directing user to login; 400 was silent | April 2026 |
| MEH-78: mapPane dual-instance fix via BoundingClientRect | At effect time, display:none containers have 0 dimensions — reliable, no extra prop | April 2026 |
| MEH-78: sepia removed from tile filter | Was desaturating the global viewport, making markers look muted | April 2026 |
| MEH-56: status=pending_whatsapp (not pending) | Distinguishes minimal-form signups; both shown in admin pending queue | April 2026 |
| MEH-56: IG scrape via public meta (no OAuth) | v1 scope; OAuth too complex; fail-open to free text | April 2026 |
| MEH-56: completion checklist frontend-only | All fields in GET /producers/me; no new backend needed | April 2026 |
| MEH-50: isFridayMode() pure client-side (no API) | Intl handles DST; no extra fetch on homepage | April 2026 |
| MEH-50: SW timer-based push (not server-push) | v1 scope; server-push is v2 path | April 2026 |
| MEH-50: admin override via localStorage + AdminSetting | Testing on admin's browser only; no global override needed | April 2026 |
| MEH-51: trust_tier real-time (not stored) | No nightly job needed; computed via model_validator | April 2026 |
| MEH-51: OTP via WhatsApp (TWILIO_WHATSAPP_FROM) | No new env vars; fail-open if creds missing | April 2026 |
| MEH-51: kashrut_badges[] additive to producers.kosher | No regression; both coexist | April 2026 |
| MEH-51: ambassador = admin-manual toggle only | Trust tier 5 is editorial, not algorithmic | April 2026 |
| MEH-51: OTP uses secrets.choice (not random) | Security: random is predictable | April 2026 |
| MEH-51: artisan-dairy replaces raw-dairy; grass-fed removed | Refined spec — 8 valid badge codes | April 2026 |
| RTL: logical properties only | Physical left-*/right-* cause RTL bugs | April 2026 |
| Backend sort defaults newest-first | Deterministic pagination, no PostGIS needed | April 2026 |
| MEH-218: CLAUDE.md cap 245 → 150 | Above 200 lines the file stops being a one-page index; domain rules belong in .claude/rules/*.md, trap context in docs/LOCKED_DECISIONS.md | April 2026 |
| MEH-218: diagrams deleted from CLAUDE.md | Inline Mermaid duplicated .ai/diagrams/ which is the canonical source and is auto-loaded via --append-system-prompt | April 2026 |
| MEH-218: Bug Protocol unified into 1 section | Three overlapping sections (Regression rules + Bug Pattern Protocol + Known Bug Patterns) caused confusion; split into "protocol" (CLAUDE.md) and "pattern library" (docs/BUG_PATTERNS.md) | April 2026 |
| MEH-88: products CRUD via /producers/me/products (not embedded in PUT /me) | Separate resource endpoints enable per-product image upload and clean IDOR checks | April 2026 |
| MEH-89: no new availability_return_date column — vacation_until (MEH-155) covers it | Duplicate column would diverge; vacation_until already auto-clears, exposed in all schemas, used by producer dashboard | April 2026 |


## Known issues (not yet filed)
- Playwright spec 05 dual-Leaflet root cause (MapClient renders mapPane twice) is patched in tests only — :visible selector avoids the ambiguity. The architectural fix (conditional rendering instead of CSS hiding) is v2 scope.
- feature/meh-106-social-proof and feature/meh-212-playwright-ci-fix branches not deleted — git push --delete returns 403 in this env; delete manually from GitHub UI.
- Phase 3 text-right sweep on forms — partially done in PR #162
  (register/producer only); register/page.js + other forms still TBD
- ProducerCard heart/favorite — Phase C not yet implemented (post-login replay)
- Map WhatsApp CTA: old producer records without phone still skip the button.
  Verify in production after staging redeploy.
- MEH-54 VAPID keys: must be set in Railway env for push to work. Fail-open until set.
- MEH-50 SW timer push: only fires while SW is active. Server-side push (v2) needed
  for reliable delivery when app is closed.
- MEH-56 Instagram scrape: Instagram throttles bots — scrape may fail for most handles.
  Users fall back to free-text input which still works via Haiku.
- MEH-78 viewport resize: `mapApiRef.current` is set once on mount based on container
  visibility. If user resizes from desktop→mobile (or vice-versa) without a page
  reload, the registered API may point to the wrong map. Acceptable for v1 — full
  fix requires ResizeObserver-driven re-registration (v2 path).

## Do NOT start until you've reported
- Current open PRs (git + GitHub)
- Current branch status
- Any drift between staging and main
