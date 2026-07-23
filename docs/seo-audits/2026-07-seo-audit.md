# Technical SEO Audit — 2026-07

**Date:** 2026-07-09 · **Ticket:** MEH-1062 (Chunk A) · **Scope:** Mehamakor Next.js frontend (App Router, `frontend/app/[locale]/**`).
**Method:** Static source review of `frontend/` (`app/`, `components/`, `lib/`) at repo HEAD. Structured data is read from source **on purpose** — `web_fetch`/`curl` strip `<script>` tags and cannot see JSON-LD (per the `seo-audit` skill's own "Schema Markup Detection Limitation"). All JSON-LD here is **server-rendered** in server components, so it is present in the initial HTML (confirmable via view-source; a live Rich Results Test is the recommended follow-up, deferred to Sapir per CC sandbox limits).
**Product context:** `.agents/product-marketing-context.md` (bootstrapped in this same chunk).

---

## ⚠️ Headline finding — STOP condition (a) triggered

**Phase 0 found a full structured-data system already in place, well beyond the FAQPage the ticket named as "known."** The MEH-1062 premise for Chunks B–D ("implement *missing* JSON-LD") is largely **already implemented**. Reporting per the ticket's STOP condition (a); B–D must be **re-scoped before any code** (see "Re-scoped B–D mapping" below).

**Structured data that already exists (server-rendered):**

| Schema | Surface | Source | Ticket trail |
|---|---|---|---|
| `FoodEstablishment` (+ address, geo, `openingHoursSpecification`, image, url, `aggregateRating` **only if reviews**, `telephone` **only if present**, `servesCuisine`, `areaServed`, `sameAs`, `priceRange`) | Producer detail (`/producer/[id]` **and** `/[slug]`) | `lib/seo.js:167-328` `buildJsonLd()`, injected `producer/[id]/page.js:50-59` + `[slug]/page.js:95-113` | MEH-9, MEH-172, MEH-213, MEH-452, MEH-904 |
| `BreadcrumbList` (ישראל → קטגוריה → עיר → שם) | Producer detail | `lib/seo.js:254-284` (part of the same `@graph`) | MEH-172 |
| `WebPage` + `WebSite` + `Organization` | Producer detail (`@graph`) | `lib/seo.js:286-322` | MEH-452 |
| `Organization` + `WebSite` + `SearchAction` | Homepage | `lib/seo.js:339-372` `buildHomeJsonLd()`, injected `app/[locale]/page.js:74-75` | MEH-804 |
| `Recipe` (name, description, image, author, `recipeIngredient`, `recipeInstructions` as `HowToStep`, `prepTime`, `cookTime`, `recipeYield`, url, `inLanguage`) | Recipe detail (`/[slug]/recipes/[recipe_id]`) | `components/public/RecipeJsonLd.jsx:41-78`, injected `.../page.jsx:111-115` | MEH-591 |
| `FAQPage` | `/about/for-businesses` | `app/[locale]/about/for-businesses/page.js:66-107` | MEH-579 |

**Consequence per acceptance criteria:**
- **Chunk B** (producer `FoodEstablishment`, fallback `LocalBusiness`; name/address/geo/openingHours/image/url; `aggregateRating` only if reviews; `telephone` only if public; server-rendered; `JSON.stringify`) → **already fully implemented** in `lib/seo.js`. It even satisfies the "aggregateRating only if reviews" (`seo.js:234`) and "telephone only if present" (`seo.js:217`) constraints verbatim. **Nothing to build — verify-only.**
- **Chunk C recipe** → **already implemented** (`RecipeJsonLd.jsx`). **Chunk C event** → **genuine gap** (SEO-01).
- **Chunk D** Organization + WebSite → **already implemented**. Producer `BreadcrumbList` → **already implemented**. **Genuine gap** = `BreadcrumbList` on recipe + event pages (SEO-02), and Event schema itself (SEO-01).

---

## Findings table

Severity: high / med / low. dup-check: **MEH-918** (soft-404 — deferred by Sapir, do not re-open) · **MEH-1045** (robots/middleware/next.config lane — do not touch) · **NEW**.

| # | Surface | Evidence (file:line / URL) | Finding | Sev | dup-check |
|---|---|---|---|---|---|
| SEO-01 | Event detail `/events/[id]` | `app/[locale]/events/[id]/page.js:66-68` | No JSON-LD at all — metadata + OG (`type:article`) present, but **no `Event` structured data** (no name/startDate/location/offers). No rich-result eligibility for events. | med | NEW → Chunk C |
| SEO-02 | Recipe detail | `components/public/RecipeJsonLd.jsx:41-68` | `Recipe` JSON-LD present but **no `BreadcrumbList`** — recipe rich result has no breadcrumb trail (producer pages have one; recipe pages don't). | low | NEW → Chunk D |
| SEO-03 | Sitemap ↔ recipe pages | `app/sitemap.js:37-114` | **Recipe detail URLs are not emitted in the sitemap.** Recipes (`/[slug]/recipes/[recipe_id]`) have full metadata + `Recipe` JSON-LD but are discoverable only via producer-page links → crawl/index orphan risk. | med | NEW |
| SEO-04 | Producer duplicate URLs | `producer/[id]/page.js:20-25` vs `[slug]/page.js:69` | Same producer is reachable at **both** `/producer/{id}` and `/{slug}`, each **self-canonical to its own path** (no redirect, no cross-canonical). Sitemap emits slug only (`sitemap.js:70-71`) which mitigates discovery, but the id-route JSON-LD `url`/`@id` uses the **slug** URL (`seo.js:86-91`, prefers slug) while its `<link rel=canonical>` is `/producer/{id}` → canonical ≠ JSON-LD url, plus duplicate-content risk. | med | NEW |
| SEO-05 | Twitter cards on entity pages | `producer/[id]/page.js:39-47`, `events/[id]/page.js:53-63`, `[slug]/recipes/[recipe_id]/page.jsx:71-88` | Entity pages set per-page `openGraph` but **no `twitter` override** → X/Twitter cards fall back to the layout's generic site title + `og-image.png` (`layout.js:85-90`), not the producer/recipe/event. | low | NEW |
| SEO-06 | Experience / Group-buy detail | `app/[locale]/experiences/[id]`, `group-buys/[id]` | No structured data on experience or group-buy detail pages (out of the declared B–D scope, but the same class as SEO-01; flagged for completeness). | low | NEW |
| SEO-07 | hreflang code non-uniformity | `lib/i18n-seo.js:29` (`en`) vs `lib/seo.js:28` (`en-US`) vs `OG_LOCALE` `en_US` (`i18n-seo.js:32`) | EN hreflang uses language-only `en`, JSON-LD `inLanguage` uses `en-US`, OG uses `en_US`. Each is individually valid; the signals are just not uniform. Cosmetic — not a defect. | low | NEW |
| SEO-08 | Entity 404 handling | `producer/[id]/page.js:27-36`, `events/[id]/page.js:37-51` | Producer/event "not found" set `robots:{index:false}` but still render a **200** page (client renders with no data) = soft-404. (Recipe route uses `notFound()` → true 404, `recipes/[recipe_id]/page.jsx:97` — correct.) | med | **MEH-918** (deferred — noted only, do NOT re-open) |
| SEO-09 | Font loading (CWV) | `app/[locale]/layout.js:193-196` | Google Fonts loaded via a render-blocking `<link rel="stylesheet">` (not `next/font`). `display=swap` is set (mitigates FOIT), but the stylesheet still blocks first paint → LCP note. No new tooling per scope — observation only. | low | NEW (CWV) |
| SEO-10 | Image alt coverage | `components/public/RecipeCard.jsx`, `RecipeDetail.jsx`, `producer/[id]/components/ProducerSections.jsx` | `alt=` attributes are **present** in the public components spot-checked. Not exhaustively verified (no new tooling per scope) — recommend a full alt pass on user-content images (producer galleries, recipe images) to confirm meaningful images never render `alt=""`. | low | NEW |

---

## Coverage checklist (required areas)

- **Titles & descriptions** — **Strong.** Per-locale site title/description via `seo.site.*` (`layout.js:105-133`); dynamic entity titles `"{name} | מהמקור"` / `"{name} | Mehamakor"` (`i18n-seo.js:78-82`); producer title `[name] — [category] ב[city] | מהמקור` (`seo.js:37-52`); descriptions truncated to ~160 with graceful fallback (`seo.js:58-71`). No duplicate-title risk observed. No finding.
- **Canonical** — **Strong.** Self-referencing per locale via `buildAlternates` (`i18n-seo.js:61-70`), correctly rejecting the Linear spec's "canonical→default locale" in favor of self-canonical + hreflang (`layout.js:112-124`). One caveat: SEO-04 (two self-canonical producer URLs).
- **hreflang he↔en** — **Strong.** he-IL + en + `x-default`→he, self-referencing (current locale is in the `languages` map) and reciprocal, in both `<head>` (`i18n-seo.js:61-70`) and sitemap `<xhtml:link>` (`sitemap.js:26-35`). Minor non-uniformity: SEO-07.
- **OG / Twitter** — **Mostly strong.** Full OG + Twitter `summary_large_image` at layout (`layout.js:69-90`), per-page OG on producer/event/recipe. Gap: entity Twitter cards fall back to generic (SEO-05).
- **Sitemap** — **Strong, one gap.** Dynamic `app/sitemap.js`: static routes + producers + producer-index pagination + events, all per-locale with hreflang alternates; correctly omits noindex auth/utility routes (`sitemap.js:51-54`). Gap: recipe detail URLs absent (SEO-03).
- **Indexability** — **Strong.** `robots:{index:true}` default (`layout.js:91-94`); intentional noindex on auth/utility routes; 404 paths noindex. `robots.txt` hardened, sitemap host correct (`public/robots.txt` — MEH-1045 lane, do not touch). Caveat: soft-404 (SEO-08, MEH-918 deferred).
- **Internal linking** — **Adequate.** Producer breadcrumbs link to `/producers?category=` / `?city=` (`seo.js:261-272`); recipes reachable from producer pages. Weakness ties to SEO-03 (recipes rely solely on internal links for discovery).
- **Image alt** — **Present in spot-check**, full pass recommended (SEO-10).
- **Core Web Vitals** (no new tooling) — Preconnects for fonts/OSM tiles/unsplash (`layout.js:186-192`); `@vercel/speed-insights` + Clarity wired; `MotionConfig reducedMotion="user"` (`layout.js:213`); Cloudinary `f_auto,q_auto` centralized. Note: render-blocking font stylesheet (SEO-09). A live PageSpeed/CrUX read is the recommended follow-up (deferred to Sapir).

---

## Top-10 NEW findings, ranked

1. **SEO-01** — Event detail has no `Event` JSON-LD (med) → Chunk C.
2. **SEO-03** — Recipe pages missing from sitemap (med).
3. **SEO-04** — Producer duplicate-content / canonical-vs-JSON-LD-url mismatch (med).
4. **SEO-05** — Entity pages have no entity-specific Twitter card (low).
5. **SEO-02** — Recipe JSON-LD lacks `BreadcrumbList` (low) → Chunk D.
6. **SEO-07** — hreflang/inLanguage/OG EN-code non-uniformity (low).
7. **SEO-09** — Render-blocking font stylesheet, LCP note (low, CWV).
8. **SEO-10** — Confirm image alt coverage on user-content images (low).
9. **SEO-06** — Experience/Group-buy detail carry no structured data (low, out of B–D scope).
10. **Internal-linking discovery** (synthesis of SEO-03/SEO-06) — recipe / experience / group-buy detail discovery depends on internal links only, with no sitemap entry (low).

_SEO-08 excluded from NEW top-10 — it is the deferred MEH-918 soft-404 class, listed for completeness only._

---

## Re-scoped B–D mapping (proposal — pending Sapir)

Because the structured-data system already exists, the original B–D scope collapses to a few genuine gaps:

| Original chunk | Original intent | Reality | Re-scoped proposal |
|---|---|---|---|
| **B** — producer `FoodEstablishment` | Add producer schema | **Already implemented** (`lib/seo.js`), richer than spec | **No-op / verify-only.** Optionally: fix SEO-04 (dedupe producer canonical) — but that's canonical/redirect work, not new schema. |
| **C** — Recipe + Event schema | Add both | Recipe **already implemented**; Event **missing** | **Build Event JSON-LD** on `/events/[id]` (SEO-01) — fields that exist in event data only, omit-never-invent, server-rendered, `JSON.stringify`. |
| **D** — Org + WebSite + BreadcrumbList | Add sitewide + breadcrumbs | Org/WebSite **already implemented**; producer breadcrumb **already implemented** | **Add `BreadcrumbList`** to recipe (SEO-02) and event (with SEO-01) pages only. |

**Out of the current B–D file scope** (candidate separate tickets, need Sapir's call): SEO-03 (add recipe URLs to `sitemap.js`), SEO-04 (producer canonical dedupe), SEO-05 (entity Twitter cards). None of these touch the MEH-1045 robots/middleware/next.config lane; SEO-03 is `app/sitemap.js`.

**If a shared helper is wanted for the Event/breadcrumb work,** a single new `lib/jsonLd.js` could host an `buildEventJsonLd()` + a small `buildBreadcrumbList()` (extracted from the inline `seo.js:254-284` logic) — propose in the chunk plan and wait for approval before creating it (per scope).

---

## Recommended verification (deferred to Sapir — CC sandbox cannot reach live)

- Run each entity URL through Google Rich Results Test (renders JS, authoritative for JSON-LD).
- Confirm view-source shows the `<script type="application/ld+json">` server-rendered (it should — all injectors are server components).
- One live PageSpeed/CrUX read for the LCP note (SEO-09).
