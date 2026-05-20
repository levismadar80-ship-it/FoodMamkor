# MEH-475 PR-C4b — Phase 0 Inventory

> Planning artifact for the next session. **No code, no PR, no branch — inventory only.** Compiled 2026-05-20 after PR #731 (language toggle) and PR #732 (HANDOFF/CHANGELOG) merged, closing PR-C4a's user-facing scope.

---

## 1. Per-file inventory

| File | LOC | HE-lines | Server/Client | Has JSON-LD | Has `generateMetadata` | Current i18n |
|---|---:|---:|---|---|---|---|
| `about/for-businesses/page.js` | 227 | 31 | Server | ✅ FAQPage | ❌ (static `metadata`) | None |
| `about/for-businesses/guides/product-photography/page.js` | 271 | 86 | Server | ❌ | ❌ (static `metadata`) | None |
| `about/for-businesses/guides/customer-messages/page.js` | 271 | 74 | Server | ❌ | ❌ (static `metadata`) | None |
| `about/for-businesses/guides/business-story/page.js` | 201 | 66 | Server | ❌ | ❌ (static `metadata`) | None |
| `privacy/page.js` | 249 | 78 | Server | ❌ | ❌ (static `metadata`) | None |
| `terms/page.js` | 204 | 61 | Server | ❌ | ❌ (static `metadata`) | None |
| `accessibility/page.js` | 139 | 35 | Server | ❌ | ❌ (static `metadata`) | None |
| `[slug]/recipes/[recipe_id]/page.jsx` | 99 | 2 | Server | ✅ via `<RecipeJsonLd>` (0 HE) | ✅ already async | None |
| **TOTAL (named files)** | **1661** | **433** | — | 2 files | 1 file | — |

**Sweep tail discovery** (server pages with HE + static `metadata` + no `getTranslations`):

| File | HE-lines | Notes |
|---|---:|---|
| `about/page.js` | 4 | Metadata-only |
| `events/page.js` | 5 | Metadata-only (page body is `<EventsClient>`, already wired in PR-C2) |
| `experiences/page.js` | 4 | Metadata-only (body in `<ExperiencesClient>`, PR-C2) |
| `group-buys/page.js` | 4 | Metadata-only (body in `<GroupBuysClient>`, PR-C1) |
| `messages/page.js` | 11 | Server page with body strings + metadata |
| **Sweep tail total** | **28** | ~100 short of the user's `~127` estimate — see §6 |

**Grand total confirmed:** 433 named + 28 sweep tail = **461 HE-lines**. Below the 600-string STOP threshold with ~140 strings of headroom. If user's `~127 sweep tail` estimate is correct, additional pages must exist outside `app/[locale]/*/page.{js,jsx}` (likely nested guides, sub-routes, or `layout.js` files). **Sweep tail re-discovery is the first task of PR-C4b's Phase 0 next session.**

---

## 2. Architectural pattern catalog

