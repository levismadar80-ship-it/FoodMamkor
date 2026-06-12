# OVERNIGHT DESIGN-PORT BATCH — 2026-06-12/13

> Session: autonomous overnight run (Sapir asleep). Phase 0 read-only audit + serial execution.
> This file is intentionally untracked (never staged). Final state of each surface at bottom.

## Phase 0 — repo state

- `origin/staging` @ `0c3f1a0` · vs `origin/main`: 2 ahead / 155 behind by raw count — squash-merge SHA-drift shape (MEH-427); all branches cut from `origin/staging`.
- Open PRs: **#1054** (MEH-794 backend neighbor cleanup — not a design surface), **#1039** (MEH-734 smart-sticky navbar, DRAFT — Sapir QA), **#1024** (dependabot). No open PR for any queued surface.
- `../meh-789-worktree` does NOT exist; `feature/meh-789-nav-bottom-pill` no longer on remote — **both MEH-789 PRs already merged** (PR-A #1043, PR-B #1052, + #1070 header streamline). Worktree re-creation unnecessary.

## Gap table (design-reference/ vs production code)

| SURFACE | DESIGN FILE | CODE PATH | STATUS | LINEAR |
|---|---|---|---|---|
| Home hero | Phase 1 · Hero v2 | home/HomeHero.jsx | PORTED (#1055, #1063, #1067) | MEH-788 |
| ProducerCard v4 | Phase 2 · ProducerCard v4 | components/ProducerCard.jsx | PORTED (#890) — polish debt open | MEH-730 |
| Category grid | Phase 3 · Category Grid v8 | home/HomeCategoryGrid.jsx | PORTED (MEH-643) | — |
| Floating navbar | Phase 4 (+MEH-732 refinement) | components/Header.jsx | PORTED (#891, #1052, #1070); sticky = open DRAFT #1039 | MEH-734 |
| Homepage assembly | Phase 5 · Assembly v2 | app/[locale]/page.js | PARTIAL — gaps: trust strip copy, comparison strip, §10 featured producer, copy-Δ | MEH-524/525/542/788 |
| §06+§10 design pass | Phase 5 · Sections 06+10 | page.js | NOT PORTED (§10) | MEH-542 |
| Map page | Map Page v2 (S5) | map/MapClient.jsx | PORTED (MEH-763/764 chips/markers) | — |
| Honey map pin | S5 addendum (MEH-666) | map/MapClient.jsx | **NOT PORTED — SKIPPED**: central HIGH-RISK component, chunk-review required, not autonomous-eligible | MEH-666 |
| Business page | S6 | producer page + TrustBadge | PORTED (#1051) | MEH-76 |
| Register flow | S7 | register/* | PORTED (#1057, #1059) | MEH-788 |
| About | about-s8.html | about/AboutClient.jsx | PORTED (#1037, merged — queue item 1 premise stale) | MEH-135 |
| Login | S9 (in-chat mock) | login/LoginClient.jsx | PORTED (#1040, merged — queue item 2 premise stale) | MEH-131 |
| Events | S10 | events/EventsClient.jsx | PORTED (#1044, merged — queue item 3 premise stale) | MEH-134 |
| Process page | S11 | about/process/* | PORTED (#1045) | MEH-534 |
| Badge/tier spec | S12 | TrustBadge.jsx | PORTED (#1051) — tier-5 raw hex debt open | MEH-792 |
| Design System v1.0 | Design System v1.0 | DESIGN.md + tokens | PORTED (MEH-136/602) | — |
| S14 texture | (via MEH-788 spec) | hero/feature-band/about | PORTED (#1065) | MEH-788 |

## Queue disposition (start of run)

| # | Surface | Verdict |
|---|---|---|
| 1 | MEH-135 /about draft | **ALREADY MERGED** (#1037) — no-op |
| 2 | MEH-131 /login port | **ALREADY MERGED** (#1040) — no-op |
| 3 | MEH-134 /events port | **ALREADY MERGED** (#1044) — no-op |
| 4 | MEH-730 polish | EXECUTE — note: Header drawer retired (#1052); gold-on-dark numerals now live in AccountSheet.jsx; `producer.badge_row` keys already exist (item 4 = already fixed) |
| 5 | MEH-792 badge reconciliation | EXECUTE |
| 6 | MEH-788 motion pass | **ALREADY MERGED** (#1053 scroll-reveal + reduced-motion; texture #1065) — no-op |
| 7 | MEH-602 atoms | **ALREADY MERGED** (#1048) — no-op |
| 8 | Other NOT-PORTED gaps | Honey pin → SKIP (HIGH-RISK central). Home parallax dividers still Unsplash (page.js:38-39) — no Sapir mapping given → SKIP, log |
| 9 | MEH-789 nav (YELLOW) | **ALREADY MERGED** (PR-A #1043 + PR-B #1052) — no-op |
| 10 | MEH-797 asset wiring | EXECUTE (reduced: login+register heroes already wired #1040/#1057; IMG-03 done #1063; IMG-01 keep fallback → remaining = 2 Unsplash bg swaps) |
| 11 | MEH-524 trust strip | EXECUTE (infra exists: /stats + threshold 5 in use-home-page.js:19 → copy + styling only) |
| 12 | MEH-525 comparison strip | EXECUTE |
| 13 | MEH-542 Meet a Producer §10 | EXECUTE |
| 14 | MEH-788 copy-Δ | EXECUTE |

## Outcomes

| Surface | Branch | PR | Status |
|---|---|---|---|
| MEH-797 asset wiring (2 Unsplash → Cloudinary) | feature/meh-797-asset-wiring | [#1073](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1073) | DRAFT — Closes MEH-797 |
| MEH-730 gold-on-dark token + BadgeRow v4 recolor + ProducerCard comments | feature/meh-730-navbar-card-polish | [#1075](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1075) | DRAFT — 2 of 4 items shipped, 2 already fixed upstream |
| MEH-792 badge reconciliation | feature/meh-792-badge-reconciliation | [#1076](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1076) | DRAFT — PARTIAL (BadgeRow tooltip migration deferred: needs a ui/Tooltip API decision; analysis in PR) |
| MEH-524 trust strip (locked copy + S4 restyle) | feature/meh-524-trust-strip | [#1077](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1077) | DRAFT — Closes MEH-524 |
| MEH-525 comparison strip | feature/meh-525-comparison-strip | [#1078](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1078) | DRAFT — Closes MEH-525 |
| MEH-542 Meet a Producer §10 (dormant) | feature/meh-542-meet-a-producer | [#1079](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1079) | DRAFT — Closes MEH-542 code-side |
| MEH-788 copy-Δ (P5-v2 LOCK table) | feature/meh-788-copy-delta | [#1080](https://github.com/levismadar80-ship-it/FoodMamkor/pull/1080) | DRAFT — Refs MEH-788 |
| Queue 1/2/3/6/7/9 (about, login, events, motion, atoms, nav) | — | — | NO-OP — already merged pre-batch (#1037/#1040/#1044/#1053/#1048/#1043+#1052) |
| MEH-666 honey map pin | — | — | SKIPPED — HIGH-RISK central component (MapClient), needs chunked session |
| Home parallax dividers (page.js:38-39 Unsplash) | — | — | SKIPPED — no Sapir Cloudinary mapping provided |
| IMG-01 /about portrait | — | — | KEPT tonal fallback per spec (must be Sapir, never stock) |

## Items needing Sapir

1. **Merges** — all 7 PRs are DRAFT; recommended merge order for the homepage trio (shared `page.js` + locale files, trivial adjacent conflicts): **#1077 → #1078 → #1079 → #1080**, syncing each subsequent branch (Rule 25). #1073/#1075/#1076 are independent.
2. **Mobile QA owed per PR** (375/360/390 on Vercel previews): trust strip (needs live `/stats` ≥5 to show the counter state), comparison strip, How-It-Works/CTA/footer copy, badge chips recolor (producer page + cards), account-sheet gold accents, experiences + group-buys heroes.
3. **MEH-792 decision**: BadgeRow popover → `ui/Tooltip` requires extending the Tooltip API (controlled mode + Esc/outside-click + stopPropagation passthrough) — the ticket forbade API redesign; the two constraints conflict. Small API call needed, then migration is mechanical.
4. **MEH-666 honey map pin** — only remaining design-reference gap; HIGH-RISK central component, schedule a chunked session.
5. **Home parallax dividers** (`page.js:38-39`) still Unsplash — provide Cloudinary mapping or approve tonal replacement; `layout.js` Unsplash preconnect stays until then.
6. **EN copy debts**: `home.comparison.*` + `home.featured.*` en values are HE-mirrors awaiting EN copy; `en.json:690` has a Hebrew aria value (`"שמירה"`) — pre-existing, worth a micro-ticket.
7. **Pre-existing `מתווכים` strings** (`he.json:228`, `he.json:3411`) — possibly off-voice; copy decision (Rule 22).
8. **ui/Badge atom drift** — #1075's BadgeRow recolor makes the MEH-602 atom's colors stale; fold into the badge-consolidation follow-up. Also: whichever of #1075/#1076 merges second should delete the now-dead `secondary` line in `BadgeRow.jsx` COLOR_CLASSES (one line).
9. **AnimatedCounter.jsx** orphaned by #1077 (zero consumers) — future sweep candidate.
