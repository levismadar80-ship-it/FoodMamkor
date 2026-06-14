# Overnight Batch #3 — Morning Summary (2026-06-13)

> Third isolated worktree (`../mehamakor-batch3`, branched off `origin/staging`).
> **DRAFT PRs only — zero merges, no `staging`/`main` commits.** Ran in parallel
> with batches #1 + #2; stayed out of their territory (frontend component source,
> `he`/`en.json`, `MapComponent`, schemas, backend src, `lib`/hooks).
> Order executed: 1 → 2 → 3 → 4. All four tasks completed within budget.

## DRAFT PRs opened (4)

| Task | PR | Branch | Type | State |
|---|---|---|---|---|
| 1 — Frontend test coverage wave | **#1106** | `feature/frontend-test-coverage-wave` | code (tests only) | Draft, green locally |
| 2 — Playwright public-flow E2E | **#1107** | `feature/e2e-public-flows` | tests (e2e) | Draft, specs parse/list clean |
| 3 — SEO / metadata audit | **#1110** | `feature/audit-seo-meta` | docs (report) | Draft |
| 4 — Link / route integrity audit | **#1113** | `feature/audit-link-integrity` | docs (report) | Draft |

All PRs target `staging`, all marked **draft**, none merged.

---

## Per-task detail

### Task 1 — Frontend test coverage wave (PR #1106)
- **+93 vitest tests** across **12 previously-untested components**, all reaching
  **100% statement/line** coverage (95.45% branch as a group): `ui/Button`,
  `ui/Badge`, `ui/Card`, `ui/Heading`, `ui/Input`, `ui/Link`, `ui/Tooltip`,
  `StarRating`, `Breadcrumb`, `CategoryTag`, `TrustBadge`, `ImageWithFallback`.
- Whole-frontend coverage (`components/**`+`app/**`): **11.98% → 13.0%** statements
  (denominator diluted by untested pages; the 12 targeted files went 0%→100%).
- Full suite: **575 passed / 41 skipped** (was 482 passed). New `*.test.jsx`
  files only — **no component source touched**.
- **Deviation (flagged for review):** added `@vitest/coverage-v8@^4.1.8` (dev) so
  `vitest --coverage` runs — the task literally asked to run it. One clean line
  in `package.json` + coverage-only lockfile churn. If unwanted, drop the dep;
  the 93 tests stand without it.

### Task 2 — Playwright public-flow E2E (PR #1107)
- **4 new spec files** (`e2e/flows/13-16`) for unauthenticated journeys,
  complementing existing `01-05` with no overlap: static pages (`/about`,
  `/events`), language toggle (he⇄en + URL prefix + `data-current-locale`),
  map markers/clusters, producers directory + category deep-link.
- All data-driven assertions **skip gracefully** on an empty staging DB.
- `playwright test --list`: 8 new tests (×2 projects) discovered & parse clean.
- **No auth/register/login flows** (gated — MEH-216). Specs run against the Vercel
  preview via `e2e.yml`; **not** runnable from the sandbox (MEH-360).

### Task 3 — SEO / metadata audit (PR #1110, report only)
`docs/audits/2026-06-13-seo-meta.md` — per-route matrix + Top-20. Foundation is
strong (consistent canonical+hreflang on all 34 metadata routes; private pages
noindexed; 404 branches noindex+hreflang).

### Task 4 — Link / route integrity audit (PR #1113, report only)
`docs/audits/2026-06-13-link-integrity.md` — Top-20 + working-well list. Nav
chrome is sound; `not-found.js`/`error.js` exist; producer/recipe detail hard-404
correctly.

---

## Bugs found — NOT fixed (per batch rule: audit reveals → log, don't fix)

### From the SEO audit (PR #1110)
1. **Sitemap ↔ noindex conflict (HIGH):** `sitemap.js:45,46,48,49` submit
   `/register`, `/login`, `/contact`, `/search` while those pages set
   `robots:{index:false}` → GSC "submitted URL marked noindex".
2. **Homepage has no `Organization`/`WebSite`/`SearchAction` JSON-LD (HIGH).**
3. **Twitter cards never customized per-page (MED)** — all inherit the layout's
   generic site card.
4. **`/producer/[id]` self-canonicals to the numeric URL, not the slug (MED)** —
   duplicate-URL signal vs the sitemap's slug entry.