| Pattern | Status | Reference | New for PR-C4b? |
|---|---|---|---|
| `useTranslations()` (client) | ✅ Established | All PR-C4a chunks | No |
| `getTranslations()` from `next-intl/server` (server component) | ⚠️ Limited | `map/page.js` (PR-C2) — only file using it | Effectively new (1 file ≠ pattern) |
| `generateMetadata` async function | ✅ Exists (non-i18n) | `[slug]/page.js`, recipe page, `producers/page.jsx`, `producer/[id]/page.js` | Pattern exists for dynamic-data; UNTESTED with `getTranslations()` |
| `generateMetadata` + `getTranslations()` combo | ❌ Untested | none | **NEW** |
| Static `metadata` export with HE strings | ✅ Established | All 8 in-scope files | Must MIGRATE to `generateMetadata` (static `metadata` can't access locale) |
| JSON-LD with translated UI strings | ❌ Untested | `[slug]/page.js` JSON-LD uses DB data (producer name), not UI strings | **NEW** — `about/for-businesses` FAQ JSON-LD is the first case |
| `t.rich()` for inline markup | ❌ Untested | None | **NEW** — required for legal-page JSX bodies |
| Multi-paragraph `\n\n` split via `t()` | ⚠️ Partial | Local helper `renderAnswer()` in `about/for-businesses/page.js:108` | Pattern works if `t()` returns the `\n\n`-joined string |
| `**bold**` markdown markers in translated strings | ⚠️ Partial | Local `renderInline()` (line 98) + `InlineBold` in `GuideArticle.jsx:21` | Pattern works if `t()` returns markers literally |

**Critical takeaway:** **3 patterns are entirely new** to the codebase (`generateMetadata` + `getTranslations`, JSON-LD-with-translated-strings, `t.rich()`). PR-C2's `map/page.js` is the ONLY prior server-component `getTranslations()` precedent — and it explicitly deferred metadata translation to Wave 6 (`map/page.js:45` comment).

---

## 3. SEO risk per page

| File | Risk | Why | Mitigation |
|---|---|---|---|
| `about/for-businesses/page.js` | **HIGH** | FAQPage JSON-LD indexed by Google Rich Results today. Translating `q`/`a` content changes Schema payload on the HE version too (page is `lang=he` so translating to HE keeps current behavior; but if extraction normalizes whitespace or punctuation, Schema canonical hash changes). | Pre/post: run Google Rich Results Test on Vercel preview before merge. Snapshot SERP description in Search Console pre-merge. |
| `privacy/page.js`, `terms/page.js`, `accessibility/page.js` | **MEDIUM** | Legal pages indexed; SERP title + description visible. **MEH-630 amendments are LOCKED legal text** — any translation drift is a legal-compliance risk. EN translations must mirror HE legal semantics exactly. | Apply workflow rule 22 (copy approval gate): each EN legal sentence approved verbatim by Smadar in conversation before extraction. No "improvements." |
| `guides/*` (3) | **MEDIUM** | Article-type, indexed, linked from MEH-539 onboarding emails. Lower Rich-Result density than FAQ. URL stability matters (email links). | Don't change pathnames. Verify `alternates.canonical` URLs still resolve correctly post-i18n. |
| `[slug]/recipes/[recipe_id]/page.jsx` | **LOW** | Only 2 HE strings (404 title + brand suffix). RecipeJsonLd has 0 HE — no Schema risk. | Standard mobile QA suffices. |
| Sweep tail | **LOW** | Metadata-only; no JSON-LD; pages are thin server-component shells around already-i18n'd client components. | Standard build + preview QA. |

---

## 4. Brand-LOCK grep — clean

Ran `grep -nE "שכנות מבשלות מהבית|מהמטבח של השכן|אוכל ביתי|מטבח שכן|שכן מבשל|השכנה מבשלת"` across all 8 in-scope files + `GuideArticle.jsx` + `public/RecipeDetail.jsx`. **Zero matches.** No brand-LOCK STOP triggered in PR-C4b scope at Phase 0.

---

## 5. Proposed chunk split

**5 sub-PRs.** Order chosen to build pattern confidence on lowest-risk files first; highest-stakes (legal) reserved for when patterns are solid.

### D1 — Recipe stub (`[slug]/recipes/[recipe_id]/page.jsx`)

- **Scope:** 2 strings (404 fallback title, brand suffix in title template)
- **Pattern introduced:** `generateMetadata` + `getTranslations()` combo. First use in codebase.
- **Risk:** LOW
- **Effort:** ~1h (mostly Phase 0 + verification)
- **Why first:** smallest possible test of the new server-component metadata pattern. If `getTranslations()` inside `generateMetadata` works for dynamic params, the same shape extends to D2-D5. If it doesn't, D2-D5 all need a fallback approach.

### D2 — About/for-businesses FAQ (single file, JSON-LD)

- **Scope:** 31 strings, 1 file (`about/for-businesses/page.js`)
- **Patterns introduced:** Translated UI strings populating JSON-LD `FAQPage` schema. `\n\n`-split paragraph translation via existing `renderAnswer()` helper.
- **Risk:** HIGH (Rich Results regression)
- **Effort:** ~3h (extraction + JSON-LD validation cycle)
- **Why second:** the JSON-LD-translation pattern needs proof on a SINGLE file before scaling. FAQ is the only JSON-LD case in this scope; recipe page has 0 HE JSON-LD strings.
- **DoD addition:** Google Rich Results Test PASS on `/he` and `/en` previews before merge.

### D3 — Guides (3 files, BLOCKS array)

- **Scope:** 266 strings across 3 files (~88/74/66 each)
- **Pattern introduced:** Translating structured-data `BLOCKS = [{type, text}]` arrays. Each block's `text` field becomes a `t()` lookup; `**bold**` markers preserved literally in the value.
- **Risk:** MEDIUM (volume + onboarding-email link stability)
- **Effort:** ~6h (largest chunk in PR-C4b)
- **Why third:** BLOCKS pattern is structurally simple but voluminous. Must run AFTER D2 confirms the JSON-LD-clean-translation pattern, because `GuideArticle.jsx` is rendered on the same `/about/for-businesses/*` URL family and a Phase-0 error in D2 would land twice.
- **Sub-chunk option:** D3a (product-photography), D3b (customer-messages + business-story) if 6h is too long. 88 + (74+66) = roughly even split.

### D4 — Legal (privacy + terms + accessibility, `t.rich()`)

- **Scope:** 174 strings across 3 files (78/61/35)
- **Patterns introduced:** `t.rich()` for JSX-body translations. First codebase use.
- **Risk:** HIGH (legal compliance — MEH-630 amendments locked, EN translation = legal liability)
- **Effort:** ~4h
- **Why fourth:** legal copy demands the most attention; placing it AFTER D1-D3 means the technical patterns are solid and only legal-text fidelity remains as a variable. **Workflow rule 22 gate fires here**: every EN legal sentence approved verbatim in conversation before extraction.
- **Pre-flight:** Phase 0 of D4 should grep `docs/SECURITY.md` and `MEH-630` for the canonical HE legal text, snapshot it, and pin against the extracted values to catch drift.

### D5 — Sweep tail (~28 confirmed + ~100 to discover)

- **Scope:** ~28 confirmed (`about/page.js`, `events/page.js`, `experiences/page.js`, `group-buys/page.js`, `messages/page.js`) + ~100 to discover in next-session Phase 0
- **Pattern introduced:** None new (all metadata-only — `generateMetadata` + `getTranslations()` pattern from D1)
- **Risk:** LOW
- **Effort:** ~2h
- **Why last:** mechanical bulk after all 5 patterns are battle-tested.

**Total estimated PR-C4b effort:** ~16h across 5 sessions. Each sub-PR maps to one session.

---

## 6. STOP criteria (PR-C4b-specific, beyond PR-C4a's set)

Triggers that justify PAUSING the chunk plan and reporting to Smadar:

1. **Scope > 600 strings.** Current confirmed: 461. If sweep-tail re-discovery surfaces > 140 additional strings → STOP and re-plan, possibly defer Legal (D4) to its own wave.

2. **`generateMetadata` + `getTranslations()` requires a Suspense wrapper or `experimental` flag in `next.config.js`.** PR-C2's `map/page.js` uses `getTranslations()` at the page-body level, not inside `generateMetadata`. If the metadata-time combination needs framework-level config changes → STOP, escalate to architectural review.

3. **JSON-LD validation fails on D2 preview.** If Google Rich Results Test shows a different result for the HE version pre vs post → STOP. The current FAQPage Schema is indexed; regression here is visible in Search Console within ~7 days. Don't ship D2 unless validator passes.

4. **Legal EN translation introduces semantic drift on a MEH-630 sentence.** If the EN equivalent of a locked legal sentence requires interpretation (not literal translation), STOP and defer D4 to a separate "Legal i18n" wave with attorney review (or accept HE-only for `/en/privacy`, `/en/terms`, `/en/accessibility` and ship HE→HE-only translation, leaving EN routes unrouted).

5. **`t.rich()` introduction ripples beyond D4.** If wiring `t.rich()` for legal bodies requires changes to `next-intl` config, layout providers, or test mocks beyond Header/RecipeCard's existing pattern → STOP and treat as a separate architectural ticket. The `useTranslations` mock weakness already in MEH-629 item 5 may need to land first.

6. **Discovery in sweep tail surfaces an `app/(group)/...` route or non-`[locale]` server page with HE strings.** Indicates the route grouping bypassed PR-C4a — re-scope.

---

## 7. Open questions for next-session Phase 0

1. **`t.rich()` test-mock shape.** Does our existing `vi.mock("next-intl")` pattern (used in 6+ test files) support `t.rich()`? If not, MEH-629 item 5 (`useTranslations` mock namespace) might need to land FIRST to avoid coupling D4 to a mock refactor.

2. **`about/for-businesses` FAQ — keep `renderInline()` local or extract to `lib/markdown.js`?** D3 (guides) uses the same `**bold**` convention via `GuideArticle.InlineBold`. Two copies of the same logic. Refactor opportunity vs scope-creep risk. Default: keep local.

3. **MEH-630 legal copy — is the HE locked or is editorial review still possible?** If still possible, do that BEFORE D4 starts (Linear comment to Smadar). Translating then editing then re-translating is wasted work.

4. **`alternates.canonical` URLs in metadata** — do they need `/en/` prefix in EN locale? next-intl middleware handles route-prefix but canonical URLs in metadata are author-controlled. Pre-D1 question.

5. **Sweep tail re-discovery** — find the missing ~100 strings the user's estimate accounts for. Try: nested `layout.js` files, sub-routes I missed (e.g., `recipes/page.js` listing), pages under `app/admin/*` that PR-A1/B might have left, `[locale]/page.js` (homepage), `[locale]/contact/page.js`.

---

## 8. Phase 0 outcome — green light?

**Yes, conditionally.**

- ✅ Total scope under STOP threshold (461 ≤ 600 confirmed)
- ✅ Brand-LOCK clean
- ✅ Risk-stratification clear (1 HIGH, 3 MEDIUM, 4 LOW)
- ✅ Pattern catalog identifies 3 NEW patterns + 1 established + 1 partial
- ✅ Chunk split balances pattern-confidence build vs scope concentration
- ⚠️ Sweep tail estimate has ~100-string gap that needs next-session re-discovery
- ⚠️ Three NEW architectural patterns introduced in sequence — D1 (combo), D2 (JSON-LD), D4 (`t.rich`) — each is its own gate
- ⚠️ MEH-629 item 5 (test mock namespace) MAY need to land before D4 — check at D4 Phase 0

**Recommendation: proceed with D1 in the next session** as the smallest-possible pattern test (2 strings, 1 file). D2-D5 each gated by the prior sub-PR's verdict.

---

## Cross-references

- PR #731 (language toggle, merged `3a877ed2`) — closed PR-C4a scope
- PR #732 (docs handoff, merged `0822428e`) — bookkeeping
- `frontend/app/[locale]/map/page.js:2,47` — only existing `getTranslations()` precedent
- `frontend/app/[locale]/about/for-businesses/page.js:82,98,108` — `buildFaqJsonLd` + `renderInline` + `renderAnswer` local helpers
- `frontend/components/GuideArticle.jsx:21` — `InlineBold` (shared markdown renderer)
- MEH-629 (pre-launch hygiene, 7 items, P3) — item 5 may block D4
- MEH-630 (legal disclosure amendments) — locked text source for D4
- Workflow rule 22 (copy approval gate) — fires on D4
- Workflow rule 24 (scope-creep prevention) — applies across all 5 sub-PRs
