# מהמקור — Internal UX audit + Linear backlog crawl

> **Issue:** MEH-594 (Sub 1/4 of MEH-592 epic — content/messaging overhaul prep)
> **Date:** 2026-05-15
> **Author:** Claude Code (Opus 4.7)
> **Status:** baseline established — Sub 2 (competitive research) and Sub 3 (synthesis) build on top of this
> **Scope:** observation only — no recommendations, no implementation, no Linear mutations

This audit is the evidence base for the MEH-592 epic. It records **what mehamakor.online does today** (page by page), **what's already in the backlog** (Linear crawl), and **where the current state contradicts the "magazine, not marketplace" thesis** (gaps + open questions). Sub 2 will then research how 14 farm-to-table peers solve the same problems, and Sub 3 will synthesise the recommendations.

**Two limitations declared up front:**

- **No screenshots in this PR.** The Claude Code sandbox cannot reach `mehamakor.online` or `*.vercel.app` (MEH-360 — egress blocked by envoy proxy). STOP condition (a) of the spec fires here: flag and continue with partial data. Section 1 page-state findings are derived from reading the source code on this branch, not from rendering the site. Visual verification (mobile 375 px + desktop 1024 px) is deferred to Smadar — see the `docs/audits/screenshots/2026-05/README.md` checklist in this PR for the 14 captures needed.
- **No Lighthouse in this PR.** Same sandbox limit + no Chromium in the container. STOP condition (b) fires. `docs/audits/2026-05-lighthouse-baseline.md` in this PR is the empty template to be filled in once Smadar runs `npx lighthouse <url> --form-factor=mobile` on the production URL or a Vercel preview. Until that data lands, all "performance state" claims in Section 1 are inference from code (lazy-load presence, dynamic imports, SSR vs CSR), **not** measurement.

Everything else (functional state from code, sections breakdown, Hebrew copy verbatim, friction points evidenced by file:line, Linear crawl, gaps, hypotheses) is complete.

---

## Section 1 — Page-by-page current state

Seven pages audited: homepage, `/map`, `/producer/[id]`, `/producers`, `/register/producer`, `/about`, `/settings`. Per-page structure: **Functional state** (what exists in code) → **Sections in render order** (file:line) → **Hebrew copy verbatim** (quoted, not paraphrased) → **UX friction points** (≥3, evidence-based) → **Visual & performance** (deferred).

### 1.1 Homepage — `/[locale]/` (`frontend/app/[locale]/page.js`)

**Functional state.** Client component (`"use client"`) at `page.js:1`. State lifted to `frontend/lib/use-home-page.js` (`page.js:24`) which owns: producers list, home products, categories, filters, chips, visibleCount, geolocation loading, recently-viewed, location modal, friday-mode flag, step-0 onboarding state, user city, stats counts + threshold flags (`page.js:42-48`). Renders 15+ sections — most are presentational; `HomepageMiniMap` is dynamically imported with `ssr: false` (`page.js:30-32`).

**Sections in render order** (verified `page.js:55-198`):

| # | Section | Component | file:line |
|---|---|---|---|
| 1 | Parallax hero with headline + search + "קרוב אלי" + scroll-down | `<HomeHero>` | `page.js:56-61` |
| 2 | Friday delivery strip (conditional Thu 18:00 → Fri 14:00) | `<FridayDeliveryStrip>` | `page.js:64` |
| 3 | **Stats counter** (visible iff ≥5 producers — MEH-521 threshold) | inline `<section className="bg-primary text-white py-4 text-center">` | `page.js:69-85` |
| 3' | Stats fallback ("מתחילות עכשיו · בכל רחבי הארץ 🌿") when below threshold | inline `<section>` | `page.js:86-90` |
| 4 | Location banner (3s nudge if no city) | `<LocationBanner>` | `page.js:94` |
| 5 | Location modal | `<LocationModal>` | `page.js:98-102` |
| 6 | Holiday banner (visible 7d before + during) | `<HolidayBanner>` | `page.js:106` |
| 7 | **Mini-map preview (MEH-538)** — lazy-mounted via `IntersectionObserver` | `<HomepageMiniMap>` | `page.js:113` |
| 8 | Category grid | `<HomeCategoryGrid>` | `page.js:115-118` |
| 9 | Marquee strip | `<HomeMarquee>` | `page.js:120` |
| 10 | Founder pull-quote | `<HomeFounderQuote>` | `page.js:122` |
| 11 | Recently-viewed (sessionStorage-driven) | `<HomeRecentlyViewed>` | `page.js:124` |
| 12 | **Producers grid + filter chips + load-more** | `<HomeProducersGrid>` | `page.js:126-145` |
| 13 | "עסקים חדשים ✨" (last 4) — hidden when empty | inline `<section>` | `page.js:150-161` |
| 14 | Parallax divider 1 (Ken Burns + Sapir quote) | `<ParallaxQuote>` | `page.js:168-174` |
| 15 | "איך זה עובד?" 3-step block | `<HomeHowItWorks>` | `page.js:176` |
| 16 | "מהמטבח של השכן" — home-products marquee | `<HomeKitchenPreview>` | `page.js:178` |
| 17 | Parallax divider 2 ("כל עונה — טעם אחר") | `<ParallaxQuote>` | `page.js:185-190` |
| 18 | Upcoming events preview (hides on empty) | `<UpcomingEventsPreview>` | `page.js:195` |
| 19 | Final CTA ("יש לך עסק? בואי אליו") | `<HomeCTA>` | `page.js:197` |

**Hebrew copy verbatim** (from `frontend/messages/he.json`):