5. **`/events/[id]` has no `Event` schema; directory no `ItemList`; guides no
   `Article` (MED).**
6. **Admin + dashboard pages can't emit `noindex`** (client layouts) — robots.txt
   + client-auth only; canonical→`/` (MED).
7. **Indexable private/utility routes:** `/messages`, `/rate/[token]`,
   `/ref/[code]`, `/experiences/new`, `/register/producer` (MED).
8. **Indexable public pages missing from sitemap:** `/experiences`, `/group-buys`,
   business guides, and all dynamic event/experience/group-buy detail pages (MED).
9. **Stale `Disallow:/en/` references** in code vs actual robots.txt (which does
   not disallow `/en`) — `/en` is fully indexable today (LOW, verify intent).
10. **robots.txt sitemap host (`co.il`) vs `SITE_URL`** — confirm match (LOW).

### From the link-integrity audit (PR #1113)
11. **Broken link → `/producers/<slug>` (HIGH)** — `map/page.js:76`; route is `/<slug>`.
12. **Broken link → `/producer/edit` (HIGH)** — `settings/page.jsx:813`; no such route.
13. **Post-login `?next=` silently dropped (HIGH)** — login reads `?redirect=`
    (`LoginClient.jsx:61`); 3 senders use `?next=` (`NewExperienceClient.jsx:78`,
    `ProducerCard.jsx:122`, `LoginPromptModal.jsx:81`) → user lands on `/`.
14. **`/admin?tab=producers` ignored → wrong destination (MED)** — 4 sites
    (`ProducerForm.jsx:263,711`, `admin/producers/new:24`, `…/[id]/edit:51`).
15. **Producer share/profile URL hardcoded to `mehamakor.online` (MED)** —
    `producer/dashboard/page.js:16`, `followers/page.js:43`; should use `SITE_URL`.
16. **Soft-404 on 4 dynamic detail routes (MED)** — `producer/[id]`, `events/[id]`,
    `experiences/[id]`, `group-buys/[id]` return 200+noindex, never `notFound()`.
17. **`/accessibility` orphaned + not in footer (MED, IS-5568)** —
    `Footer.jsx:69-71,229-230`.
18. **`/upgrade`, `/messages` orphaned (LOW)** — no UI entry point.
19. **`/dev/components` linked from production (LOW).**

> None of the above were fixed. Several touch forbidden surfaces anyway
> (auth/login flow, sitemap, central routes) and all need human decisions
> (e.g. is `/en` meant to be indexed? is `/upgrade` dead?). Recommend filing as
> Linear tickets after triage.

---

## Skips / things deliberately NOT done
- **No merges, no `staging`/`main` commits** — all work on `feature/*` branches,
  draft PRs only.
- **No production component/route edits** — Tasks 3 & 4 are audits; Tasks 1 & 2
  add only new test/spec files.
- **No auth/register/login E2E** (Task 2) — gated, needs a staging user (MEH-216).
- **Stayed clear of** WhatsApp, `auth.py`/`main.py`, `MapComponent`, schemas/Alembic,
  `.github`, and batch #1/#2 territory (component source, `he`/`en.json`, `lib`/hooks).
- **Out-of-scope tickets left alone:** 602, 771, 773, 296, 743, 793, 788, 542, 801.
- **No task hit the >2-fail / >30-min stop budget** — all four completed first pass.

## Verification notes
- Task 1: `npx vitest run` → 575 passed (local, real).
- Task 2: `playwright test --list` clean; **execution deferred to CI/preview**
  (sandbox can't reach Vercel — MEH-360).
- Tasks 3–4: static analysis only; **404s and resolved-`<title>` strings should be
  confirmed against a live preview** before any fix PR.

## Suggested next steps (for Sapir)
1. Triage the 19 logged bugs → Linear tickets (start with the 5 HIGHs: sitemap/
   noindex conflict, homepage JSON-LD, the 2 broken links, the post-login redirect).
2. Decide Task 1's `@vitest/coverage-v8` dep: keep (enables CI coverage) or drop.
3. Mark Tasks 1 & 2 ready-for-review after a preview QA pass; Tasks 3 & 4 are
   docs-only and can merge on green CI once read.
