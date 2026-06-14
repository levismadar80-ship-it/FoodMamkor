# Overnight batch — 2026-06-13 → morning summary

> Autonomous overnight fix-wave batch. **All DRAFT PRs, ZERO merges.** Each
> task = own `feature/*` branch off `staging` + own draft PR. Triage target:
> 5 minutes. Skips and deferrals are logged below, not silently dropped.

## TL;DR — 4 draft PRs opened, 1 task already-delivered

| Task | Ticket | PR | What | Needs QA? |
|---|---|---|---|---|
| 1 | MEH-230 | **#1105** | a11y fix-wave — focus indicators, input label, modal semantics | ✅ mobile + keyboard |
| 2 | MEH-232 | **#1108** | Hebrew copy fix-wave — producer terms, spelling, verbs, arrows | ✅ Hebrew copy review |
| 3 | MEH-229 | **#1109** | 2 LOW security — `max_length=200` on producer name | backend review |
| 4 | MEH-765 | **#1112** | map marker keyboard a11y (focusable + role + aria-label) | ✅ keyboard + mobile |
| 5 | MEH-233 | — | mobile audit — **ALREADY DELIVERED** (see below), no duplicate created | — |

All four PRs: `npm run build` green, ESLint 0 errors. Backend pytest deferred
to CI (sandbox limitation — see Task 3). **None merged.**

---

## Task 1 — MEH-230 a11y fix-wave → PR #1105 (DRAFT)

Branch `feature/meh-230-fix-a11y-wave`. Mechanical fixes for the MODERATE
backlog in `docs/audits/2026-06-13-a11y.md` (audit found 0 critical / 0 serious).

**Fixed:**
- **Vector 4 (label):** `CategorySelector.jsx` search input → `aria-label`
  (reused `search_placeholder` key, no new i18n) + focus ring.
- **Vector 6 (focus):** focus ring on the 3 inputs with `outline-none` and
  genuinely no replacement — `Footer.jsx` newsletter, `ChatWidget.jsx` composer,
  `CitiesAutocomplete.jsx` wrapper.
- **Vector 7 (modal):** `CityPickerModal.jsx` → `role="dialog"` + `aria-modal`
  + `aria-labelledby` + ESC + `useFocusReturn` (replicated `CategoryRequestModal`).

**Meta-pattern #1 — 3 audit false positives caught (verified file:line):**
`AddressSearch.jsx:171`, `CitySearch.jsx:113`, `SearchClient.jsx:107` inputs
are borderless but their **wrappers already carry `focus-within:ring-2`** — the
audit flagged the bare input and missed the wrapper. No fix needed; not touched.

**Skipped → logged in [`contrast-brand-decisions.md`](./contrast-brand-decisions.md):**
- All Vector 5 **contrast** pairs (brand-locked tokens — `text-accent`/`honey`/
  `green-300`). Highest-leverage: `text-accent` #8b6914 at 4.48:1.
- `MapClient.jsx` legend filter — central component (handled by MEH-765 area).
- `ChatWidget`/`InstallPrompt` `aria-modal="false"` — deliberate non-blocking.
- Border-only focus inputs (settings ×8, ProducerForm, PhoneVerifyCard,
  dashboard) — have a weak replacement → outside "no replacement" scope.
- `CategoryRequestModal` Tab-trap — already has aria-modal+ESC+focus-return.

---

## Task 2 — MEH-232 copy fix-wave → PR #1108 (DRAFT)

Branch `feature/meh-232-fix-copy-wave`. Commit-per-vector. Applies the LOCKED
decisions in `docs/COPY_STYLE.md`. `grep` each vector → 0 in scope; JSON valid.

- **V1 producer terms:** `worker/index.js` 2 push notifications + `he.json`
  `discover` CTA (`גלי יצרנים`→`גלי בתי עסק`, **sibling the audit missed**) +
  friday_hint tooltip.
- **V4 spelling (LOCKED §3):** `ווטסאפ`→`וואטסאפ` (11); standalone `מייל`→
  `אימייל` (18 — negative-lookbehind `(?<!אי)מייל` so the 33 `אימייל` are safe;
  `מייל` is a substring of `אימייל`, naive replace would corrupt them).
- **V3/V7 verbs:** 19 UI button verbs → **gender-neutral plural** (`שמרו`/
  `מחקו`/`הוסיפו`/`ערכו`/`לחצו`/`שלחו`).
- **V2 arrows (LOCKED §4):** 12 forward suffix-`←` CTAs → `→` in `he.json` +
  3 inline (`OnboardingTip`/`MapProducerCard`/`EventsClient`); kept all back-nav
  prefix-`←`, detail-page list-return links, gallery prev.

