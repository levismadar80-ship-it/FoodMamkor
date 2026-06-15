# Frontend Performance Audit — 2026-06-13

**Scope:** `frontend/` Next.js 16 app (App Router). **Type:** REPORT ONLY — no code fixes.
**Signals:** static code analysis (imports, `<img>` vs `next/image`, `"use client"`,
`dynamic()`), `next.config.js`, and the production build output.

**Method note:** the captured `next build` output did not emit the *First Load JS*
size column in this environment, so per-route byte sizes are **best-effort** (raw
chunk sizes from `.next/static/chunks` + import-graph analysis). A precise per-route
budget needs `@next/bundle-analyzer` (recommended as a follow-up). Largest raw
client chunks observed: **280 KB / 224 KB / 196 KB** (pre-gzip).

---

## Headline — Top 5 highest-ROI wins

1. **`optimizePackageImports` is NOT configured** — **89 files** import from
   `@phosphor-icons/react` (barrel import). Unlike `lucide-react`, phosphor is not
   in Next's default optimize list, so without explicit config the icon barrel can
   pull far more than the icons used. **Fix:** add
   `experimental.optimizePackageImports: ['@phosphor-icons/react', 'framer-motion']`
   to `next.config.js`. One line, app-wide First-Load-JS reduction. **(HIGH / trivial)**
2. **`ChatWidget` (301 LOC, client) is eagerly imported in `app/[locale]/layout.js`**
   and rendered on **every page** — but it's interaction-gated (only opens on click).
   **Fix:** `dynamic(() => import("@/components/ChatWidget"), { ssr: false })`. Removes
   a client component from the initial bundle of every route. **(HIGH / trivial)**
3. **`framer-motion` `MotionConfig` imported in the root layout** (`layout.js:4`) →
   framer is in the global bundle for every route, plus 5 more importers. Covered by
   win #1's `optimizePackageImports`, but also consider whether `MotionConfig` must be
   global vs. wrapping only animated subtrees. **(MEDIUM)**
4. **7 raw `<img>` tags bypass `next/image`** — no automatic resize/format/lazy and
   (for avatars) layout-shift risk. **(MEDIUM)**
5. **No `images.formats`** in `next.config.js` → AVIF not served (WebP-only by
   default). Adding `formats: ['image/avif', 'image/webp']` shrinks hero/card images
   on supported browsers. **(LOW / trivial)**

---

## 1. Bundle size & heavy imports

| Signal | Detail | Impact |
|---|---|---|
| `optimizePackageImports` absent | `next.config.js` has no `experimental` block; **89** `@phosphor-icons/react` importers (named imports, but un-optimized barrel) | **HIGH** |
| `framer-motion` global | `app/[locale]/layout.js:4` `import { MotionConfig } from "framer-motion"` + importers in `HomeHero.jsx`, `HomeProducersGrid.jsx`, `HomeCategoryGrid.jsx`, `FadeInSection.jsx`, `OnboardingTip.jsx` | MEDIUM |
| Largest raw client chunks | `.next/static/chunks` top: 280 KB, 224 KB, 196 KB, 148 KB, 136 KB (pre-gzip) | INFO — analyzer needed to attribute |
| No bundle analyzer wired | can't produce per-route First-Load-JS budget | follow-up |

**Recommended:** add to `next.config.js`
```js
experimental: { optimizePackageImports: ['@phosphor-icons/react', 'framer-motion'] }
```

## 2. Image optimization

**Raw `<img>` (bypass `next/image`):**
| file:line | src | note |
|---|---|---|
| `components/Header.jsx:404` | `user.avatar_url` | avatar — use `next/image` (fixed 32–40px box, add width/height) |
| `components/BottomNav.jsx:138` | `user.avatar_url` | avatar — same |
| `components/AccountSheet.jsx:96` | `user.avatar_url` | avatar — same |
| `app/[locale]/settings/page.jsx:259` | `user.avatar_url` | avatar — same |
| `app/[locale]/map/components/MobileSheetSelectedCard.jsx:49` | `spImg` | map card thumb — convertible to `next/image` |
| `app/[locale]/map/components/DesktopMiniPopup.jsx:37` | `imageUrl` | map popup thumb — convertible |
| `components/MapComponent.jsx:77` | string-built `<img loading="lazy">` | **justified** — injected as Leaflet popup HTML string; `next/image` can't render there. Already has `loading="lazy"`. Leave. |

`user.avatar_url` host (`*.googleusercontent.com`) is **not** in `next.config.js`
`images.remotePatterns` (only `res.cloudinary.com` + `images.unsplash.com`), so the
4 avatar `<img>` can't trivially move to `next/image` without adding that pattern —
**call it out before converting**.

**`next/image` usage is otherwise good:** most call sites use `fill` + `sizes`
(`ProducerCard`, `FridayDeliveryStrip`, `settings` product thumbs) or explicit
`width`/`height` (`error.js`, `not-found.js`). No obvious missing-dimensions CLS in
the `<Image>` call sites reviewed.

**Config gap:** `images.formats` not set → add `['image/avif','image/webp']`.

## 3. Lazy-loading / code-splitting

