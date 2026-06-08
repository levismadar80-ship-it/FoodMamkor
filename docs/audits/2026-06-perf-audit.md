# Site health audit — perf / bundle / images / links / fonts (June 2026)

> **Type:** READ-ONLY audit. Findings only — **zero source edits applied**.
> **Refs:** MEH-125 (pre-launch checklist, audits 1–7). Completes the
> deferral in [`2026-05-lighthouse-baseline.md`](./2026-05-lighthouse-baseline.md)
> ("no Chromium runtime" STOP) — this run executed Lighthouse locally
> against the production build via the Playwright-bundled Chromium.
> **Raw reports:** [`raw/perf/`](./raw/perf/) (6× Lighthouse JSON + verify run).

## Environment & honest limits

- **Build:** `next build` (Next.js **16.2.7**, Turbopack), commit on
  `claude/relaxed-cray-gRNYy`. Build green (101 static pages, TS clean).
- **Lighthouse:** v13.3.0, `--preset=perf --form-factor=mobile` (throttled
  mobile), Playwright Chromium `--headless=new`, against `next start` on
  `:3000`. **Local, no CDN/edge, no Brotli, no warm cache** — scores are a
  **lower-bound relative signal** for layout + JS cost, *not* a production
  field number. Production (Vercel edge + Brotli + image CDN) will score
  higher. Use deltas between routes, not absolute values.
- **No backend.** `/api/*` proxies to a dead `localhost:8000`. Data routes
  (`/producer/[id]`, `/events`, `/register/producer`) render **never-resolving
  `animate-pulse` skeleton shells** → their **CLS is unreliable** (whole-layout
  reflow on fetch-failure), flagged per finding. Layout routes (`/`, `/producers`,
  `/map`) are reliable for JS/render cost.
- **Bundle per-route table:** Next 16 + Turbopack **no longer emits the
  per-route "First Load JS" column** (only Revalidate/Expire), and produces
  no `app-build-manifest.json`. `ANALYZE`/`@next/bundle-analyzer` is **not
  wired**. Fallback used: `du` on `.next/static/chunks` + library
  fingerprinting + Lighthouse `network-requests` per route.
- **Link crawl:** server-rendered HTML only. Client-rendered nav links appear
  post-hydration and are **not** covered (see PERF-010).

---

## תקציר מנהלים (Hebrew exec summary)

ביקורת בריאות אתר על build הפרודקשן המקומי. הבנייה תקינה, חבילת ה-JS **נקייה
יחסית** (אין lodash/recharts, ו-Leaflet+framer מפוצלים מה-baseline). שלוש
בעיות ביצועים אמיתיות, כולן פוגעות בקהל הנייד (70%+):

1. **דף הבית כבד ב-JS.** ציון ביצועים נייד **61**, LCP **5.2 שניות**,
   TBT **690ms**, עבודת main-thread **8.9 שניות**. הסיבה: גם **framer-motion**
   (~124KB) וגם **Leaflet** (~204KB) נטענים בדף הבית מעל הקפל —
   framer ל-Hero/קטגוריות, ו-Leaflet דרך מפת-המיני שנטענת מיד (MEH-604).
2. **גופנים חיצוניים חוסמי-רינדור.** כל גופני התצוגה (Frank Ruhl Libre,
   Cormorant, DM Sans) + Heebo נטענים מ-Google Fonts דרך `<link>` ו-`@import`
   ב-CSS — **לא** דרך `next/font`. גורם ל-FOUT וחוסם רינדור.
3. **CLS בדפי תוכן לא נמדד אמין** (אין backend) — דורש מדידה חוזרת בפרודקשן.

נקודות חיוביות: `/producers` מקבל **91**, `unsized-images` עובר בכל הדפים
(אין CLS מתמונות), אפס קישורים שבורים ב-SSR, ו-hreflang/canonical תקינים.

**אין תיקונים בקומיט הזה** — ממצאים בלבד. כל תיקון = טיקט/PR נפרד.