**⚠️ DECISION FLAG for Sapir:** the verb fix (V3/V7) uses **plural per ADR-014
HYBRID**, deliberately **overriding the audit's feminine suggestion**. ADR-014
sits above `COPY_STYLE.md §1` in the Truth Hierarchy, and precedent #1092
(`ea81643`) used plural. But `COPY_STYLE.md §1` literally says "feminine
imperative … admin panel included". **These two SoTs disagree** — please
confirm plural, and if so, `COPY_STYLE.md §1` should be reconciled with ADR-014.

**Skipped (ambiguous → log + skip per task):**
- `pwa.ios_instructions` — `הוסף`/`שתף` are **iOS system button labels**
  (proper nouns); the `←` is a step separator, not nav. Untouched.
- `categories.show_more` `← עוד קטגוריות` — prefix arrow on an expand toggle
  (neither back nor forward-CTA). Untouched.
- `en.json` `producers`→`businesses` parity — broader BRAND.md call, deferred.

---

## Task 3 — MEH-229 security (2 LOW) → PR #1109 (DRAFT)

Branch `feature/meh-229-fix-maxlength`. `Field(max_length=200)` on
`ProducerCreate.name` + `ProducerAdminCreate.name` — DB column is already
`String(200)`, so over-length → clean 422 instead of DB 500. Pydantic-only,
**no Alembic**. +2 regression tests.

**pytest deferred to CI:** the sandbox cannot `pip install` backend deps
(permission-denied) and has no local Postgres — the MEH-360 class limitation
the security audit itself documents. The 6 required PR checks (incl. pytest +
ruff) run on the PR. AST-verified locally; no added line > 100 chars.

**Not in scope (deploy-config, not code):** Top-5 #1/#2/#5 — set `CORS_ORIGINS`,
`JWT_SECRET_KEY`, `TRUSTED_PROXY` in prod. Sapir to verify on Railway.

---

## Task 4 — MEH-765 map marker keyboard a11y → PR #1112 (DRAFT)

Branch `feature/meh-765-map-keyboard-a11y`. Closes the deferred Leaflet-marker
finding from the a11y audit. Pins were already focusable (`keyboard:true`,
Enter→click) but the `divIcon` had no accessible name (axe `aria-command-name`).
Added `marker.on("add")` → `role="button"` + `aria-label={producer.name}` on the
element (bound to `add` so clustered/late-rendered pins get named on decluster).

**Central component (`MapComponent.jsx`) → `/adversarial-review` run (rule 20):
0 must-fix.** One non-blocking follow-up: wire Space-key activation to fully
match `role="button"` (Leaflet only wires Enter today).

---

## Task 5 — MEH-233 mobile audit → ALREADY DELIVERED (no duplicate)

The requested deliverable **already exists and is merged on `staging`**:
[`docs/audits/2026-06-mobile-audit-MEH-233.md`](./2026-06-mobile-audit-MEH-233.md)
(2026-06-08) — **exactly** the scope this task asked for:
- same 3 viewports: iPhone SE 375 · Galaxy 360 · iPhone 14 390
- 12 routes, 42 findings (9 CRITICAL / 33 HIGH), Top-10 + per-route tables
- screenshots (`screenshots/MEH-233/`) + per-viewport JSON
  (`MEH-233-findings__*.json`) + triage / false-positive analysis
- spec `frontend/e2e/mobile-audit/mobile-audit.spec.ts` +
  `frontend/playwright.mobile-audit.config.ts`

**Why no re-run / no duplicate PR:**
1. **Infeasible in-sandbox** — no Playwright browsers cached and
   `npx playwright install` needs network (denied, same class as `pip install`);
   the backend can't run (no Postgres), so a re-run would only reproduce the
   **structural-only** subset the existing audit already documents as a known
   blind spot.
2. **Dedup discipline** (workflow rule 27 / meta-pattern #1) — creating a second
   mobile-audit doc from the same data is backlog noise, not reviewable work.

**Recommendation for Sapir:** the open work here is **triaging** the existing
42 findings into per-route sub-MEHs (the audit's own stated next step), and a
**re-run against a seeded staging/preview env** to close the content-density
blind spot — both require an environment the overnight sandbox doesn't have.

---

## Pointers
- Skipped a11y contrast/brand decisions: [`contrast-brand-decisions.md`](./contrast-brand-decisions.md)
- a11y audit (source): [`2026-06-13-a11y.md`](./2026-06-13-a11y.md)
- copy audit (source) + style SoT: [`2026-06-13-copy.md`](./2026-06-13-copy.md) · [`../COPY_STYLE.md`](../COPY_STYLE.md)
- security audit (source): [`2026-06-13-security.md`](./2026-06-13-security.md)
- mobile audit (already delivered): [`2026-06-mobile-audit-MEH-233.md`](./2026-06-mobile-audit-MEH-233.md)