**Good (already deferred):**
- `HomepageMiniMap` — `dynamic(..., { loading, ssr:false })` (`page.js:33`)
- `MiniMap` — `dynamic(..., { ssr:false })` (`ProducerSections.jsx:18`)
- `MapComponent` — `dynamic(..., { ssr:false })` (`MapPane.jsx:34`)

**Opportunities:**
- **`ChatWidget`** — eager in `layout.js:227`; should be `dynamic({ ssr:false })` (win #2).
- Heavy, below-the-fold or modal-gated client components that are statically imported
  could be `dynamic()`: candidates worth measuring — `HeroSearch.jsx` (430 LOC),
  `OnboardingTip.jsx` (framer), admin tables (admin routes are low-traffic but ship
  big client trees).

## 4. Client vs Server components

**156 `"use client"` files.** Largest client components:

| LOC | file | server-split opportunity? |
|---|---|---|
| 1404 | `app/[locale]/settings/page.jsx` | justified (forms/state) — but could extract static sub-sections |
| 893 | `app/[locale]/producer/dashboard/page.js` | justified (dashboard state) |
| 826 | `app/[locale]/register/producer/RegisterProducerClient.jsx` | justified (multi-step form) |
| 719 | `components/admin/ProducerForm.jsx` | justified (form) |
| 568 | `app/[locale]/admin/outreach/page.jsx` | justified (admin interactivity) |
| 564 | `components/ProducersClient.jsx` | partial — list rendering could be server, filters client |
| 474 | `app/[locale]/events/EventsClient.jsx` | partial — card list could be server |
| 440 | `components/Header.jsx` | justified (interactive nav) |

Most large client components are **legitimately interactive** (forms, dashboards).
The realistic server-split wins are **list/card renderers** (`ProducersClient`,
`EventsClient`, `ExperiencesClient`) where the data fetch + markup could be a server
component with a thin client island for filters/interaction — but that's a refactor,
not a quick win. **Lower priority than wins #1–#5.**

## 5. Render-blocking

- `framer-motion` `MotionConfig` in the root layout (`layout.js:4`) is the main
  global-bundle contributor on the critical path (see §1).
- Fonts/CSP/headers reviewed in `next.config.js` — no obvious render-blocking
  third-party `<script>` in the layout beyond Google GSI / Sentry (expected).

---

## Top-20 wins (ranked: impact ÷ effort)

| # | win | where | effort | impact |
|---|---|---|---|---|
| 1 | Add `optimizePackageImports: ['@phosphor-icons/react','framer-motion']` | `next.config.js` | trivial | HIGH |
| 2 | Lazy-load `ChatWidget` via `dynamic({ssr:false})` | `layout.js:16,227` | trivial | HIGH |
| 3 | Add `images.formats:['image/avif','image/webp']` | `next.config.js:102` | trivial | MED |
| 4 | Avatar `<img>` → `next/image` (×4) + add googleusercontent remotePattern | `Header:404`, `BottomNav:138`, `AccountSheet:96`, `settings:259` | small | MED |
| 5 | Map thumb `<img>` → `next/image` (×2) | `MobileSheetSelectedCard:49`, `DesktopMiniPopup:37` | small | MED |
| 6 | Wire `@next/bundle-analyzer` to get real per-route budgets | `next.config.js` | small | MED (enables the rest) |
| 7 | Scope `MotionConfig`/framer to animated subtrees, not root layout | `layout.js:4` | med | MED |
| 8 | `dynamic()` `HeroSearch` if below-fold on first paint | `HeroSearch.jsx` | small | MED |
| 9 | `dynamic()` `OnboardingTip` (framer, conditionally shown) | `OnboardingTip.jsx` | small | LOW-MED |
| 10 | Server-split `ProducersClient` list markup, client filter island | `ProducersClient.jsx` | large | MED |
| 11 | Server-split `EventsClient` card list | `EventsClient.jsx` | large | MED |
| 12 | Server-split `ExperiencesClient` card list | `ExperiencesClient.jsx` | large | MED |
| 13 | Audit 280 KB / 224 KB chunks via analyzer; attribute + trim | `.next` | med | MED |
| 14 | Confirm Leaflet/marker-cluster only load on map routes (already `dynamic` — verify no static import leaks) | map components | small | MED |
| 15 | Lazy-load admin tables (low-traffic, big client trees) | `admin/**` | med | LOW |
| 16 | Extract static sub-sections of `settings/page.jsx` (1404 LOC) to server | `settings/page.jsx` | large | LOW-MED |
| 17 | Add `priority` only to true LCP images; verify others lazy | `HomeHero`, `ProducerCard` | small | LOW |
| 18 | Verify `sizes` on all `fill` images to avoid oversized fetches | image call sites | small | LOW |
| 19 | Consider `loading="lazy"` parity for any remaining below-fold media | various | small | LOW |
| 20 | Add a CI bundle-size budget check once analyzer is wired | CI | med | LOW (guardrail) |

---

_Generated by the overnight perf scan (Batch #2, Task 4). REPORT ONLY — no code
changed. Precise byte budgets require `@next/bundle-analyzer` (win #6) — wins #1–#5
are safe, high-confidence, and independently shippable._