---

## Lighthouse — measured (mobile, throttled, local lower-bound)

| Route | Perf | LCP | CLS | TBT | FCP | SI | Reliable? |
|---|---|---|---|---|---|---|---|
| `/` (home) | **61** | 5.2 s | 0.003 | 690 ms | 2.1 s | 2.9 s | ✅ JS/render |
| `/producers` | **91** | 2.4 s | 0.003 | 250 ms | 2.2 s | 2.5 s | ✅ |
| `/producer/1` | 52 | 4.6 s | **1.33** | 230 ms | 2.1 s | 2.6 s | ⚠️ empty shell |
| `/map` | 65 | 4.3 s | 0.003 | 530 ms | 2.1 s | 6.0 s | ✅ |
| `/register/producer` | 51 | 4.6 s | **0.68** | 320 ms | 2.2 s | 2.7 s | ⚠️ empty shell |
| `/events` | 57 | 4.4 s | **0.488** | 230 ms | 2.1 s | 3.2 s | ⚠️ empty shell |

Home verify run (2nd pass): perf **61**, LCP 5.3 s, TBT 680 ms — stable.
Diagnostics (home): main-thread work **8.9 s**, bootup **2.6 s**, total weight 721 KiB.

---

## BUNDLE

### PERF-001 — framer-motion (~124 KB) loads on the homepage above the fold · **HIGH**
**Evidence:** framer-motion compiles to chunk `03940jbwvimx4.js` (124 KB raw /
~42 KB transferred). It is imported by three above-the-fold homepage
components: `app/[locale]/home/HomeHero.jsx`, `HomeCategoryGrid.jsx`,
`HomeProducersGrid.jsx` (+ `components/FadeInSection.jsx`,
`OnboardingTip.jsx`). Confirmed in Lighthouse `network-requests` for `/`.
This is a primary contributor to home TBT 690 ms / main-thread 8.9 s — the
mobile-first audience pays it on the most-visited page.
**Fix direction:** gate non-critical motion behind `next/dynamic`/viewport, or
replace simple fades with CSS transitions; reserve framer for genuinely
interactive surfaces.

### PERF-002 — Leaflet (~204 KB) loads eagerly on the homepage (non-map route) · **HIGH**
**Evidence:** Leaflet spreads across `1llttfb_acjsq.js` (148 KB) +
`1gsbv_yzrhsgp.js` (44 KB) + `2_l1-9u6pag7v.js` (12 KB). `HomepageMiniMap`
is `dynamic({ ssr:false })` (`app/[locale]/page.js:32`) **but** its
IntersectionObserver "fires immediately" because it's above the fold
(`components/HomepageMiniMap.jsx:43`, MEH-604) — so the homepage pulls the
full Leaflet bundle right after hydration. Lighthouse `network-requests` for
`/` confirms `1llttfb_acjsq.js` (~43 KB transfer) loads. Answers the brief's
question directly: **yes, Leaflet reaches a non-map route (home).**
**Fix direction:** defer the mini-map until first interaction/scroll-intent
(true lazy, not immediate-fire), or render a static map image (Cloudinary/OSM
static tile) above the fold and hydrate Leaflet only on tap.

### PERF-003 — Shared first-load baseline ~447 KB (uncompressed) on every route · **MEDIUM**
**Evidence:** `rootMainFiles` (build-manifest.json) = 447 KB raw across 6
chunks; dominated by `0n76wdz_uzjg4.js` (221 KB, React/react-dom framework)
+ `2yiwnaipq3yg-.js` (135 KB). Transferred ~71 KB + ~38 KB on `/`. This is
the unavoidable floor for all 60+ routes.
**Fix direction:** mostly framework-inherent; revisit after PERF-001/002 to
confirm no app code crept into the shared chunk (e.g. a top-level provider
importing a heavy lib).