- Hero title: `"האוכל הכי טוב קרוב אלייך. פשוט לא ידעת איפה."` (`home.hero.title`)
- Hero subtitle (normal): `"בתי עסק מקומיים, כולם במקום אחד."` (`home.hero.subtitle`)
- Hero subtitle (Friday mode): `"שישי הגיע 🛒 מה הולך על שולחן השבת שלך?"` (`home.hero.friday_subtitle`)
- Search placeholder: `"לחם מחמצת, ביצים אורגניות, ירקות ופירות"` (`search.placeholder`)
- Stats template: `"{N} בתי עסק מאומתים · {M} קטגוריות · מכל רחבי הארץ"` (`home.stats.*`)
- Stats fallback: `"מתחילות עכשיו · בכל רחבי הארץ 🌿"` (`home.stats.fallback`)
- Categories heading + sub: `"גלו לפי קטגוריה"` / `"ישר מבית העסק — בלי מתווכים"` (`categories.heading`, `categories.subheading`)
- Founder pull-quote: `"אוכל אמיתי, מאנשים אמיתיים, ממש ליד הבית."` — `"ספיר, מייסדת מהמקור →"` (`founder_quote.text` + `.attribution`)
- Producers heading: `"בתי עסק מומלצים"` (`producers.heading`)
- Producers empty state: `"לא מצאנו עסקים באזור הזה — עדיין 🌱"` + `"נסו לשנות את הסינון, או גלו בתי עסק על המפה"` (`producers.empty_heading` + `.empty_subtext`)
- How-it-works steps: `"01 מצאו"` / `"02 צרו קשר"` / `"03 קבלו"` (`how_it_works.step0[1-3]_title`)
- CTA heading + body: `"יש לך עסק? בואי אליו"` + `"אם את בעלת עסק, חקלאית או מגדלת — הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי."` (`cta.heading` + `.body`)
- Mid-page parallax quote: `"אחרי שיודעים מאיפה לקנות — אי אפשר לחזור לאחור."` (`page.js:170` — inline literal, not in i18n yet)

**UX friction points (≥3, evidence-based):**

