# i18n migration plan — MEH-366

**Linear:** MEH-366 (parent) · sibling to MEH-367 (i18n-scanner template-literal fix) · plan-only ticket; sub-tickets per Wave open after this plan is approved.
**Branch:** `feature/meh-366-i18n-scoping`
**Status:** PLAN — awaiting Smadar approval before Step E (sub-ticket creation).
**Date:** 2026-05-07.
**Working baseline:** 1,721 hardcoded Hebrew strings across 142 frontend files (corrected — see §0 and §3.1).

---

## Table of contents

- [0. Executive summary](#0-executive-summary)
- [1. Stack recommendation](#1-stack-recommendation)
- [2. Wave breakdown](#2-wave-breakdown)
- [3. Baseline measurement + top-50 strings](#3-baseline-measurement--top-50-strings)
- [4. Key-naming convention](#4-key-naming-convention)
- [5. Translation workflow (Hebrew canonical, English derived)](#5-translation-workflow-hebrew-canonical-english-derived)
- [6. SEO + URL strategy](#6-seo--url-strategy)
- [7. Risk register](#7-risk-register)
- [8. Open questions](#8-open-questions)
- [9. Wave 1 prerequisites](#9-wave-1-prerequisites)
- [10. Success metrics + exit criteria](#10-success-metrics--exit-criteria)

---

## 0. Executive summary

**Goal:** ship Hebrew + English locale support in a phased, reversible migration. Each Wave merges to staging independently. No big-bang flip.

**Three findings from discovery materially changed the original plan premise — surfacing here, not in an appendix:**

### Finding A — A homegrown LanguageProvider already exists

`frontend/lib/language-context.js` is a working React Context with:
- `t()` lookup, `lang` state, `setLang(code)` mutator, `useLanguage()` hook
- 39 keys × 2 locales (`he`, `en`)
- localStorage persistence (`STORAGE_KEY = "lang"`)
- Imperative `<html lang>` and `dir` mutation on locale change

Real consumers in product code: **4 files** — `Header.jsx`, `BottomNav.jsx`, `use-home-page.js`, plus the provider itself. Coverage: ~75 strings translated against a base of 1,721 → **~4% covered**.

**Implication for Wave 1:** the work is **migration**, not greenfield install. We adopt next-intl alongside the existing provider (strangler-fig pattern — see §2.1), port the 39 keys with the new naming convention from §4, cut the 4 consumers over to `useTranslations()`, and only delete `language-context.js` once Wave 2 has run stably on staging for 7+ days. Wave 1 effort estimate revised from "6–10h" (greenfield) to **12–18h** (migration + cutover + verification).

### Finding B — Baseline is 1,721 / 142, not 2,284 / 124

> **Baseline correction.** Prior MEH-345 measurement reported 2,284 strings across 124 files. Re-measurement during MEH-366 discovery, using equivalent methodology with three additions — (1) skip block comments, (2) exclude `.test`/`.spec` files, (3) exclude `frontend/lib/language-context.js` translation dictionary as it is not "missing translation" — yields 1,721 strings across 142 files. The delta is methodology, not codebase change. Use **1,721** as the working baseline; the 2,284 figure was directional, not authoritative.

The 1,721 figure was produced by a deterministic Python scan run inside this session (sample provenance in §3.2) after the i18n-scanner subagent overflowed its own context window (see Finding C and §7 R-7).

### Finding C — Real route count is 51 page files, sitemap is dynamic

`frontend/app` contains **51 `page.{js,jsx}` files** (incl. admin sub-routes). `frontend/app/sitemap.js` already exists and **fetches the API at build time** to enumerate dynamic producer + event URLs alongside 8 static routes. Wave 6's hreflang work is therefore **extension** of the existing generator (per-locale duplication of every entry), not a fresh sitemap implementation.

### Headline plan shape

| Wave | Scope | Effort | Ships |
|---|---|---|---|
| 1 | Install next-intl, port homegrown 39 keys, cut 4 consumers, route shell `[locale]` | **12–18h** | infra + tiny visible surface |
| 2 | Header + Footer + Hero + home-page strings (~150 strings, ~8 files) | 6–10h | first user-visible bilingual surface; retire `language-context.js` |
| 3 | Producer detail + producer card + map widgets (~400 strings, ~30 files) | 12–18h | business-critical bilingual surfaces |
| 4 | Authenticated user flows: login/register, profile, dashboards (~500 strings, ~40 files) | 14–20h | full app bilingual at runtime |
| 5 | Long tail + admin + language toggle UI (~700 strings, ~64 files) | 10–14h | switch in nav + admin parity |
| 6 | SEO surfaces: sitemap.js extension, hreflang, OG metadata per locale | 4–6h | search-engine-visible English |

Total: **58–86 engineer-hours** across 6 PRs. Scope-shifts smaller than ±20% absorbed in-Wave; larger shifts → re-plan ticket.

### What this plan does NOT do

- Translate the 1,721 strings (manual or LLM batch — that's a Wave-internal task, scoped per Wave).
- Add a third locale (Arabic / Russian) — explicitly out-of-scope. Architecture should not preclude it; sub-§4.3.
- Refactor RTL CSS (the codebase already uses RTL logical properties per `.claude/rules/rtl.md`).
- Replace the gendered-verb voice rule (CLAUDE.md). EN strings will be gender-neutral; HE stays feminine canonical (Q7 caveat — §8).

---

## 1. Stack recommendation

### 1.1 Pick — `next-intl` v3.x

**Decision:** `next-intl` for the App Router migration. Confidence: high. Reversibility: medium (a future swap to react-i18next would cost ~2 days; key files would carry over, only the runtime hook changes).

### 1.2 Comparison matrix

| Stack | App Router fit | Bundle (gz) | Hebrew RTL guidance | Verdict |
|---|---|---|---|---|
| **next-intl 3.x** | Native — designed RSC-first | ~14KB | Per-locale `dir` documented in App Router layout | **Pick** |
| next-i18next | Pages Router-first; App Router via workarounds | ~145KB unpacked | Indirect; community examples scarce | Reject |
| react-i18next | Manual SSR plumbing for App Router | ~891KB unpacked | Strong general RTL but no App Router guide | Reject |
| Homegrown (status quo) | Works but limited | ~3KB | Already shipped | Reject — see §1.3 |

Sources verified 2026-05-07: [next-intl App Router guide](https://next-intl.dev/docs/getting-started/app-router/with-i18n-routing), [Next.js i18n official docs](https://nextjs.org/docs/app/guides/internationalization), [Phrase: Next.js App Router localization](https://phrase.com/blog/posts/next-js-app-router-localization-next-intl/), [DEV: i18n libraries 2026 comparison](https://dev.to/erayg/best-i18n-libraries-for-nextjs-react-react-native-in-2026-honest-comparison-3m8f), [IntlPull next-intl 2026 guide](https://intlpull.com/blog/next-intl-complete-guide-2026).

### 1.3 Migration vs keep homegrown — the weighing

The homegrown `language-context.js` is functional. It works for the 4 consumers it's wired to. Why migrate?

| Capability | Homegrown | next-intl | Why it matters for Mehamakor |
|---|---|---|---|
| ICU MessageFormat | ❌ | ✅ | Hebrew has dual + plural forms. `{count, plural, one {# פריט} two {# פריטים} other {# פריטים}}` cannot be expressed in flat key=string lookup. |
| Locale-aware dates | ❌ | ✅ via `next-intl/Intl` wrapper | "5 בנובמבר 2026" vs "November 5, 2026" — Producer cards + event dates appear in 30+ components. |
| Locale-aware numbers | ❌ | ✅ | Currency formatting, thousand separators (HE/EN both use `,` but RTL contexts mis-render without locale tag). |
| Server Component support | ❌ (Context = client only) | ✅ Native | App Router's RSC default means today's homegrown forces every translatable component to `"use client"`, which has bundle-size + interactivity cost. Several producer-detail components are unnecessarily client-side because of this. |
| Pluralization | Manual `if`/`else` | ICU built-in | Hebrew's dual form (זוגי) is genuinely hard without ICU. |
| Type safety | None | Generated `IntlMessages` type | 1,721 strings → typo-driven runtime "key not found" without typing. |
| Build-time validation | None | next-intl plugin warns on missing keys | Catches drift before staging. |

**Net:** the homegrown solution is a working sketch, not a ceiling. Migration cost is bounded (39 keys, 4 consumers — Wave 1 absorbs it) and unblocks features we already need (plurals on producer cards, locale-aware dates). Keeping it would force re-implementing each capability as we hit it — a worse trajectory.

### 1.4 next-intl integration shape

```
frontend/
├── messages/
│   ├── he.json          # canonical
│   └── en.json          # derived
├── i18n/
│   ├── routing.ts       # defineRouting({ locales: ['he','en'], defaultLocale: 'he', localePrefix: 'as-needed' })
│   ├── request.ts       # getRequestConfig — load messages by locale
│   └── navigation.ts    # createNavigation(routing) — Link / redirect / useRouter
├── middleware.ts        # createMiddleware(routing)
└── app/
    └── [locale]/
        ├── layout.js    # NextIntlClientProvider + html lang/dir from params.locale
        └── ...          # existing app routes nested under [locale]
```

`localePrefix: 'as-needed'` means `/` and `/producer/123` stay Hebrew (default locale, no prefix), `/en` and `/en/producer/123` are English. Hebrew URLs are unchanged → zero existing-link breakage. SEO §6 handles the canonical/hreflang implications.

### 1.5 Strangler-fig coexistence

During Wave 1 → Wave 2 transition, both providers live in the tree:
- `NextIntlClientProvider` wraps the app at `app/[locale]/layout.js`
- `LanguageProvider` (homegrown) stays mounted in `app/layout.js` until Wave 2 lands
- Components migrated to `useTranslations()` ignore `useLanguage()` and vice versa
- `setLang()` from homegrown delegates to next-intl's `useRouter().push()` once Wave 5's toggle lands

The provider is removed in Wave 2's final commit, after staging burn-in (≥7 days, no regression reports).

---

## 2. Wave breakdown

### 2.1 Wave 1 — infra + cutover (12–18h)

**Sub-ticket:** MEH-XXX (opened in Step E).
**Branch base:** `staging`.

**Scope:**
1. `npm install next-intl@^3` (verify peer-deps against Next 14).
2. Create `frontend/i18n/{routing,request,navigation}.ts` per §1.4.
3. Create `frontend/middleware.ts` invoking `createMiddleware(routing)`.
4. Move `frontend/app/*` under `frontend/app/[locale]/` — bulk rename, update imports if any reference `app/` absolute paths.
5. Wrap root layout in `NextIntlClientProvider`, set `<html lang dir>` from `params.locale`.
6. Create `frontend/messages/he.json` + `frontend/messages/en.json` with the 39 ported keys (renamed per §4).
7. Cut over 4 consumers to `useTranslations()`: `Header.jsx`, `BottomNav.jsx`, `use-home-page.js`, plus the provider file itself (which becomes a no-op shim until Wave 2).
8. Apply the template-literal regex fix to the i18n-scanner agent (small — see §9.1).
9. Mark `frontend/lib/language-context.js` with a deprecation banner comment + Linear ticket reference; do **not** delete yet.

**Out of scope for Wave 1:** translating any string beyond the 39 already-translated keys, touching any other component, language toggle UI work.

**DoD:** `npm run build` clean; staging Vercel preview navigable at both `/` and `/en/`; Header + BottomNav visibly bilingual via the existing toggle (homegrown `setLang` still wired); `pytest tests/test_api.py` unchanged green; `/adversarial-review` clean.

**Rollback:** revert the PR; homegrown provider is still in place.

### 2.2 Wave 2 — Header / Footer / Hero / home-page (6–10h)

Translate ~150 strings across ~8 files. Retire `frontend/lib/language-context.js` in this Wave's final commit (after staging burn-in from Wave 1). Q7 (gender normalization) **must be answered before this Wave starts** — it determines whether `common.loading` is a single key or two (`common.loading_m` + `common.loading_f`).

### 2.3 Wave 3 — Producer detail + card + map (12–18h)

~400 strings, ~30 files. Highest visibility surface for end users. Hits MapClient (central component — `/adversarial-review` mandatory even if build fails per `.claude/rules/testing.md` §Exception). ICU plural handling lands here first (`{count, plural, ...}` for review counts, distance ranges).

### 2.4 Wave 4 — Auth + profile + dashboards (14–20h)

~500 strings, ~40 files. Includes login/register forms — `auth.py` adjacent surface, so PRs touching these files get the additional web-search CVE check per `.claude/rules/security.md`.

### 2.5 Wave 5 — Long tail + admin + language toggle UI (10–14h)

~700 strings across the remaining ~64 files (admin panel, settings, less-trafficked surfaces). Wave 5 also wires the **language toggle** in the global nav: updates the homegrown placeholder UI to call `useRouter().push(pathname, {locale: nextLocale})` (next-intl pattern). Toggle UI was partially scaffolded in homegrown's `setLang`; Wave 5 finishes and styles it per `docs/DESIGN.md`.

### 2.6 Wave 6 — SEO surfaces (4–6h)

Extend `frontend/app/sitemap.js` (don't replace) to emit per-locale URLs for every entry. Add hreflang tags per `<head>` in `app/[locale]/layout.js`. Update OG metadata to read brand name from a constant (Q6) and translate description per locale. Update `robots.txt` if needed.

---

## 3. Baseline measurement + top-50 strings

### 3.1 Baseline correction

> Prior MEH-345 measurement reported 2,284 strings across 124 files. Re-measurement during MEH-366 discovery using equivalent methodology (with three additions: skip block comments, exclude `.test`/`.spec` files, exclude `language-context.js` translation dictionary as it's not "missing translation") yields **1,721 strings across 142 files**. The delta is methodology, not codebase change. Use 1,721 as the working baseline. The 2,284 figure was directional, not authoritative.

Per-Wave string targets (§2) are derived from this 1,721 baseline. Each Wave's PR description must cite the post-Wave residual count and method used to compute it (preferably the deterministic Python scan in §3.3, not the i18n-scanner agent until §9 prerequisites land).

### 3.2 Raw provenance (sample, not fabricated)

Excerpt of the deterministic scan output, file:line:string — used to ground the 1,721 figure in real data:

```
frontend/app/about/AboutClient.jsx:13 — 'למה ביצים אורגניות שוות את המחיר?'
frontend/app/about/AboutClient.jsx:17 — 'מה זה grass-fed בישראל?'
frontend/app/about/AboutClient.jsx:21 — 'דבש מהסופר vs. דבש לא מחומם — מה ההבדל?'
frontend/app/about/AboutClient.jsx:27 — 'ייצור עצמי או משפחתי — לא סוחרים ולא מפיצים'
frontend/app/about/AboutClient.jsx:28 — 'חומרי גלם איכותיים ומזוהים'
frontend/app/about/AboutClient.jsx:29 — 'ללא חומרים משמרים מלאכותיים'
frontend/app/about/AboutClient.jsx:30 — 'שקיפות מלאה על תהליך הייצור'
frontend/app/about/AboutClient.jsx:31 — 'עמידה בתקני בטיחות מזון בסיסיים'
frontend/app/about/AboutClient.jsx:48 — 'תודה! נחזור אליך בקרוב 🌿'
frontend/app/about/AboutClient.jsx:52 — 'משהו השתבש, נסי שוב'
```

### 3.3 Top-50 reusable strings (by file-count, then total occurrences)

Sorted descending by **file-count** (number of distinct files using the string), tie-break by total occurrences. These strings are the highest-leverage Wave 1/2 wins — translating each once eliminates many call-sites.

| Rank | Files | Total | String |
|---|---|---|---|
| 1 | 15 | 17 | מהמקור |
| 2 | 13 | 13 | משהו השתבש, נסי שוב |
| 3 | 10 | 10 | בית |
| 4 | 9 | 11 | עיר |
| 5 | 8 | 8 | חינם |
| 6 | 8 | 8 | טוען... |
| 7 | 8 | 8 | טוענת... |
| 8 | 7 | 8 | חפשי עיר... |
| 9 | 7 | 7 | פעולות |
| 10 | 6 | 7 | חוויות |
| 11 | 6 | 7 | מהמטבח של השכן |
| 12 | 6 | 6 | סגור |
| 13 | 5 | 9 | אחר |
| 14 | 5 | 8 | שומרת... |
| 15 | 5 | 6 | ביקורות |
| 16 | 5 | 5 | אירועים |
| 17 | 5 | 5 | שולחת... |
| 18 | 4 | 9 | סדנה |
| 19 | 4 | 8 | טעימות |
| 20 | 4 | 5 | אימייל |
| 21 | 4 | 5 | מוצרים |
| 22 | 4 | 5 | קטגוריה |
| 23 | 4 | 5 | קטגוריות |
| 24 | 4 | 4 | בתי עסק |
| 25 | 4 | 4 | מעלה... |
| 26 | 4 | 4 | סגרי |
| 27 | 4 | 4 | סטטוס |
| 28 | 4 | 4 | ערים מובילות |
| 29 | 4 | 4 | שומר... |
| 30 | 4 | 4 | שם |
| 31 | 4 | 4 | תאריך |
| 32 | 4 | 4 | תוכן |
| 33 | 3 | 6 | חיפוש |
| 34 | 3 | 5 | אין נתונים להצגה |
| 35 | 3 | 5 | בישול |
| 36 | 3 | 5 | חקלאות |
| 37 | 3 | 5 | סיור אוכל |
| 38 | 3 | 5 | תזונה |
| 39 | 3 | 4 | בית עסק |
| 40 | 3 | 4 | הכל |
| 41 | 3 | 4 | טלפון |
| 42 | 3 | 4 | סיסמה |
| 43 | 3 | 4 | סנן לפי עיר |
| 44 | 3 | 4 | עסק |
| 45 | 3 | 4 | פרסמי מוצר |
| 46 | 3 | 4 | פתוח להזמנות |
| 47 | 3 | 3 | או |
| 48 | 3 | 3 | אודות |
| 49 | 3 | 3 | בהפסקה ⏸ |
| 50 | 3 | 3 | דירוג |

Three observations actionable in Wave 1/2:
- **Rank 1 ("מהמקור" — 15 files) is the brand name.** It should be a constant `BRAND_NAME` in `lib/constants.js`, **not** a translation key. Brand stays "מהמקור" in EN UI per the existing OG metadata convention. See Q6 / §8.
- **Ranks 6/7/14/17/29 are gender-paired loading states** (`טוען`/`טוענת`, `שומר`/`שומרת`, `שולחת`). Q7 decision determines whether these collapse to one feminine key or stay paired. CLAUDE.md voice rule says feminine.
- **Ranks 22/23/35/36/37/38 are categories** (`קטגוריה`, `קטגוריות`, `בישול`, `חקלאות`, `סיור אוכל`, `תזונה`). Categories are data, not UI — they belong in DB or a categories module, translated server-side. Wave 3 covers this when producer detail lands.

---

## 4. Key-naming convention

### 4.1 Pattern

`{namespace}.{component_or_surface}.{semantic_id}`

Three parts, lowercase, snake_case within parts, dots between parts. Maximum 3 levels — flat enough to grep, deep enough to disambiguate.

### 4.2 Namespaces

| Namespace | Use for | Example |
|---|---|---|
| `common` | Strings reused ≥3 files (top-50 §3.3 and continuations) | `common.loading`, `common.close`, `common.email` |
| `nav` | Navigation chrome — Header, BottomNav, Footer, breadcrumbs | `nav.home`, `nav.experiences`, `nav.account` |
| `home` | Home page (`app/[locale]/page.js`) | `home.hero.title`, `home.cta.publish` |
| `producer` | Producer card + producer detail surfaces | `producer.detail.about`, `producer.card.distance_km` |
| `map` | `/map` page + map widgets | `map.legend.verified`, `map.search.placeholder` |
| `auth` | Login, register, password reset, OAuth | `auth.login.submit`, `auth.register.gdpr_consent` |
| `account` | Authenticated user profile + dashboards | `account.profile.save`, `account.dashboard.empty` |
| `admin` | Admin panel (less-trafficked, Wave 5) | `admin.moderation.approve` |
| `validation` | Form validation messages — schema-driven | `validation.required`, `validation.phone_format` |
| `seo` | Meta titles, descriptions, OG strings | `seo.home.title`, `seo.producer.description` |
| `error` | Error boundary, network failures, generic toasts | `error.generic`, `error.network` |

### 4.3 Adding a third locale (out-of-scope but unblocked)

The convention is locale-agnostic. Adding `messages/ar.json` requires only:
1. Adding `'ar'` to `routing.ts` locales array.
2. Adding RTL handling for `ar` in the layout's `dir` switch (already exists for `he`).
3. Translating the JSON file.

No code changes outside `messages/` and `routing.ts`. This is the architectural property worth preserving — don't bake `he`/`en` assumptions into key names or component logic.

### 4.4 ICU usage

Plurals: `producer.card.review_count` → `'{count, plural, =0 {אין ביקורות} one {ביקורת אחת} two {שתי ביקורות} other {# ביקורות}}'`. Hebrew dual form (`one`/`two`/`other`) is the reason we picked next-intl over a flat-key library.

Dates: prefer `next-intl/format` over inline `Intl.DateTimeFormat` so locale changes are reactive.

---

## 5. Translation workflow (Hebrew canonical, English derived)

### 5.1 Source of truth

`messages/he.json` is canonical. `messages/en.json` is derived. Translators (or LLM-assisted batches) work HE → EN, never EN → HE. Prevents the common drift where UX writes Hebrew, EN gets stale, then a future EN edit silently overrides Hebrew nuance.

### 5.2 Pipeline (per Wave)

1. Component refactor extracts strings → adds keys to `he.json` with HE values.
2. CI lint: every key in `he.json` must exist in `en.json` (next-intl's plugin enforces). Missing keys → CI fail.
3. Batch translation pass on missing EN keys (LLM with HE+context, then human review for tone — see §5.3).
4. PR description lists "new keys translated this Wave" so reviewers can spot-check tone.

### 5.3 LLM-assisted translation tone constraints

- EN copy is **gender-neutral** ("Save" not "Save (m.)" / "Save (f.)") — English doesn't have grammatical gender on verbs, so this is automatic.
- Brand name "מהמקור" stays "מהמקור" in EN UI per OG metadata precedent (Q6).
- Domain terms preserved per `docs/DESIGN.md` micro-copy table — "בית עסק" → "small business" not "producer" (per CLAUDE.md voice rule).
- LLM prompts include the relevant `docs/DESIGN.md` micro-copy table excerpt as context.

### 5.4 Translator handoff (post-MEH-366)

If/when Smadar engages a human translator for tone polish, they receive:
- `messages/en.json` (current LLM-assisted draft)
- `docs/DESIGN.md` micro-copy table (English column to be filled)
- A glossary of domain terms (producer = small business, not יצרן literal)

Out of scope for this plan — tracked as a future v2 ticket.

---

## 6. SEO + URL strategy

### 6.1 URL shape

`localePrefix: 'as-needed'` (next-intl):
- HE (default): `mehamakor.online/`, `/producer/123`, `/map`
- EN: `mehamakor.online/en/`, `/en/producer/123`, `/en/map`

Hebrew URLs are unchanged. Existing inbound links (Google index, Instagram bios, Facebook posts) keep working without redirects. EN traffic is greenfield.

### 6.2 hreflang

In `app/[locale]/layout.js`, generate per-locale `<link rel="alternate" hreflang="...">` tags:
```
<link rel="alternate" hreflang="he-IL" href="https://mehamakor.online/{path}" />
<link rel="alternate" hreflang="en"     href="https://mehamakor.online/en/{path}" />
<link rel="alternate" hreflang="x-default" href="https://mehamakor.online/{path}" />
```
`x-default` points to HE (Israeli audience is the primary market).

### 6.3 Sitemap — extend, don't rewrite

`frontend/app/sitemap.js` already exists and dynamically fetches API at build for producer + event URLs. Wave 6 modifies the existing generator to emit each URL twice — once at the HE root, once under `/en/` — with the appropriate `alternates.languages` entries per the [Next.js sitemap reference](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap#generating-a-localized-sitemap). No new file; surgical edit to the existing one.

### 6.4 OG + canonical metadata

`generateMetadata({ params: { locale } })` per route returns `title` + `description` + `alternates.canonical` + `alternates.languages` per locale. Brand stays "מהמקור" in `siteName` regardless of `locale` (Q6).

### 6.5 robots.txt

No change anticipated. `/en/*` is already crawlable under the existing `robots.txt`. If Smadar wants to delay EN indexing until translations are complete, add `Disallow: /en/` until Wave 5 ships, then remove.

---

## 7. Risk register

Risks ordered by **impact × likelihood**, highest first. Each row names the mitigation owner and the gating Wave.

| ID | Risk | Likelihood | Impact | Mitigation | Owner | Wave gate |
|---|---|---|---|---|---|---|
| R-1 | **Homegrown → next-intl regression on Header / BottomNav / home-page** during Wave 1 cutover. The 4 existing consumers are visible on every page; a bad cutover ships Hebrew "key not found" placeholders site-wide. | Medium | High | Strangler-fig coexistence (§1.5) — both providers mounted during Wave 1; Wave 2 deletes homegrown only after 7-day staging burn-in; mobile preview check before Wave 1 merge per `.claude/rules/deployment.md`; `/adversarial-review` mandatory. | CC | Wave 1 |
| R-2 | **Hebrew dual/plural form gets translated incorrectly** by LLM in Wave 3 (producer cards have `{N} ביקורות` everywhere). Hebrew has 4 plural forms (`zero`/`one`/`two`/`other`); LLM batches frequently miss `two`. | Medium | High | `messages/he.json` reviewed by Smadar (native speaker) before Wave 3 PR opens; ICU plural lint check that fails CI when HE key has plural variants but EN doesn't, or vice versa. | Smadar (review) | Wave 3 |
| R-3 | **MapClient (central component) breaks during Wave 3** due to next-intl's RSC/client boundary. MapClient is `"use client"` already; Leaflet refs interact with locale changes unpredictably. | Medium | High | Wave 3 must run `/adversarial-review` even if build fails (central component exception per `.claude/rules/testing.md`); MapClient touch requires the 4-step Vibe Coding Guardrails protocol per `docs/CENTRAL_COMPONENTS.md`. | CC | Wave 3 |
| R-4 | **Auth flows (Wave 4) introduce a CSRF or login bypass** because the locale-prefix middleware accidentally affects auth route handling. | Low | Critical | Wave 4 PR triggers the web-search CVE check per `.claude/rules/security.md`; pytest auth-guard tests must pass; login/register Playwright flows (already mandatory per `.claude/rules/testing.md`) re-run on both `/auth/login` and `/en/auth/login`. | CC | Wave 4 |
| R-5 | **SEO regression — duplicate content penalty** if hreflang is missing or wrong in Wave 6, causing Google to view HE and EN as duplicate Hebrew content. | Medium | Medium | hreflang wired in `app/[locale]/layout.js` from Wave 1 (not deferred to Wave 6); Wave 6 only extends sitemap; manual verification via Google Search Console after Wave 6 merges to staging; rollback plan = revert sitemap commit only (hreflang stays). | CC + Smadar | Wave 6 |
| R-6 | **Translation quality drift** — LLM-translated EN copy diverges from `docs/DESIGN.md` voice across Waves 2–5. Each Wave translates ~150–700 strings; tone consistency hard to maintain across 4 PRs. | High | Medium | LLM prompt template includes `docs/DESIGN.md` micro-copy table excerpt + previous-Wave EN samples; Smadar spot-checks each Wave's PR before merge; post-MEH-366 ticket to engage human translator for polish pass once Wave 5 ships. | Smadar (spot-check) | Each Wave 2–5 |
| R-7 | **i18n-scanner subagent has a context-window scalability bug** — it overflowed during MEH-366 discovery (194 tool uses on 124+ files → "Prompt is too long"). This blocks measurement-of-progress in Wave 2+ unless replaced by a deterministic Python script. **Distinct from the template-literal regex gap** (MEH-367) — that's correctness; this is scalability. | High | Medium | Open SEPARATE follow-up ticket (sibling to MEH-345/MEH-367, NOT bundled into Wave 1); scoped to: (a) chunked-scope mode (run per-folder, aggregate) OR (b) replace agent invocation with deterministic Python script in repo. Until then, Wave PRs cite the deterministic Python scan from §3 for residual-string counts. | CC | Wave 2 onward |
| R-8 | **Q7 (gender normalization) UI surprise** — defaulting all loading states to feminine could surprise users who expect masculine variants in some contexts (admin panel addressing site owner generically?). UI change beyond key consolidation. | Low | Medium | Q7 explicitly flagged in §8 as **requires Smadar decision before Wave 2**. Default per CLAUDE.md voice rule is feminine, but Smadar's call. | Smadar | Pre-Wave-2 |
| R-9 | **Brand-name choice (Q6) shipped wrong** — if "מהמקור" is wrapped as a translation key and EN translation drifts to "Mehamakor" / "From The Source" / inconsistency. | Low | Low | Q6 default: brand = constant `BRAND_NAME` in `lib/constants.js`, NOT a translation key. Wave 1 establishes the constant; subsequent Waves consume it. | CC | Wave 1 |
| R-10 | **Sitemap.js dynamic build-time fetch fails** during Wave 6 because the API returns localized data and the generator wasn't designed for per-locale enumeration. | Low | Medium | Wave 6 reads existing `sitemap.js` end-to-end before editing (file-preservation rule); test build locally with HE+EN before pushing; rollback = revert Wave 6 commit, prior single-locale sitemap restored. | CC | Wave 6 |
| R-11 | **Anonymous-data leak via locale-prefixed URLs** — if a user shares an `/en/account/...` URL accidentally, it's the same auth-protected page; no extra leak surface. Listed for completeness — confirms not a new risk. | Negligible | Negligible | n/a — auth middleware runs after locale middleware; same protection on both prefixes. | n/a | n/a |
| R-12 | **localStorage `lang` key collision** — homegrown uses `STORAGE_KEY = "lang"`; next-intl uses cookies for locale persistence by default. During strangler-fig coexistence, both could disagree on user's locale. | Medium | Low | Wave 1 cutover: configure next-intl's `localeDetection` to read the existing localStorage `lang` value on first hit, write the next-intl cookie, deprecate localStorage in Wave 2 cleanup commit. | CC | Wave 1 |

---

## 8. Open questions

Each question lists CC's recommended default. Smadar can `go` (accept default) or specify a different answer; the answer goes in the relevant Wave's sub-ticket.

### Q1 — Locale prefix policy

Should EN URLs be `/en/...` (path prefix) or `en.mehamakor.online` (subdomain) or `?lang=en` (query)?
**Default:** path prefix (`/en/...`), `localePrefix: 'as-needed'` so HE has no prefix. Lowest infra cost (no DNS / SSL cert change), best Next.js i18n support, preserves all existing inbound links to Hebrew URLs.

### Q2 — English copy quality bar

Should EN strings ship LLM-translated and iterate, or wait for human translator polish before EN locale is publicly available?
**Default:** ship LLM-translated EN behind `Disallow: /en/` in `robots.txt` until Wave 5 (no SEO surface yet); Smadar spot-checks each Wave; human translator polish as a post-MEH-366 v2 ticket. Time-to-value matters more than polish at this stage.

### Q3 — Categories localization

Categories (`בישול`, `חקלאות`, `סיור אוכל`, etc.) appear in 6+ files. Are they (a) UI strings to translate, (b) data in DB to localize via `categories.he` / `categories.en` columns, or (c) i18n keys mapped from a slug in DB?
**Default:** (c) — DB stores stable slugs (`cooking`, `agriculture`, `food_tour`); UI translates via keys like `category.cooking`. Migration cost: zero (existing categories are already implicit slugs in code). Translation cost: bounded.

### Q4 — Date / time formatting

Should dates be (a) `next-intl/format` with `Intl.DateTimeFormat` defaults per locale, or (b) custom Hebrew formatting (e.g., Hebrew calendar dates for `/events`)?
**Default:** (a) Gregorian via `next-intl/format`. Hebrew calendar (תאריך עברי) is a separate v2 feature if Smadar wants it — would need the `shabbat-aware-scheduler` skill or HebCal API.

### Q5 — Existing LanguageProvider migration strategy ⚠️

Should Wave 1 use **strangler-fig** (run both providers during Wave 1, retire homegrown in Wave 2) or **hard cutover** (delete homegrown in Wave 1)?
**Default:** strangler-fig per §1.5. Lower regression risk; the 7-day staging burn-in catches latent issues before deletion. Hard cutover saves ~1h of dev work but increases Wave 1 risk significantly.

### Q6 — Brand-name handling ⚠️

Should "מהמקור" (15 files) be a translation key (`common.brand_name`) or a constant (`BRAND_NAME` in `lib/constants.js`)?
**Default:** constant. The brand stays "מהמקור" in EN UI everywhere — matches existing OG metadata convention (`siteName: "מהמקור"` in `app/layout.js`). Treating it as a translation key invites accidental EN drift to "Mehamakor" / "From The Source" / inconsistency.

### Q7 — Gendered loading-state normalization ⚠️ — UI CHANGE, NOT JUST KEY CONSOLIDATION

The codebase mixes masculine and feminine verbs:
- `טוען` (m, 8 files) vs `טוענת` (f, 8 files) — total 16 occurrences
- `שומר` (m, 4 files) vs `שומרת` (f, 5 files) — total 9 occurrences
- `שולחת` (f only, 5 files)

Should Wave 2 normalize all loading states to **feminine** (canonical per CLAUDE.md voice rule) and translate once, or preserve both as separate keys?

**Default:** normalize to feminine. Single key `common.loading` ("טוענת..."), single key `common.saving` ("שומרת..."), etc. Net key reduction: ~7 fewer keys.

**⚠️ This is a UI change, not just a key consolidation.** Smadar may want to preserve gendered variants if the audience expects them — particularly in admin contexts where the voice may be addressing the site owner generically rather than a known-feminine user. Default is feminine per CLAUDE.md voice rule, **but Smadar to confirm UI impact acceptable before Wave 2 starts**. If preserved, key naming is `common.loading_m` / `common.loading_f` and components select via locale-aware helper.

---

## 9. Wave 1 prerequisites

Two items must land before Wave 1 begins. **One is bundled into Wave 1's PR (template-literal fix). The other is a SEPARATE follow-up ticket (scanner scalability) — explicitly NOT bundled.**

### 9.1 Template-literal regex fix in i18n-scanner — bundled into Wave 1

**Status:** known gap from MEH-345; tracked as MEH-367 sibling.
**Scope:** small. The scanner's regex misses Hebrew strings inside template literals (`` `שלום ${name}` ``). Add backtick to the string-delimiter alternation.
**Why bundled:** correctness fix, ~1h of work, lands alongside Wave 1's scanner-config touch.

### 9.2 Scanner scalability bug — SEPARATE ticket, NOT Wave 1

**Status:** discovered during MEH-366 discovery — i18n-scanner subagent overflowed its own context window (194 tool uses on 124+ files, returned "Prompt is too long"). Distinct from §9.1.
**Scope:** larger. Two viable fixes:
1. **Chunked-scope mode:** scanner accepts a folder argument, runs per-folder, aggregates results into a single report. Keeps the agent pattern; adds invocation logic.
2. **Replace with deterministic Python script:** `.claude/scripts/i18n-scan.py` — same logic, no LLM, no context window. Faster, reproducible, but loses the classification heuristics the agent does for free.

**Recommendation:** option 2 (Python script). The classification heuristics are minor; deterministic + fast wins over agent flexibility for measurement-of-progress runs in every Wave PR.

**Why SEPARATE ticket:**
- Different repo surface (`.claude/agents/` or `.claude/scripts/`, not `frontend/`).
- Different reviewer (subagent infra vs frontend i18n).
- Bundling delays Wave 1 unnecessarily; Wave 1 can use the deterministic Python scan in §3 in the meantime.
- Per `.claude/rules/workflow.md` Rule 3 ("One PR = one logical change").

**Ticket name:** `🔧 i18n-scanner scalability — chunked-scope or replace with deterministic Python script`.
**Ticket parent:** MEH-345 (sibling fix to MEH-367), NOT MEH-366. The scanner is shared infra for future i18n work, not specific to this migration.

### 9.3 Other prerequisites — none

No DB migration. No env var change. No package.json change beyond `next-intl` install. No CI workflow change beyond the next-intl plugin's missing-key check. No backend touch.

---

## 10. Success metrics + exit criteria

### 10.1 Per-Wave exit criteria

Each Wave's PR must demonstrate:
- `npm run build` passes
- `pytest tests/test_api.py` passes (no regression)
- `/adversarial-review` clean (variant chosen per `.claude/rules/workflow.md` §"Specialized adversarial-review variants")
- Mobile preview verified on the Vercel preview URL per `.claude/rules/deployment.md`
- Residual hardcoded-Hebrew count cited in PR description (against the 1,721 baseline), with delta from previous Wave
- `messages/he.json` and `messages/en.json` key count parity (CI-enforced via next-intl plugin)
- `docs/CHANGELOG.md` entry per `.claude/rules/workflow.md` Rule 11

### 10.2 Final exit (Wave 6 close)

- `frontend/lib/language-context.js` deleted (Wave 2 final commit)
- Residual hardcoded-Hebrew count: ≤ 50 strings (~3% of original 1,721) — these are typically debug strings, dev-only console logs, or strings inside third-party-vendored code
- HE + EN both navigable end-to-end on staging
- Google Search Console shows EN pages indexed (manual check 1 week after Wave 6 merges to main)
- `docs/CHANGELOG.md` summary entry under `MEH-366: Bilingual launch`
- `HANDOFF.md` cleared of MEH-366 references
- Linear MEH-366 closed; sub-tickets all merged

### 10.3 What we measure post-launch (post-MEH-366, not in scope)

- EN session bounce rate vs HE
- EN organic search impressions (Google Search Console weekly)
- Translation quality complaints per channel (Instagram DM, support email)
- Time-to-translate per Wave (effort-estimate calibration for future i18n work)

These inform whether to engage a human translator in v2 (Q2 deferred decision).

---

**Plan author:** Claude Code (CC), 2026-05-07.
**Plan reviewer:** Smadar (pending).
**Sources:** see §1.2 inline citations.