### PERF-004 — Bundle hygiene is healthy (positive finding) · **INFO**
**Evidence:** fingerprint sweep of `.next/static/chunks` — **no `lodash`,
no `recharts`** (admin charts are hand-rolled inline SVG, e.g.
`app/[locale]/admin/page.js:329`), `zod` and `lenis` each isolated to one
chunk, and Leaflet + framer are **code-split out of the shared baseline**
(PERF-001/002 are eager-load problems, not tree-shake problems). No
whole-library imports detected. Largest single chunk is 280 KB raw.
**Fix direction:** none — maintain. Add `@next/bundle-analyzer` wiring so
future regressions are visible (Turbopack dropped the per-route column).

## LIGHTHOUSE

### PERF-005 — Homepage is JS-bound: perf 61 / LCP 5.2 s / TBT 690 ms · **HIGH**
**Evidence:** measured table above; main-thread work **8.9 s**, bootup **2.6 s**
(both Lighthouse score 0). Root cause is PERF-001 + PERF-002 (framer + Leaflet
on first paint). `/producers` (same shell, no map/heavy-motion) scores **91**
with TBT 250 ms — the 30-point gap isolates the cost to homepage-specific JS.
**Fix direction:** resolving PERF-001 + PERF-002 should recover most of the
gap toward the `/producers` baseline; re-measure after.

### PERF-006 — `/map` Speed Index 6.0 s / TBT 530 ms · **MEDIUM**
**Evidence:** `lh-map.json` — SI 6.0 s (slowest of all routes), TBT 530 ms,
main-thread 4.8 s. Expected for an interactive Leaflet surface, but SI is the
worst measured; OSM tiles + marker cluster dominate paint.
**Fix direction:** acceptable for a map route, but consider a lighter initial
viewport (fewer markers before interaction) — out of scope to change here.

### PERF-007 — Data-route CLS is a no-backend artifact, NOT a confirmed bug · **INFO (needs prod re-measure)**
**Evidence:** `/producer/1` CLS **1.33**, `/register/producer` **0.68**,
`/events` **0.488** — but these render never-resolving `animate-pulse`
skeletons (confirmed via curl: 5× `animate-pulse`, no content) because the
backend is down; Lighthouse `layout-shift-elements` details are **empty**
(shifts are whole-layout reflows on fetch failure, not stable nodes). On
layout routes with real content (`/`, `/producers`, `/map`) CLS is **0.003**.
**Fix direction:** re-measure these three routes against staging (with
backend) before treating CLS as real. If it persists in production, audit
skeleton→content dimension parity.

## IMAGES

