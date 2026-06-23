# design-sync NOTES — Mehamakor frontend

Repo-specific gotchas for syncing `frontend/` (a Next.js 16 app, NOT a packaged
component library) to claude.ai/design. Project: **Mehamakor DS — Components**
(`projectId` in config.json). Shape: `package` (synth-entry via a pre-built dist).

## Architecture of this sync (read before re-syncing)

This is an *app*, not a DS library — there is no `dist/`. The pipeline is:

1. **`.design-sync/gen-barrel.mjs`** → writes `frontend/.ds-barrel.mjs` (re-exports
   every component as its PascalCase name) + `.design-sync/.cache/srcmap.json`
   (the `componentSrcMap`). Run it first if components were added/removed/renamed.
2. **`.design-sync/prebuild.mjs`** (esbuild) → bundles the barrel + `DSProvider`
   into `frontend/.ds-dist/index.mjs`, a clean browser ESM dist that the converter
   then wraps. This is where ALL the Next.js-specific neutralization lives (see below).
3. **Tailwind compile** → `frontend/.ds-sync-css/ds.css` is the `cssEntry`
   (the app has no shipped stylesheet — styling is Tailwind utilities).
4. **converter** (`package-build.mjs --entry frontend/.ds-dist/index.mjs`) →
   wraps the dist into `_ds_bundle.js`, copies the CSS, emits cards/.d.ts.

