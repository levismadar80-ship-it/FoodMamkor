# Overnight Batch #2 — Morning Summary (2026-06-13)

**Mode:** isolated worktree (`../mehamakor-batch2` off `staging`), DRAFT PRs only,
**zero merges**, ran in parallel with Batch #1. All 5 tasks completed + this summary.

## Draft PRs opened (6 total — review in order)

| PR | Task | What | Needs QA? |
|---|---|---|---|
| **#1111** | 1 | Backend test-coverage wave — 130 new tests; overall coverage **79.66% → 83.16% (+3.50)**, suite 1047 → 1177. No production code touched. | **No** — tests-only, backend. Read the diff. |
| **#1115** | 2 | Rule-19 Zod sweep on non-map `lib/` data-layer (home page + favorites cache). New `lib/api-schemas.js`; parse-fail → existing empty/error state. | **Yes** — homepage mobile QA (categories, stats counter, recently-viewed, grid). |
| **#1116** | 3 | i18n hardcoded-string audit — REPORT ONLY. 42 hits / 10 files; `docs/audits/2026-06-13-i18n-hardcoded.md`. | **No** — docs-only. |
| **#1117** | 4 | Frontend performance audit — REPORT ONLY. Top-20 wins; `docs/audits/2026-06-13-performance.md`. | **No** — docs-only. |
| **#1118** | 5 | Docs reconcile — fixed 5 dead internal links (0 remaining in our docs). | **No** — docs-only. |
| (this) | — | This summary. | **No** — docs-only. |

## Per-task detail

### Task 1 — Backend test coverage wave (PR #1111) ✅
- 8 new test files, **130 tests**, all green. Targets chosen from `pytest --cov`:
  - moderation services (home-product **19.7→91.5**, experience **20→92**, recipe **21→90.3**) via in-memory fake Anthropic client — every `validate_*` branch + fail-open.
  - `routers/group_buys` **23.6→80.2** (full commit/cancel lifecycle + create guards).
  - `bio_generator` 26.1→62.3, `producer_risk` helpers, `analytics` helpers, `producer_queries.attach_badge_fields`.
- **Bugs found-but-not-fixed: NONE.** No test surfaced a production bug in this wave.
- Excluded per scope: auth.py, whatsapp, schemas/Alembic.

### Task 2 — Zod sweep rule-19 non-map (PR #1115) ✅
- New `lib/api-schemas.js`: `CategoriesResponseSchema`, `StatsSchema`, `FavoritesResponseSchema` (+ re-exports of `ProducerSchema`/`ProducersResponseSchema` from `schemas.js`, unedited).
- Wired into `use-home-page.js` (4 consumers) + `favorites-cache.js`. vitest +14, full suite 495 green, build green, lint 0 errors.
- **Automated review (claude[bot]) on the PR → addressed in `a5330a5`:** tightened `FavoriteSchema.producer_id` to required (was nullable+optional → `[{}]` passed, toothless guard) + regression test; test fixtures switched to real UUID strings.
- **Reviewer points declined (documented):**
  - *"Add `Closes MEH-XX`"* — these are intentionally **ticketless** overnight exploratory drafts; no Linear issue assigned. Sapir to attach/close at triage. (Replied on PR.)
  - *"Transliterate Hebrew test fixtures to ASCII"* (Minor) — declined: realistic Hebrew fixtures better represent this Hebrew-first app's data, eslint passes (no rule enforces it), transliteration reduces test fidelity.

### Task 3 — i18n hardcoded-string audit (PR #1116) ✅ REPORT ONLY
- **42 user-facing hardcoded Hebrew strings / 10 files.**
- **Top offender: `components/ChatWidget.jsx` (21 strings, zero `useTranslations`, mounted globally → invisible to `/en`).** Second: `layout.js` `BASE_METADATA` (7 SEO strings).
- Correctly excluded: comments/JSDoc/`console.*`, wire-format API enums, `t()`-wrapped values, dev-only page.

### Task 4 — Frontend performance audit (PR #1117) ✅ REPORT ONLY
- Top wins: (1) **no `optimizePackageImports`** for 89 phosphor importers + framer-motion; (2) **`ChatWidget` eagerly imported in root layout** (should be `dynamic({ssr:false})`); (3) framer in root layout; (4) 7 raw `<img>` bypass next/image; (5) no AVIF in `images.formats`.
- **Limitation:** the `next build` output in this env omitted the First-Load-JS column → precise per-route byte budgets deferred; recommended wiring `@next/bundle-analyzer` (win #6). Largest raw chunks: 280/224/196 KB.

### Task 5 — MEH-690 docs reconcile (PR #1118) ✅ doc-only
- Fixed **5 dead internal links** (design-review README ×4, CHANGELOG, DEPLOYMENT ×2, synthesis log ×2). Scan now: **0 broken links in our docs.**
- ⚠️ **Scope divergence flagged (rule 4):** Linear **MEH-690** is actually a **Drive/PK Council-Mode/Template-09 patch reconciliation**, explicitly *"Not a CC task — Sapir manual investigation in Drive."* Not addressable from a CC session (no Drive/PK/Settings access). Executed the **Batch #2 Task 5** definition (in-repo docs reconcile) instead; the in-repo "under reconciliation in MEH-690" notes (templates/README, ADR-020, CONTEXT) left untouched (their resolution is Drive-side, still pending).

## Skipped findings (logged, not actioned)

- **40+ broken links inside `.claude/skills/**`** — hash-locked vendored third-party skills (`skills-lock.json`); editing trips the hash-drift CI gate and they aren't "our docs". Left untouched by design. (If desired, fix upstream + re-run `backfill-skill-hashes.sh`.)
- `docs/ADMIN.md:165 [/admin/help]` — valid in-app route (confirmed in build route table), not a dead link.
- `docs/CHANGELOG.md:1482 (...)` — prose placeholder, not a real link.
- **MEH-690 true scope** (Drive Council-Mode patch) — needs Sapir; see Task 5 note.

## Global compliance

- ✅ Separate worktree; before every commit `git diff --stat` confirmed only the task's files.
- ✅ No merges, no main/staging direct commits, no schema/Alembic/`.github/`/Pydantic-schema/auth/main.py/rate-limiter/WhatsApp edits.
- ✅ Stayed off Batch #1 territory (frontend components, he.json/en.json, MapComponent, backend schemas) and the in-flight drafts (#1093/#1094/#1096 + design-batch).
- ✅ No RED-tier work. MEH-737 #5 left HELD. Out-of-scope tickets untouched.
- All 6 PRs are **DRAFT** — awaiting Sapir's review/merge.

## CI/PR watch

Subscribed to activity on all 5 task PRs. Vercel previews building/ready as expected;
the only substantive review (claude[bot] on #1115) was addressed. No CI failures seen
at summary time. Will re-check PR state on a scheduled follow-up.