### PERF-008 — 7 raw `<img>` tags bypass next/image (no CLS, missed optimization) · **LOW**
**Evidence:** `app/[locale]/settings/page.jsx:259`,
`app/[locale]/map/components/MobileSheetSelectedCard.jsx:49`,
`app/[locale]/map/components/DesktopMiniPopup.jsx:37`,
`components/BottomNav.jsx:105`, `components/Header.jsx:473`,
`components/HomeProductForm.jsx:345` (upload preview — blob URL, can't
optimize), `components/MapComponent.jsx:77` (Leaflet popup `innerHTML` —
can't use next/image). All have **fixed CSS dimensions**, and Lighthouse
`unsized-images` **passes on every route** → no CLS. The avatars
(`settings`/`Header`/`BottomNav`) point at Cloudinary/Google URLs without
`f_auto,q_auto`, missing the `lib/cloudinary.js` helper.
**Fix direction:** route the avatar `<img>`s through `next/image` +
`lib/cloudinary.js`; leave the Leaflet-popup and upload-preview as-is.

### PERF-009 — Oversized static OG / icon assets in `public/` · **LOW**
**Evidence:** `public/og-image.png` **1.3 MB**, `public/og-image-en.png`
**1.3 MB**, `public/android-chrome-512x512.png` **423 KB** (total `public/`
= 3.2 MB). OG images are fetched by social scrapers, **not** on page load —
near-zero runtime impact — but oversized for their purpose.
**Fix direction:** re-export OG PNGs at 1200×630 compressed (<300 KB each);
flatten android-chrome icon.

## LINKS

### PERF-010 — SSR crawl clean; client links uncovered (limitation) · **INFO**
**Evidence:** crawled 19 seed routes (both locales) on `next start`.
**0 broken links (404/500), 0 redirect chains, no `/neighbor` leak** from
SSR surfaces. `/he/*` correctly 307→default-locale-no-prefix (`localePrefix:
as-needed`); `/en/*` resolve 200. hreflang on `/` = `he-IL` + `en` +
`x-default`, canonical `https://mehamakor.co.il`, all resolve. **Limit:**
only 11 unique links live in SSR HTML (header/footer) — client-rendered nav
appears post-hydration and was not crawled.
**Fix direction:** none from SSR; for full coverage run a Playwright-rendered
crawl against staging (out of scope here).

## FONTS

### PERF-011 — All display fonts via external Google Fonts `<link>`, not `next/font` · **HIGH**
**Evidence:** `app/[locale]/layout.js:192-195` loads Frank Ruhl Libre +
Cormorant Garamond + DM Sans from `fonts.googleapis.com` via a render-blocking
`<link rel="stylesheet">` with `display=swap`. No self-hosting, no `next/font`
optimization (no automatic preload, no size-adjust fallback, extra DNS +
connection despite the `preconnect` at `:185-188`). `display=swap` → FOUT,
which feeds layout-stability risk on the heading-heavy Hebrew UI.
**Fix direction:** migrate to `next/font/google` (self-hosts woff2, auto
`size-adjust` fallback, preloads, removes the render-blocking request);
subset `hebrew,latin`.

### PERF-012 — `globals.css` `@import` for Heebo chains a render-blocking request · **MEDIUM**
**Evidence:** `app/globals.css:1`
`@import url('https://fonts.googleapis.com/css2?family=Heebo...')`. A CSS
`@import` is discovered only *after* the stylesheet loads → a serialized,
render-blocking second hop (worse than a `<link>`). Heebo is referenced as a
body fallback (`globals.css:55`).
**Fix direction:** fold Heebo into the same `next/font` migration (PERF-011)
or move it to a `<link>` in `<head>`; remove the `@import`.

---

## Verify pass (top-3 claims re-measured before finalize)

1. **Home perf 61 / TBT ~690 ms** — re-ran Lighthouse: run1 61 / 690 ms,
   run2 (`lh-home-verify.json`) 61 / 680 ms. **Stable.** ✅
2. **Leaflet + framer both load on `/`** — `network-requests` of `/` lists
   `1llttfb_acjsq.js` (Leaflet, ~43 KB) **and** `03940jbwvimx4.js` (framer,
   ~42 KB) among 25 JS requests / 529 KB. **Confirmed.** ✅
3. **Data-route CLS is an empty-shell artifact** — curl confirms `/producer/1`
   renders only `animate-pulse` skeletons; `layout-shift-elements` details
   empty; reliable routes hold CLS 0.003. **Confirmed unreliable.** ✅

## Severity roll-up (mobile-first)

| ID | Area | Severity |
|---|---|---|
| PERF-001 | framer on homepage | HIGH |
| PERF-002 | Leaflet eager on homepage | HIGH |
| PERF-005 | homepage JS-bound (61/5.2s) | HIGH |
| PERF-011 | external fonts, no next/font | HIGH |
| PERF-003 | 447 KB shared baseline | MEDIUM |
| PERF-006 | /map SI 6.0 s | MEDIUM |
| PERF-012 | CSS @import Heebo | MEDIUM |
| PERF-008 | raw `<img>` avatars | LOW |
| PERF-009 | oversized OG assets | LOW |
| PERF-004 | bundle hygiene (positive) | INFO |
| PERF-007 | data-route CLS (re-measure) | INFO |
| PERF-010 | SSR links clean | INFO |

No source files were modified. Each fix lands as its own ticket/PR.