Rebuild command sequence (from repo root):
```
node .design-sync/gen-barrel.mjs
cd frontend && node_modules/.bin/tailwindcss -c .ds-sync-css/tw.config.cjs -i .ds-sync-css/input.css -o .ds-sync-css/ds.css && cd ..
node .design-sync/prebuild.mjs
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./frontend/node_modules --entry ./frontend/.ds-dist/index.mjs --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

## Why the pre-bundle (prebuild.mjs) exists — do not remove it

The converter's own esbuild can't bundle this app's source directly:
- JSX lives in `.js` files (`lib/highlightMatch.js`, `lib/auth-context.js`) — the
  converter's loader map has no `.js`→jsx. prebuild sets `loader['.js']='jsx'`.
- Next internals pull node built-ins (`gzip-size`→fs/stream/zlib). prebuild stubs
  all node built-ins + `server-only`/`next/headers` to empty modules.
- **react must resolve to `window.React` IN the prebuild**, via the `reactGlobal`
  plugin — NOT esbuild `external`. Externalizing react turns CJS deps'
  `require("react/jsx-runtime")` into an unsupported dynamic require in ESM output
  ("Dynamic require of react/jsx-runtime is not supported"). The plugin mirrors the
  converter's own reactShim so the re-bundle finds no react imports left.
- A `process` shim is injected via esbuild `banner` (browser has no `process`;
  deps read `process.env.*`/`process.browser` at module init).
- **`lib/env*.js`** (`@t3-oss/env-nextjs`) validate `process.env` at IMPORT time and
  throw "Invalid environment variables". In one IIFE a single import-time throw kills
  `window.MehamakorDS` for EVERY component — `envStub` (onLoad, matches resolved
  `.js` path) replaces them with a permissive Proxy.

## Provider

`frontend/.ds-provider.jsx` exports `DSProvider` (in the dist via the barrel entry;
`cfg.provider = {component:"DSProvider"}`). Supplies next-intl (Hebrew `messages/he.json`)
+ stub Next App Router / pathname / searchParams contexts, wrapped in `dir="rtl"`.
Components calling `next/navigation` hooks render instead of throwing.
NOT included: `AuthProvider` (lib/auth-context.js) — it fetches `/me` via axios on
mount (404 in preview) and no core component needs it; ~11 auth components render the
floor card cleanly without it.

## Excluded components

- **3 leaflet map widgets** (`HomepageMiniMap`, `MapComponent`, `MiniMap`) — excluded
  in `gen-barrel.mjs`. They `import "leaflet/dist/leaflet.css"`; bundling them makes
  esbuild emit CSS, which would force the brand-font `@import`s mid-file (invalid).
  Map widgets aren't DS components. 91 of 94 components sync.
- `CategoryIcons.jsx` (icon map, no single component export) and `Skeleton.jsx`
  (file name ≠ exports — its 3 exports `SkeletonCard/Line/ProducerGrid` ARE synced
  via the `EXTRAS` map in gen-barrel.mjs).

## Fonts

4 brand families load REMOTELY via Google Fonts `@import` (Frank Ruhl Libre,
Cormorant Garamond, DM Sans, Heebo). `input.css` adds the 3 that the app loads via
`<link>` in `app/[locale]/layout.js`; globals.css carries Heebo. They land at the TOP
of `_ds_bundle.css` (valid) and reach designs via `styles.css`'s `@import` closure.
`[FONT_REMOTE]` from validate is expected/informational — no local @font-face to ship.

## Known render warns (triaged)

- ~11 `useAuth must be used within AuthProvider` → caught, floor card renders. Expected.
- Data-shape TypeErrors on app components needing real props (ProducerCard, RecipeCard,
  RecipeDetail, ExperienceCard, etc.) → floor cards. Expected (out of core scope).
- `admin/ProducerForm` → AxiosError 404 on mount → floor card. Expected.

## Authored-preview learnings (core ~25 set)

Folded from the batch waves. The 25 authored components: Button, Card, Heading,
Badge, Input, Link, EmptyState, Tooltip, Popover, InfoTooltip, StarRating,
StarSelector, TrustBadge, CategoryTag, AvailabilityBadge, RecipeStatusBadge,
KashrutBadgeStrip, BadgeRow, ButtonSpinner, Breadcrumb, Pagination, ChipScrollRow,
SkeletonCard, SkeletonLine, SkeletonProducerGrid.

- **Preview idiom that works:** import components from `"mehamakor-frontend"`; named
  exports = cells; inline styles for layout glue (NOT Tailwind className — the preview
  stylesheet only carries classes scanned from real components); realistic Hebrew content.
- **Skeleton shimmer (FIXED globally):** `.skeleton-box` + `@keyframes shimmer` were only
  in `SkeletonProducerGrid`'s `<style jsx global>` (Skeleton.jsx), so SkeletonCard/Line
  rendered invisible alone. Now promoted into `input.css` → ships in `_ds_bundle.css`, so
  all skeletons shimmer in real designs. The Skeleton*.tsx previews still inject a local
  `<style>` (redundant now, harmless).
- **Interaction-only overlays:** Tooltip, Popover, InfoTooltip open their bubble/panel via
  uncontrolled hover/click state — the open state can't render in a static screenshot. Their
  previews show the styled trigger only (graded good; do NOT hand-fake the open state).
- **next-intl namespaces are healthy** for all authored components. Non-obvious: AvailabilityBadge
  reads `group_buys.availability` (not `producer.availability`).
- **AvailabilityBadge** `variant="card"` returns `null` for "open" states — previews use visible states.
- **Avoid relative-time story cells:** KashrutBadgeStrip's near-expiry warning chip depends on
  `new Date()` math vs the headless clock and won't render deterministically — used a
  clock-independent cell instead.
- **CategoryTag** is intentionally faint (cream bg / muted ink) — that's its real design, graded good.

## Re-sync risks (watch-list)

- **Generated artifacts are gitignored** (`frontend/.ds-dist/`, `.ds-barrel.mjs`,
  `.ds-sync-css/ds.css`); a fresh clone must re-run gen-barrel + tailwind compile +
  prebuild before the converter. The hand-authored build inputs ARE committed:
  `frontend/.ds-provider.jsx`, `frontend/.ds-sync-css/input.css` (carries the skeleton
  fix), `frontend/.ds-sync-css/tw.config.cjs`, plus `.design-sync/{gen-barrel,prebuild}.mjs`.
- The prebuild stubs (env, node-builtins) are tied to current app code. If the app adds a
  new import-time throw (another createEnv, a top-level network call), it can kill the IIFE
  again — symptom: ALL components go bad with one shared firstErr. Fix by stubbing the new
  offender in prebuild.mjs.
- `messages/he.json` (224KB) is inlined into the bundle via DSProvider. Grows the bundle;
  acceptable, but if it balloons consider a lighter message subset for previews.
- next internal context paths (`next/dist/shared/lib/*.shared-runtime`) are version-coupled
  to Next 16 — a Next major bump may move them; update `.ds-provider.jsx`.
