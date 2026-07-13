# MEH-1171 — Conversion progress (checkpoint file)

> Updated after EVERY converted section (checkpoint-and-continue, per ticket).
> Matrix approved by Sapir 13/07 (incl. 138 STALE deletions, KEEP-RUNBOOK, 6 UNCLEAR resolutions).
> Ticket B (MEH-1176) ran first: F1-F10 → 8 fixed/merged, F6+F7 stopped (see matrix § Ticket B execution status).

## Status: 🚧 CONVERTING — checkpoint 4b: mobile near-me GREEN locally ×2 (CI re-verify in flight)

- [x] Phase 0 report + full triage matrix (`docs/qa/manual-testing-matrix.md`, 1,074 rows) — merged in PR #1710
- [x] **Sapir approved matrix** (13/07)
- [x] `scripts/local-backend.sh` — VERIFIED WORKING in the sandbox: system Postgres 16 → ephemeral `mehamakor_local` → `alembic upgrade head` (full chain) → `seed_data.py` + `create_admin.py` → uvicorn; `GET /health` = `{"status":"ok","db_init":"ready"}`, seeded `/producers` served. `SKIP_UVICORN=1` = DB-prep-only mode for CI/runner-managed processes.
- [ ] Conversion, section by section (CONVERT-PW → `frontend/e2e/flows/manual/`, CONVERT-PYTEST → `tests/test_manual_*.py`) — **next: checkpoint 2**
- [ ] MANUAL_TESTING.md rewrite: pointer stubs (MEH-671 pattern) + unified Tier-3 checklist at top + STALE sections deleted + KEEP-RUNBOOK verbatim
- [ ] New suite green ×2 consecutive SCOPED runs (`npx playwright test e2e/flows/manual`), output pasted here
- [x] FINDINGS handed to Ticket B (F1-F12; F13 added during Ticket B)

## Conversion order (checkpoint 2+ plan, highest-value first per matrix)

1. Legal pages + static pages (/privacy /terms /accessibility content — spec 13 covers only /about+/events)
2. MEH-722 map legend (live feature, zero coverage)
3. Mobile /map near-me (07-gps-button skips mobile entirely; PW geolocation mocks)
4. CitySearch autocomplete (stubbed everywhere, no dedicated test)
5. MEH-853 upgrade-path submit body (vitest gap → PW or pytest per item)
6. CONVERT-PYTEST cluster (23 items) against the local backend
7. Remaining CONVERT-PW sections in matrix order; destructive ones via scripts/local-backend.sh

## Per-section log

| Section | Items | Target file | Status |
|---|---|---|---|
| (infra) local backend runbook | — | `scripts/local-backend.sh` | ✅ verified (health 200 + seeded reads) |
| /map near-me mobile (MEH-970 2-lite) | 4 of 4 items → PW (mocked geolocation: grant-near / grant-far-25km / deny) | `frontend/e2e/flows/manual/map-near-me.spec.ts` | ✅ **green ×2 locally (20 passed / 20 passed suite-wide)** after the CI FAIL was root-caused. **Correction of the earlier note:** the "sandbox can't mount mobile /map" claim was WRONG — the real causes were (1) the MEH-549 two-instance race (hidden desktop + visible mobile MapPane both mount; visibility-waits on `.leaflet-container` resolve to the hidden one — the race-free mount signal is `window.__MAP_CENTER__`, REUSES 05-map-navigation) and (2) the pill's accessible name is its aria-label "הצגת בתי עסק קרובים למיקום שלי", not the visible "קרוב אליי". CI re-verify rides the next e2e-qa-report. |
| /map legend (MEH-722) | 3 of 4 items → PW (items 2,4 live; items 1+3 = test.fixme) | `frontend/e2e/flows/manual/map-legend.spec.ts` | ✅ suite green ×2 (16 passed / 16 passed incl. legal-pages). **Runtime-verified semantics documented in the spec header:** the legend is a MULTI-TOGGLE (neutral = all rows aria-pressed=true; a click EXCLUDES a category), map interaction collapses the legend, and counts key off committedBounds (the "חפשו באזור זה" pill commits). **Deferred (fixme):** items 1+3 need a deterministically empty committed viewport — mouse-drag panning kept catching seeded businesses in the sandbox (stopped after 2 attempts per the stop rule); needs a map test hook or geo URL params. **UX quirk noted (not fixed — zero-app-fixes):** excluding an EMPTY category disables its own row, so it can only be recovered via "הציגו הכל". |
| Legal pages (אפריל 2026) | 8 of 14 → PW (items 1,2,3,8,9,10,11,13) | `frontend/e2e/flows/manual/legal-pages.spec.ts` | ✅ green ×2 (14 passed / 14 passed, desktop+mobile) vs live local stack. Items 4-7 = pytest/Tier-3 (email inbox = Tier-3; DB row + 429 + fail-open = existing pytest, cite in the MANUAL_TESTING stub). Item 12 = pending coverage check vs 18-producer-register-wizard. Item 14 = STALE (approved). **Doc-stale notes:** contact toast copy is now `contact.success_title` "תודה! קיבלנו את הפנייה." (emoji removed, Emoji LOCK v2); footer ships 3 legal links — the checklist's 4th (קשר) was dropped in the footer redesign; accessibility date line is "עודכנה לאחרונה", not "עדכון". |

## Runtime notes for the next checkpoint

- Sandbox Playwright: launch with `executablePath: "/opt/pw-browsers/chromium"` (project pin wants a browser build absent from the sandbox cache; do NOT `playwright install`).
- Playwright route-mocks: catch-all route must be registered FIRST (last registered wins).
- Frontend for live checks: `npm run build && npm run start` (`/api/*` proxies to `http://localhost:8000` by default — pairs with local-backend.sh).
- Verbatim-copy caution: several checklist strings predate later copy changes (e.g. Emoji LOCK removals) — runtime-verify each assertion string against the live app; checklist-vs-app copy mismatch = doc-stale note in the section log, not a test weakening.