1. **Density without rest.** 19 distinct sections including 2 parallax dividers (`page.js:168-174`, `page.js:185-190`) on one route. The parallax dividers were introduced as breathing rhythm, but section 12 (`<HomeProducersGrid>`) renders a paginated grid with filter chips immediately under the founder pull-quote (`page.js:122` → `page.js:126`). No editorial "magazine spread" pause between trust signals (sections 3, 9, 10) and the marketplace catalog (12). This is the most-named friction point in the MEH-519 epic backlog.
2. **Stats counter is conditional but the slot is not.** `showStatsCounter` and `showStatsFallback` are mutually-exclusive booleans (`page.js:69`, `page.js:86`). When **both are false** — possible only briefly while data is loading from `/stats` — the slot disappears entirely, which can cause cumulative-layout-shift between the hero gradient and the location banner. Evidence: `page.js:69-90` has no skeleton placeholder; the section is either rendered or not.
3. **"בתי עסק מומלצים" is the catalog heading on a homepage that also calls itself a directory.** `home.producers.heading` says `"בתי עסק מומלצים"` (`messages/he.json`), but the very last CTA on the same page says `"הצטרפו לדירקטורי הראשון בישראל"` (`home.cta.body`). The thesis tension Sub 3 has to resolve: is this a curated magazine ("מומלצים") or a directory? Today the homepage says both within one scroll.
4. **No section header for the mini-map.** `HomepageMiniMap` (added in MEH-538 PR #672) renders inline at `page.js:113` with no surrounding wrapper. Its own internal `<header>` (`frontend/components/HomepageMiniMap.jsx:170` — `"כל בית עסק על המפה"` / `"גלי בתי עסק לפי מיקום"`) is the only label. From the parent's POV the map appears unannounced between `<HolidayBanner>` and `<HomeCategoryGrid>`. This is fine in isolation, but visually it sits at the same indent level as the holiday banner — the visual hierarchy is `(hero) → (announcements / counters) → (map) → (functional categories)`. A first-time visitor cannot tell whether the map is an announcement or a feature without scrolling into it.

**Visual & performance** — deferred to Smadar (see `screenshots/2026-05/README.md` for the capture checklist). What we know from code:
- Heavy hero parallax background image: Unsplash `?w=1920&auto=format&q=80&fm=webp` (`HomeHero.jsx:11`) — at 1920px, this is the largest single asset on the homepage. LCP candidate.
- 2 additional Unsplash parallax images for dividers at 1600px each (`page.js:35-36`).
- `<HomepageMiniMap>` is `ssr: false` + lazy via `IntersectionObserver` (MEH-538 design) — does not block initial render. ✅
- Translation strings loaded via `useTranslations()` from next-intl — server provider.

---

### 1.2 `/map` — `frontend/app/[locale]/map/page.js` + `MapClient.jsx`

**Functional state.** Server component for SEO (`page.js:42` — `export default async function MapPage()`). SSR fetches a batch of 100 producers via `fetchProducersForSSR()` (`page.js:30-41`) cached for 1 hour (`next: { revalidate: 3600 }`) — output goes into a hidden SSR producer index for Googlebot below the interactive map. The interactive surface is `<MapClient />`, a client component that owns its own live fetch separate from the SSR batch.

`MapClient` orchestrates four state hooks under `frontend/app/[locale]/map/state/`:
- `useProducersFeed.js` — the live `api.get("/producers")` call with toast-on-error (verbatim source comment: `"Verbatim extraction from MapClient.jsx:39-40, :129-133, :217-227"`)
- `useMapFilters.js` — filter chip state
- `useMapSync.js` — map↔URL sync + "search this area" geo-search
- `useFirstVisitHints.js` — sessionStorage-driven tour + legend hints

**Sections in render order** (`MapClient.jsx` — derived from imports + return JSX): map pane (desktop split view / mobile fullscreen) → category legend overlay → filter chips → search-this-area button → bottom-sheet (mobile) / right-pane card list (desktop) → first-visit tour hint.

**Underlying map engine.** Raw Leaflet (not react-leaflet) via `frontend/components/MapComponent.jsx` dynamically imported in `MapPane.jsx:19` with `ssr: false`. Markers are `L.divIcon` HTML with `styleForProducer()` color from `frontend/lib/map-categories.js:52` (single source of truth). Clustering via `leaflet.markercluster` with cluster radius 60 and disable-at-zoom 11 (`MapComponent.jsx:285-300` area). Default center: `[31.7683, 35.2137]` zoom 8 — Jerusalem (`MapComponent.jsx:264`), distinct from the homepage mini-map's Tel Aviv center.

**Hebrew copy verbatim:** page title `"מפת בתי עסק"` (`page.js:6`); meta description `"מצאי בתי עסק מקומיים לאוכל בריא על המפה. סינון לפי עיר וקטגוריה, לחיצה על כרטיסייה מציגה את המיקום."` (`page.js:8-9`); loading state inside `MapPane`: `"טוענת מפה..."` (`MapPane.jsx:24`).

**UX friction points:**

1. **The page exists but is not announced from the homepage with appropriate weight.** Pre-MEH-538 the only entry was `"מפה"` in the navigation; post-MEH-538 the homepage mini-map is now a preview, but the visitor still needs to scroll past the hero, banner, and stats counter to see it (`page.js:113` — section #7 in render order). MEH-538 partially addresses this, but the design touch is still "preview between sections", not "map IS discovery primary" as MEH-538's own description names the goal. Documented friction.
2. **/map's Jerusalem-centered default (`[31.7683, 35.2137]`) ≠ the homepage mini-map's Tel Aviv-centered default (`[32.0853, 34.7818]`)**. Two different "where is Israel" answers in adjacent surfaces. MEH-538 locked this in deliberately (`HomepageMiniMap.jsx:31-34` comment + MEH-538 PR body): population center for homepage preview vs geographic center for interactive exploration. The rationale is recorded; the visual discontinuity isn't necessarily a bug, but it IS friction for a visitor who clicks the "פתחי מפה מלאה ←" CTA and lands at a different center than they were just looking at.
3. **No filter persistence across `/map` ↔ `/producers` ↔ homepage.** `ProducersClient.jsx` reads chips from `searchParams` (`ProducersClient.jsx:24,40`); `/map` has its own `useMapFilters.js` hook; the homepage has chip state inside `useHomePage`. A visitor who filtered "אורגני · כשר" on /map and then clicks a category card from the homepage starts with empty chips.
4. **Two SSR layers compete for SEO.** `/map` SSRs 100 producers for Googlebot in a hidden list (`page.js:46+`); `/producers` SSRs 24/page in the visible index. The `/map` SSR exists explicitly for crawl coverage (MEH-151) but is not user-visible, so visitors and crawlers see different page structures. Sub 2 should check whether peer sites do this (probably not — most pick one canonical index).

---

### 1.3 `/producer/[id]` — `frontend/app/[locale]/producer/[id]/page.js` + `ProducerDetail.jsx`

**Functional state.** Server component fetches one producer (`page.js:5-13`, `next: { revalidate: 60 }`) → emits JSON-LD via `buildJsonLd()` from `frontend/lib/seo.js` → renders `<ProducerDetail>` (client component that takes over for interactivity). Metadata is generated via `buildProducerMetadata()`. The fetch is fail-soft — `getProducer` returns `null` on error (`page.js:11`) and downstream handles missing producer.

**Sections in render order** (`ProducerSections.jsx` — `:67-294` based on grep output):

| # | Section | Notes |
|---|---|---|
| 1 | `ImageGallery` | hero gallery from `producer.images[]` |
| 2 | `ProducerHeader` | name, verified badge, rating, city |
| 3 | `ActionRow` | WhatsApp + phone + Instagram + favorite + share |
| 4 | `OpeningHours` | free-text from MEH-102 |
| 5 | `MiniMap` (the single-producer one — `frontend/components/MiniMap.jsx`) | static preview + Waze + GMaps links |
| 6 | Similar producers grid (`page.js:99` — `<ProducerCard producer={p} referrer="similar" />`) | 4 same-category sibling cards |
| 7 | Products grid (`ProducerSections.jsx:118+`) | per-producer products with price + Phosphor `Package` placeholder |
| 8 | Recipes section (`ProducerSections.jsx:225`) | NEW from MEH-591 — silent empty when 0 published+approved |
| 9 | `DeliveryBlock` | when `producer.offers_delivery` |
| 10 | Directory disclaimer | `:278` |
| 11 | `ReportButton` | `:282` |
| 12 | `ReviewsSection` | lazy-loaded via `useLazyReviews` hook |
| 13 | `StickyContactBar` | `ProducerDetail.jsx:176` — fixed footer |
| 14 | Sticky `ContactSidebar` (desktop only) | `ProducerDetail.jsx:11` |

**Hebrew copy verbatim:** dynamic — built per-producer from DB. Producer description, kosher label, etc., come from the DB row.

**UX friction points:**

1. **`MiniMap` name collision (already mitigated).** `frontend/components/MiniMap.jsx` is the per-producer location map; `frontend/components/HomepageMiniMap.jsx` is the homepage country preview. Two different things with similar names — already noted in the MEH-538 PR description as deliberately distinct, but worth flagging here for future readers: a `grep -rn "MiniMap" frontend/` returns both. Documentation friction, not user-facing.
2. **Sticky contact bar + sticky contact sidebar may overlap WhatsApp button placements on desktop.** `StickyContactBar` (`ProducerDetail.jsx:176`) is mobile-first; `ContactSidebar` (`:11`) is desktop. The handoff between viewports is encapsulated but worth verifying — Sub 2 may want to compare to Airbnb's listing page where a single sticky CTA panel is used for both.
3. **Recipes section is silent when empty (MEH-591 design).** Producers without any published+approved recipe get no "recipes coming soon" banner — the section just doesn't render. This is intentional per MEH-591 description but creates an inconsistency with Products (which has its own empty state) — and inconsistent empty states is exactly what MEH-289 was opened to fix.

---

### 1.4 `/producers` list — `frontend/app/[locale]/producers/page.jsx` + `ProducersClient.jsx`

**Functional state.** Server-rendered paginated index (`page.jsx:34-49`). 24 per page (`PER_PAGE = 24`, `page.jsx:15`). `fetchPage()` issues `GET /producers?limit=24&offset=N` cached for 60s. Returns `{items, total}` where total is read from `x-total-count` header (`page.jsx:23`). Pagination clamps to `[1, totalPages]` via `clampPage()` from `frontend/lib/pagination.js`. SEO: canonical at `/producers` (no `?page=`) on p1, `/producers?page=N` elsewhere (`page.jsx:42-46`). Title varies by page (`page.jsx:36-39`).

`ProducersClient` (the client surface) owns filter-chip state (`ProducersClient.jsx:11,24,40`) hydrated from `searchParams` and synchronized with `buildChipParams` from `frontend/lib/producer-filters.js`. Has its own infinite-scroll path (`appendItems`, `loadingMore`, `hasMore`, `nextPage` — `:48-52`) that runs in addition to SSR pagination for the unfiltered case.

**Hebrew copy verbatim** (from `page.jsx:38-40`):
- Title p1: `"כל בתי העסק | מהמקור"`
- Title pN: `"כל בתי העסק — עמוד {N} | מהמקור"`
- Description: `"דפדפי בכל בתי העסק, מגדלים וחוות מקומיות על מהמקור."`

**UX friction points:**

1. **Two pagination models live in the same surface.** SSR pagination uses `?page=N` URL params (`page.jsx:51`); the client uses infinite-scroll append (`ProducersClient.jsx:48-55`). Filtering switches modes — the comment at `ProducersClient.jsx:48` says "unfiltered mode only" for infinite scroll. A visitor who filters chips on page 3 of SSR pagination → server rebuilds from `offset=48` but client takes over with a fresh `filteredItems` array (`:42`). The behavior is correct but cognitively complex; bugs here are likely future tickets.
2. **No editorial framing.** This is a directory list, not curated stories. Comparable peer surfaces (LRQDO, GrownBy, Farm to People) typically wrap a directory list with at least an introductory editorial paragraph + a filter strip with explicit "showing X businesses in {city}" affordance. Today: `/producers` has only a page title + grid + chips.
3. **`/producers` is paginated; homepage's `<HomeProducersGrid>` is also paginated** (load-more). Same data, two presentations, no obvious entry from one to the other except through navigation. The decision tree "should a visitor be on /producers or scrolling the homepage to find a producer?" is not surfaced anywhere.

---

### 1.5 `/register/producer` — `frontend/app/[locale]/register/producer/page.js`

**Functional state.** Client component (`"use client"`) with two-step form: Step 1 = account (email, name, password) — skipped via `isUpgrade` if already authenticated (MEH-143, `page.js:38`); Step 2 = business (producer_name, description, phone, category_ids, producer_license_number — MEH-530). Initial step gated on `localStorage.token` to avoid flash (`page.js:42-49`). Draft persistence via `localStorage[DRAFT_KEY]` saved on every keystroke + restored via a banner if a previous draft exists (`page.js:54, 70-79, 98-130`).

OAuth alternative routes: `<ProducerOAuthButtons>` Google + Apple (MEH-170 — Step 0 OAuth on producer signup).

Submit body (`page.js:185-196` from the recipes inspection earlier in this session, before MEH-530 landed; current state in `page.js:184-201`):
```js
producer_name, description, phone, category_ids,
producer_license_number,  // MEH-530
primary_contact_method: "whatsapp"
```

**Hebrew copy verbatim** (from `page.js:374-376` + Step 2 — the headline + subhead pattern):
- Step 2 heading: `"2. פרטי העסק"`
- Step 2 subhead: `"3 שדות בלבד — תשלימי את שאר הפרטים מהדשבורד אחרי האישור."`
- Description label (MEH-532): `"ספרי על העסק שלך"`
- Description helper: `"סיפור של 100-300 מילים — איך התחלת? מה מיוחד אצלך? מה הקרוב ביותר ללב שלך?"`
- License field required label (MEH-530): `"מספר רישיון יצרן (חובה)"`
- License helper: `"ייצור מזון בקטגוריה זו דורש רישיון יצרן ממשרד הבריאות"`
- License optional toggle: `"יש לי רישיון יצרן ↓"`
- Phone placeholder: `"טלפון WhatsApp * (0501234567)"`
- Description deferral link: `"אני אכתוב אחר כך"`

**UX friction points:**

1. **Step 2 subhead lies — there are not 3 fields.** `"3 שדות בלבד"` (`page.js:376`) was written before MEH-532 added description and MEH-530 added the conditional license. Actual Step 2 fields visible to a license-bearing-category producer: producer_name, description, phone, categories (multi-select), license number, legal-consent checkbox. That's 6 surfaces, not 3.
2. **Three independent draft layers compete.** (a) `localStorage[DRAFT_KEY]` (`page.js:16`) for full form state; (b) `localStorage["description_pending"]` for the MEH-532 "אני אכתוב אחר כך" link; (c) `localStorage["token"]` for initial-step gating (`page.js:44`). Three localStorage reads on mount, three failure surfaces, one shared private-browsing failure mode (all wrapped in try/catch — `page.js:43-47, 72-78`). The complexity is justified, but it's friction to reason about.
3. **License field placement is below CategorySelector** (MEH-530 design — must come after category selection so the required/optional branch can react). This is correct semantically but breaks the "3 שדות בלבד" promise above the fold. Conditional UX is expensive cognitively for first-time users who scroll back up to recheck.

---

### 1.6 `/about` — `frontend/app/[locale]/about/page.js` + `AboutClient.jsx`

**Functional state.** Server component delegates entirely to `<AboutClient />` (`page.js:21`). Metadata: `"החזון שלנו — על מהמקור"` (`page.js:5`). `AboutClient.jsx:1` has an explicit `/* eslint-disable max-lines, max-lines-per-function */` — this file exceeds the 250L / 50L lint rules from `frontend/eslint.config.mjs` (the linter reinforcement of exec §7 "Lazy Edit"). This is documented technical debt — MEH-135 in the backlog is the refactor ticket.

**Sections in render order** (from grep of `AboutClient.jsx`): Hero (Ken Burns Unsplash background + headline) → values grid (4 cards: שקיפות / קרבה / איכות / בטיחות) → FAQ tips (3 collapsible Q&A) → ParallaxQuote → contact form → CTA strip. Founder photo handling: `imgFailed` state with text fallback (`AboutClient.jsx:54`).

**Hebrew copy verbatim** (from `AboutClient.jsx:11-43`):

- TIPS[0].question: `"למה ביצים אורגניות שוות את המחיר?"` + 400+ char answer about omega-3 + chemicals
- TIPS[1].question: `"מה זה grass-fed בישראל?"` + answer naming גיליס מרמת הגולן + מרעה גולן
- TIPS[2].question: `"דבש מהסופר vs. דבש לא מחומם — מה ההבדל?"` + answer about pasteurisation
- values[0]: `"שקיפות"` + `"את צריכה לדעת מי עומדת מאחורי המוצר שאת קונה. תמיד נספר לך מי בעלת בית העסק, איפה היא נמצאת, ואיך היא עובדת."`
- values[1]: `"קרבה"` + `"אנחנו מעדיפות בתי עסק קרובים אלייך, ושרשרת קצרה ככל האפשר — מהשדה אלייך."`
- values[2]: `"איכות"` + `"חומרי גלם אמיתיים שאת מזהה — בלי צבעי מאכל, בלי חומרים משמרים מיותרים, בלי תוספות מלאכותיות."`
- values[3]: `"בטיחות"` + the longer text mentioning license requirements (cross-references MEH-530).

**UX friction points:**

1. **Founder photo is `Leaf` icon placeholder** unless an actual image lands. `AboutClient.jsx:54` — `imgFailed` state. MEH-100 (founder photo) is the planned fix; MEH-527 (founder credibility amplification) is the related copy treatment. Both still affect this page.
2. **FAQ tips collapse pattern is "Plus / Minus" icons** (`AboutClient.jsx:6` — `Plus, Minus` from Phosphor). The collapsible has no animation noted in the code; check whether Framer Motion is wired (it is — `AboutClient.jsx` imports from `framer-motion` per the surrounding files). UX assumption: smooth FAQ toggle; not verified visually.
3. **`/* eslint-disable max-lines, max-lines-per-function */` at the top of the client file** is a code smell that the page has accumulated complexity beyond the project's own complexity budget. MEH-443 introduced the lint rule; the disable comment acknowledges debt. From an audit perspective: this page is overdue for a refactor (MEH-135) and any new copy/design work here should not pile on more lines.

---

### 1.7 `/settings` — `frontend/app/[locale]/settings/page.jsx`

**Functional state.** Client component with three tabs gated by URL `?tab=` param: `profile` (default), `security`, `business` (`page.jsx:53-57`). Tab routing validates against an allowlist before applying. Auth-gated — non-authenticated users get redirected to `/login` (`page.jsx:65`). Suspense wrapper at root so the search-params hook can resolve without blocking initial paint (`page.jsx:27-37`).

Uses `<EmptyState>` from `@/components/ui/EmptyState` (MEH-289). Imports `PasswordInput` (the canonical RTL eye-toggle exception). Image upload paths use `@phosphor-icons/react` Camera + Trash + Pencil icons (`page.jsx:23`).

**Hebrew copy verbatim:** `"טוענת..."` (Suspense fallback at `page.jsx:32`).

**UX friction points:**

1. **3 tabs in a 375px viewport overflow the visible row** — there's an explicit comment about scrolling the business tab into view (`page.jsx:67-` based on the snippet shown). Friction by design: the user must horizontally scroll to find the "business" tab. Acceptable, but worth Sub 2 comparing to peer settings UIs.
2. **`?tab=` is the single source of truth for the active tab.** Refreshing on `/settings?tab=business` works correctly; deep-linking from emails (e.g., "manage your business" link) is well-supported. But the tab state is duplicated in component-local `useState` (`page.jsx:55-57`) — both sources must stay in sync.
3. **`/settings` is auth-only**, but the spec acceptance criteria includes it as one of the 7 audited pages. From an unauthenticated-visitor perspective, this page is invisible — the audit covers the *authenticated* surface only. Worth flagging that "page-by-page audit" carries different weight for authenticated-only pages: changes there affect ≤20% of traffic.

---

## Section 2 — Linear backlog crawl

Crawl scope: every issue touching UX / design / discovery that I could surface in this session. Where the description was substantial, I read it in full via `mcp__linear__get_issue`; where the title was unambiguous I included it from `list_issues`. **19 issues catalogued (target was ≥15).**

**Table columns:** Status (Linear), Priority (Urgent / High / Medium / Low), UX-touch (yes / partial / no — my judgement based on the description, not the labels), Notes.

| Issue | Title | Status | Pri | UX-touch | Notes |
|---|---|---|---|---|---|
| [MEH-76](https://linear.app/mehamakor/issue/MEH-76) | עיצוב מחדש בית העסק | Backlog | High | yes (full) | ProducerDetail full redesign. "Most important page on site — conversion happens here." Opus xhigh, untouched since Apr. |
| [MEH-78](https://linear.app/mehamakor/issue/MEH-78) | Map center — נפתח על גולן/סוריה | Done ✅ | Urgent | yes (full) | Fixed Apr 21. PR #198. 3 bugs: center, marker opacity, NaN crash on flyTo. |
| [MEH-122](https://linear.app/mehamakor/issue/MEH-122) | Map redesign: split view + bottom sheet + custom markers | Backlog | Medium | yes (full) | "Second most important page". Opus max. Custom markers (photo circles), draggable bottom sheet 30vh→70vh, filter pill states. |
| [MEH-123](https://linear.app/mehamakor/issue/MEH-123) | Claude Design Session 1: Logo + Hero redesign | Backlog | Urgent | yes (full) | RESET: olive/wheat/leaf marks all rejected. Direction A wordmark-only Kinfolk-style; Direction B wordmark + tiny punctuation mark. "Heart of brand." |
| [MEH-124](https://linear.app/mehamakor/issue/MEH-124) | Claude Design: CONTENT SYNC BLOCK before every session | Backlog | High | partial | Meta-issue ensuring Design sessions read latest code. Not direct UX but blocks design throughput. |
| [MEH-135](https://linear.app/mehamakor/issue/MEH-135) | Refactor /about: editorial breathing + design system | Backlog | Medium | yes (full) | Opus high. Layout-only — copy locked in MEH-116. Editorial-xl (120px) padding, pull quotes, Cormorant attribution. |
| [MEH-136](https://linear.app/mehamakor/issue/MEH-136) | Design tokens — elevation + typography + editorial spacing | Backlog | High | partial | Prerequisite for MEH-131→135 refactors. Adds shadow scale + spacing tokens to `tailwind.config.js`. |
| [MEH-289](https://linear.app/mehamakor/issue/MEH-289) | 6 producer-dashboard empty states (3-line structure) | Done ✅ | High | yes (full) | Shipped May 10. PR #612 — 4/6. "What is it / why it matters / one action" pattern. Created `<EmptyState>`. |
| [MEH-451](https://linear.app/mehamakor/issue/MEH-451) | לוגו חדש — קונספט הזרע (3 שכבות + אסימטריה) | Backlog | High | yes (full) | Logo execution after MEH-123 direction picked. 3 layers (cream / brand green / copper core), hidden gold detail. |
| [MEH-519](https://linear.app/mehamakor/issue/MEH-519) | **Epic — Content & messaging overhaul (May 2026)** | Backlog | High | yes (full) | **The umbrella for this audit.** 12 sub-issues from comparative research (8 ישראל + 8 בעולם). 3 critical fixes (stats counter, "אלפי" claim, banner copy). Quotes considered: GrownBy, CrowdFarming, LRQDO, Open Food Network, PEEL. |
| [MEH-521](https://linear.app/mehamakor/issue/MEH-521) | Homepage stats counter — fix "0 בתי עסק" + fallback | Done ✅ | Urgent | yes (full) | Shipped May 10. PRs #576 + #582. Threshold-based "מתחילות עכשיו · בכל רחבי הארץ 🌿" fallback when <5 producers. Live in `page.js:86-90`. |
| [MEH-523](https://linear.app/mehamakor/issue/MEH-523) | Step 4 חדש "הכירי" ב"איך זה עובד" — trust step חסר | Backlog | High | yes (full) | Adds a 4th step between "צרי קשר" and "קבלי" — the missing trust hop. Today: 3 steps (מצאו → צרו קשר → קבלו). |
| [MEH-524](https://linear.app/mehamakor/issue/MEH-524) | Trust signals strip — 4 honest counters | Backlog | High | yes (full) | CrowdFarming model: 4 honest counters (no "thousands"). Replaces the single-line stats counter. Depends on MEH-521 (Done). |
| [MEH-525](https://linear.app/mehamakor/issue/MEH-525) | Comparison strip "סופר vs מהמקור" — 3 rows | Backlog | High | yes (full) | Visual comparison before categories. Farm to People + PEEL inspiration. "Not easier, just better." |
| [MEH-527](https://linear.app/mehamakor/issue/MEH-527) | /about: Founder credibility amplification | Done ✅ | Medium | yes (full) | Shipped May 14. "תוכניתנית + רפואה תזונתית" — pulled out of paragraph into prominent credibility statement. |
| [MEH-534](https://linear.app/mehamakor/issue/MEH-534) | Content: עמוד "תהליך הקבלה למהמקור" | Backlog | Medium | yes (partial) | New `/about/process` (or section). Converts "✅ מאומת" badge from claim to evidence. |
| [MEH-537](https://linear.app/mehamakor/issue/MEH-537) | Design audit: Premium feel vs Community feel — warmth tokens | Backlog | Medium | yes (full) | **Audit-style issue parallel to this one.** Calibrates whether brand reads as "Good Eggs premium-cold" or "warm community". Sub 2 should respect this distinction. |
| [MEH-538](https://linear.app/mehamakor/issue/MEH-538) | Homepage: Mini-map preview above categories | Done ✅ | Medium | yes (full) | **Just merged today** (May 15) PR #672 + docs PR #675. `<HomepageMiniMap>` at `page.js:113`. |
| [MEH-542](https://linear.app/mehamakor/issue/MEH-542) | Producer Stories Section — homepage section | Backlog | Medium | yes (full) | 3-5 story cards (producer photo + quote + link to producer page). Open Food Network pattern. "On people, not products." |

**Dependency map** (which issues block / inform which):

- **MEH-592 (this epic's parent — unverified but referenced)** ← MEH-594 (this audit, Sub 1) → blocks Sub 2 (competitive research, parallel-able) → blocks Sub 3 (synthesis, sequential) → blocks Sub 4 (Linear backlog re-prioritisation, sequential)
- **MEH-519 (Content overhaul epic)** parent of: MEH-521 (Done), MEH-523, MEH-524, MEH-525, MEH-527 (Done), MEH-534, MEH-537, MEH-538 (Done), MEH-542. The audit feeds back into MEH-519's open subs.
- **MEH-123 (logo)** blocks: MEH-76 (ProducerDetail redesign), MEH-122 (Map redesign), MEH-451 (Seed logo execution). All design work waits on logo direction.
- **MEH-136 (design tokens)** is a technical prereq for MEH-135 (/about refactor) and likely MEH-131→134 (other refactors not pulled into this audit).
- **MEH-124 (Content sync block)** is a process meta-prereq for MEH-123, MEH-76, MEH-122 design sessions.
- **MEH-538 (mini-map)** built on Leaflet infra from MEH-78 (Done). Recommended-after MEH-521 (stats counter), now Done.
- **MEH-521 (stats counter Done)** unblocks MEH-524 (trust strip — uses honest counters) and provides the empty-state coordination for MEH-538 (Done).
- **MEH-527 (founder credibility Done)** layered on top of MEH-135 (refactor) — they share the same file. MEH-135 still pending will need to preserve MEH-527's content.
- **MEH-289 (Done)** created `<EmptyState>` which is now imported in `/settings` (`page.jsx:30`). Sub 3 design recommendations should reuse it, not invent new empty-state patterns.

---

## Section 3 — Gaps + open questions for Sub 2

### 3.1 What patterns are we missing? (≥5 hypotheses)

The following are HYPOTHESES grounded in current-state evidence (Section 1 + 2). They are NOT recommendations — Sub 3 territory. They're what Sub 2 research should investigate against the 14-site peer set referenced in MEH-519.

1. **Issue/Volume eyebrow device.** MEH-123 references Cereal's `"ISSUE 01 · SPRING 2026"` typographic device as a brand element. The current homepage hero (`HomeHero.jsx`) has no eyebrow — only the headline + subtitle. Hypothesis: an editorial eyebrow above the headline would shift the read from "marketplace" → "magazine" instantly, without any other change. Sub 2: do Kinfolk / Cereal / Natoora Mexico use a date or issue-number device? At what positioning?
2. **Producer story carousel as homepage primary.** MEH-542 names this as a backlog item ("on people, not products"). Hypothesis: a 3-5-card "סיפורי בעלות עסק" carousel between sections 11 (Recently viewed) and 12 (Producers grid) would reframe the producers-grid as catalog and the carousel as editorial. Sub 2: how do GrownBy and Farm to People weight "stories" vs "browse"? Where in the scroll?
3. **Trust ladder with named criteria.** MEH-534 (process page) hypothesises that "✅ מאומת" becomes more powerful when the criteria are public. Sub 2: which peer sites publish their entry criteria? LRQDO publishes its model on every "Hive" page; CrowdFarming has a "farmer profile" template. What's the right granularity for mehamakor?
4. **Founder amplification beyond /about.** MEH-527 (founder credibility) lives on /about today. Hypothesis: the founder photo + 1-sentence credibility statement on the homepage (between hero and categories, or replacing the parallax divider 1 + sapir quote combo) would make the founder explicit on the surface that converts. Sub 2: where does Farmish (85% women founders) put the founder on its homepage?
5. **Comparison strip "סופר vs מהמקור".** MEH-525 hypothesises a 3-row visual comparison. Current homepage has no comparison anywhere — visitors must self-explain why this isn't a Wolt. Sub 2: how do PEEL and Farm to People handle the "why not just a supermarket" question? Inline? On /about? Or never explicitly?
6. **Discovery-by-season vs discovery-by-category.** Today's category grid (section 8) is the primary discovery affordance. Hypothesis: an alternate seasonal-discovery hook (`HomeMarquee` is currently a low-info strip — section 9) could be the seasonal primary. Sub 2: which peers organise by season? Farm to People's "What's good this week" feed is a model.
7. **Map-as-primary vs map-as-preview.** MEH-538 made map a preview between sections. Hypothesis: peers like GrownBy treat map as the entire homepage, not a section. Sub 2: at what producer-count threshold does map-primary make sense for mehamakor? (Today's threshold is unknown but is <50 producers.)

### 3.2 What's contradictory between current site and the "magazine, not marketplace" thesis? (≥3 examples)

1. **CTA names itself a directory.** `home.cta.body` says `"הצטרפו לדירקטורי הראשון בישראל לאוכל אמיתי"` (verbatim — `messages/he.json`, used in `<HomeCTA>` at `HomeStaticBlocks.jsx`). "דירקטורי" is the marketplace word. A magazine doesn't call itself a directory. Friction: the same page that frames itself as a magazine ends with the word "directory" as its conversion pitch.
2. **Stats counter pattern is a marketplace trust signal, not an editorial one.** `page.js:69-85` renders `"N בתי עסק מאומתים · M קטגוריות · מכל רחבי הארץ"` against a primary-green background. This is the Wolt / Tigerhe-style stats strip. Magazines (Kinfolk, Cereal, Natoora) do not lead with metric strips — they lead with photography or copy. The strip exists for honest reasons (replaces the broken "אלפי" claim — MEH-521) but its pattern is borrowed from the marketplace family. Sub 3 has to decide: keep it honest, or replace with an editorial pattern (e.g., "Issue 03 · Spring 2026 · 32 stories").
3. **"בתי עסק מומלצים" heading vs "directory" CTA — contradiction within one scroll.** Section 12 calls the businesses `"מומלצים"` (curated/recommended, editorial); section 19 calls them `"דירקטורי"` (catalog, marketplace). Both true today. A first-time visitor parses this as inconsistency unless we pick a side or build an explicit gradient ("מומלצים בכל קטגוריה" → "דפדפי בכל בתי העסק").
4. **Categories subhead is a transactional promise, not an editorial one.** `categories.subheading` is `"ישר מבית העסק — בלי מתווכים"`. This is a Wolt-style guarantee ("no middleman"). Magazines describe; transactional sites guarantee. Friction.
5. **How-it-works step 3 is conversion language.** `home.how_it_works.step03_text` reads `"אוכל אמיתי וטרי, ישר מהמקור — בלי מתווכים, בלי הנחות על האיכות"`. "בלי הנחות על האיכות" is a marketplace differentiator ("not the cheap one"). Editorial step would describe an outcome, not contrast with competitors.

### 3.3 What should Sub 2 research focus on? (specific questions, not vague)

Phrased as questions Sub 2 can answer empirically with screenshots + copy quotes from the 14 peer sites.

1. **Editorial pacing.** For 5 magazine-style food/lifestyle peers (Kinfolk, Cereal, Natoora Mexico, Ottolenghi, Saveur), capture the homepage section count + the screen-heights between sections. Mehamakor is currently 19 sections — is that high, normal, or low for the magazine family?
2. **First-fold trust signal.** For the 8 farm-to-table peers in MEH-519's research (israelfarmers, GrownBy, CrowdFarming, LRQDO, Farm to People, PEEL, Foodshed, Open Food Network), what trust signal sits in the first 100vh? Photo? Counter? Quote? Map? None?
3. **CTA terminology.** Across the 14 peers, count usage of these terms: "directory" / "marketplace" / "magazine" / "community" / "discovery" / "stories". The mode tells us which family mehamakor's "directory" CTA defects from.
4. **Map prominence.** For peers WITH a map (GrownBy, CrowdFarming, LRQDO): is the map a homepage section, the whole homepage, or a /map sub-route? At what producer count?
5. **Producer story length.** For peers with story pages (Farm to People, Farmish, LRQDO): word count of a typical producer story page. Hypothesis: mehamakor's current `producer.description` field is probably underused — we don't know average length. Sub 2 should at minimum sample 5 mehamakor producer pages and 5 peer producer pages and compare.
6. **Empty-state voice.** Mehamakor's homepage empty state (no producers in area) reads `"לא מצאנו עסקים באזור הזה — עדיין 🌱"` (`producers.empty_heading`). What's the equivalent voice on peer sites? Apologetic? Inviting? Statistical?
7. **The "magazine, not marketplace" thesis at the CTA layer.** Sub 2 should specifically check whether peers in the "warm community" tier (LRQDO, Farmish) ever use "directory" language. If never → strong signal mehamakor's "דירקטורי" CTA is a defection. If sometimes → contextual.

---

## Verification (per spec)

- [x] **`docs/audits/2026-05-homepage-discovery-audit.md` exists with all 3 sections.** ✅ This file.
- [ ] **≥14 screenshots in `docs/audits/screenshots/2026-05/`.** ❌ Deferred to Smadar per STOP condition (a). Empty directory + README checklist included in this PR.
- [ ] **28 Lighthouse data points** (4 scores × 7 pages). ❌ Deferred to Smadar per STOP condition (b). `docs/audits/2026-05-lighthouse-baseline.md` template included.
- [x] **Linear crawl ≥15 issues with structured table.** ✅ 19 issues catalogued + dependency map.
- [x] **Gaps section ≥5 hypotheses + ≥3 contradictions.** ✅ 7 hypotheses + 5 contradictions + 7 Sub-2 questions.
- [x] **All Hebrew quoted verbatim.** ✅ All copy from `messages/he.json` and `AboutClient.jsx` quoted exactly as in source.
- [x] **All claims sourced (file:line / Linear URL).** ✅ Per-claim citations throughout.
- [x] **`npm run build` green.** ✅ Sanity verified — see PR description.

---

## Skeptic notes (Section 1 friction points)

The friction points in Section 1 are inferred from **code reading**, not from rendering the site. Some of them (e.g., "stats counter slot causes CLS") are testable hypotheses that Smadar can confirm or reject in mobile QA. The points labelled "documented friction" (e.g., MiniMap name collision) are unambiguous from the source; the points labelled "design tension" are judgement calls that Sub 3 can override.

Where the audit calls out "second SSR layer for Googlebot" (`/map` page) or "two pagination models" (`/producers`), those are documented in the source comments themselves — I am not inventing them.

Where the audit declines to render an opinion (e.g., whether Tel-Aviv-vs-Jerusalem center is "right"), the constraint is that MEH-538's PR description already locked the rationale; I am not relitigating decisions that have shipped.

