# P2/P3 wave ledger — 2026-06-07

Sequential autonomous execution of the MEH-772…783 wave. Each issue: full
Linear description fetched, Phase 0 first, branch + DRAFT PR, `/adversarial-review`
before ready, never merged. Findings sourced from the 2026-06 hotspot/Sentry +
fix-wave + UI-states audits.

## Ledger

| # | Issue | Branch | PR | Result |
|---|---|---|---|---|
| 1 | **MEH-772** title-validator 500 (HOT-003) | `feature/meh-772-title-validators` | **#1007** | ✅ null-safe `_min_letters_validator`; new test; CI green (E2E non-required flake only) |
| 2 | **MEH-782** SEO/reviews LOW pair (HOT-017/018) | `feature/meh-782-hot017-018` | **#1010** | ✅ sameAs/OG omit-guards + reviews Invalid-Date/pagination; vitest 449 |
| 3 | **MEH-778** JSON-LD locale (HOT-006) | `feature/meh-778-jsonld-locale` | **#1011** | ✅ `inLanguage`+breadcrumb per locale; /he byte-identical; vitest 46 |
| 4 | **MEH-777** he-IL date sweep (MEH-753 cont.) | `feature/meh-777-heil-wave` | **#1012** | ✅ 11 sites → shared helper; 3 DEFERРЕD (CalendarView, UpcomingEventsPreview name-collision, producer-format lib); vitest 447 |
| 5 | **MEH-783** security-headers consolidation | `feature/meh-783-security-headers` | **#1013** | ✅ drop vercel.json headers (X-Frame conflict) + backend HSTS; curl-verified; no CSP change |
| 6 | **MEH-775** rate-limit empty-key (SEN-004) | `feature/meh-775-ratelimit-empty-key` | **#1015** | ✅ fallback bucket + log; never skips; new test; ruff-format follow-up pushed |
| 7 | **MEH-776** UIS remainder | `feature/meh-776-uis-remainder` | **#1016** | ✅ UIS-026 delete-product guard; UIS-016/024 verified **already fixed** → 0 CRITICAL open; HIGH layer reasoned-deferred |
| 8 | **MEH-773** DB integrity Chunk A | `feature/meh-773-integrity-constraints` | **#1017** | ✅ verbatim revision + dedupe SQL (docs-only). **HALTED at Sapir WAIT gate** (Sapir runs the migration). Chunk B blocked on apply. |
| 9 | **MEH-774** homepage perf Chunk A | — | — | ⏸ **NOT STARTED — see below** |

**Skipped per wave spec (gated on Sapir/other):** MEH-779, 780, 781, MEH-774 Chunk B, MEH-773 Chunk B.

## MEH-774 Chunk A — remaining (handoff scope)

Not executed this session — deliberate, not blocked. Rationale: the homepage is a
**central component**, and Chunk A's STOP gate is *Sapir eyeballing before/after
screenshots* plus a **Lighthouse before/after** table. Both need reliable
browser/Lighthouse tooling that the CC sandbox can't produce, and the
central-component protocol requires visual-parity proof before shipping. Better
run in a fresh session with the `design-review`/Playwright tooling (or have the
screenshots taken on the Vercel preview).

**Phase-0 scope already mapped (file:line for the next session):**
- **Leaflet eager:** `components/HomepageMiniMap.jsx` → `components/MiniMap.jsx` →
  `components/MapComponent.jsx`, rendered from `app/[locale]/home/*`. Fix: wrap the
  homepage map consumer in `next/dynamic(… , { ssr: false })`. **Do NOT touch
  `map/**` (MEH-763 territory).**
- **framer-motion eager:** `components/FadeInSection.jsx` (used across home blocks).
  Fix: `next/dynamic` or replace the trivial fade with a CSS transition where
  identical — decide per call site, list in PR body.
- Baseline + after **Lighthouse mobile + first-load JS** → `docs/audits/raw/perf/`.
- **Chunk B (next/font)** is gated on Chunk A screenshot approval — out of scope.

## Cross-session notes
- All 8 PRs are DRAFT; none merged. Each carries `/adversarial-review` verdict CLEAN
  in its PR thread reasoning.
- MEH-777 ↔ MEH-782 both touch frontend date paths but disjoint files
  (ReviewsSection date is MEH-782's; MEH-777 excluded it) — no merge conflict.
- MEH-778 ↔ MEH-782 both touch `seo.js` but disjoint regions (782 = sameAs/OG;
  778 = buildJsonLd inLanguage/breadcrumb) — minor merge attention at most.
- MEH-773 Chunk B + MEH-774 Chunk A/B are the open follow-ups.
