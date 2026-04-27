# MEH-370 Breaking Changes Inventory
# Next.js 14.2.35 → 16.2.4 + ESLint 8 → 9

Generated: 2026-04-27
Based on: installed package inspection, codebase grep, Next.js release notes

---

## Step 1 install summary

Command that worked: `npm install next@16.2.4 eslint-config-next@16 eslint@9`
(original spec command `npm install next@16.2.4 eslint-config-next@16` failed — `eslint-config-next@16`
requires `eslint@>=9.0.0`; project had `eslint@8.57.1`)

package.json changes (3 lines):
- `next`: `14.2.35` → `^16.2.4`
- `eslint`: `^8.57.1` → `^9.39.4`
- `eslint-config-next`: `14.2.35` → `^16.2.4`

Remaining warning (non-blocking): `@sentry/nextjs@8.55.1` peer dep doesn't cover next@16
(covered by MEH-371 — Sentry upgrade).

Unexpected transitive change (package-lock only): `typescript 5.9.3 → 6.0.3`
— pulled in by eslint-config-next@16. Project uses JS (not TS); verified zero impact
(no `tsconfig.json`, only Playwright e2e .ts files which use Playwright's own transpiler).

## Vuln delta verification (post-install vs MEH-362 baseline)

`npm audit` count: **14 → 12** (high `11 → 7`, moderate `3 → 5`).

Sorted by `next@16` + `eslint-config-next@16`:
- `glob` (high) — eslint-config-next transitive fix
- `@next/eslint-plugin-next` (high) — eslint-config-next@16
- `eslint-config-next` (high) — direct upgrade

Still present (require MEH-371 + MEH-372):
- Sentry chain: `@sentry/nextjs`, `@sentry/webpack-plugin` (2)
- next-pwa chain: `next-pwa`, `rollup`, `rollup-plugin-terser`, `serialize-javascript`, `workbox-build`, `workbox-webpack-plugin` (6)
- Other: `postcss`, `uuid` (2)

Newly listed but not new:
- `next` (was high, now moderate — range `>=9.3.4-canary.0`, no upstream fix yet; high CVEs ARE patched by 16.2.4)
- `@vercel/speed-insights` (transitive only — listed because `next` has a moderate; not a separate vuln)

**Conclusion:** the spec's "5 high CVEs in next" are in fact resolved (severity dropped from high → moderate). The remaining 7 high vulns all live in chains owned by MEH-371 or MEH-372. **No unexpected new vulns introduced.**

### MEH-370 success criteria (revised)

Original spec stated: "npm audit --audit-level=high: 0 high vulns after upgrade (was 11)".
This is not achievable in MEH-370 alone — the Sentry and next-pwa chains (7 high) require MEH-371 and MEH-372.

**Revised success criteria for MEH-370 merge gate:**
- `npm audit` high count ≤ 7 (from 11) — Sentry + next-pwa chains remain but are tracked
- Specifically: 3 vulns removed (glob, @next/eslint-plugin-next, eslint-config-next) + next reclassified from high → moderate
- The original "0 high vulns" target becomes the MEH-371+MEH-372 combined exit criterion, not MEH-370's alone

---

## Breaking Changes Table

### MUST-FIX (blocks build or runtime)

| # | Category | Change | Impact on Mehamakor | Migration path | Priority |
|---|---|---|---|---|---|
| 1 | Build / Lint | `next lint` CLI **removed** from Next.js 16 — the `next` binary no longer has a `lint` subcommand | `package.json` `"lint": "next lint"` will fail with `Unknown command: lint` on every CI run and local `npm run lint` | Change lint script to `"lint": "eslint ."` — ESLint 9 is already installed | **MUST-FIX** |
| 2 | Build / ESLint | ESLint 9 uses **flat config** (`eslint.config.js`) by default — legacy `.eslintrc.json` is not read unless `ESLINT_USE_FLAT_CONFIG=false` is set | `frontend/.eslintrc.json` with `"extends": "next/core-web-vitals"` + 3 custom RTL rules | Two options: (A) set `ESLINT_USE_FLAT_CONFIG=false` in the lint script, OR (B) migrate to `eslint.config.js` (recommended). See note below. | **MUST-FIX** |
| 3 | App Router | **`params` is now a `Promise`** in Server Component pages/layouts — synchronous access (`params.slug`) throws in Next.js 15+ | 6 call sites: `app/[slug]/page.js:31,48`, `app/producer/[id]/page.js:16,33`, `app/p/[slug]/page.js:5`, `app/group-buys/[id]/page.js:3` | Codemod: `npx @next/codemod@latest next-async-request-api .` | **MUST-FIX** |
| 4 | App Router | **`searchParams` is now a `Promise`** in Server Component pages — synchronous access throws in Next.js 15+ | 2 call sites: `app/producers/page.jsx:37,55` | Same codemod as #3 | **MUST-FIX** |
| 5 | Build | **`next-pwa@5.6.0` peer dep mismatch** — `withPWA` wrapper in `next.config.js` is the outermost wrapper; if it throws on Next.js 16 startup, the build fails entirely | `next.config.js` line 1: `const withPWA = require("next-pwa")({...})` wraps `nextConfig` at export | MEH-372 — upgrade to `next-pwa@2.0.2` or `@ducanh2912/next-pwa`. Do NOT address in this PR. Must be fixed before `npm run build` can pass. | **MUST-FIX** |
| 6 | Build | **Turbopack default + webpack config conflict** — Next.js 16 enables Turbopack for `next build` by default; `withSentryConfig` injects a webpack plugin with no turbopack equivalent | Local build shows: `⨯ ERROR: This build is using Turbopack, with a \`webpack\` config and no \`turbopack\` config` → "WorkerError: Call retries were exceeded" (Sentry's webpack worker crashes the build) | Two options: (A) add `turbopack: {}` to `next.config.js` nextConfig, OR (B) disable Turbopack with `experimental: { turbopack: false }` in nextConfig. Option B is safe until MEH-371 (Sentry v10 upgrade) provides native turbopack support. Confirm by running `npm run build` after applying. | **MUST-FIX** |

### WARNINGS (non-blocking but require monitoring)

| # | Category | Change | Impact on Mehamakor | Migration path | Priority |
|---|---|---|---|---|---|
| 6 | Monitoring | **`@sentry/nextjs@8` unsupported on Next 16** — peer dep warning at install; `withSentryConfig` in `next.config.js` is inside a try/catch that gracefully skips it | Sentry error reporting will silently degrade (no crash, just no Sentry wrapping) until MEH-371 | MEH-371 — upgrade `@sentry/nextjs` to `^10.50.0` | NICE-TO-HAVE (MEH-371) |
| 7 | Build | **Node.js `>=20.9.0` required** — Next.js 16 engine field is `>=20.9.0` | CI uses `node-version: "20"` in workflow — need to confirm actual patch version | Verify Railway production/staging Node.js version. Node 20.18.x (current LTS) satisfies this. | LOW |
| 8 | Build | **`fetch()` default cache changed** — 14 used `force-cache`, 15+ uses `no-store` as default | Mehamakor uses **axios** for all API calls — no native `fetch()` in app code | N/A for this codebase — axios is unaffected | N/A |
| 9 | Build | **TypeScript 6.0.3** — pulled in as transitive dep by `eslint-config-next@16` (package-lock only) | **Verified zero impact** (2026-04-27): no `tsconfig.json` anywhere in `frontend/`; only `.ts` files are Playwright e2e tests which use Playwright's own internal transpiler (Playwright 1.56.0 ships its own TS handling). `npx tsc --noEmit` finds no project to compile. ESLint 9 + `eslint-config-next@16` use TS for type-checking internally but expose no parser errors. | N/A — verified safe | N/A |
| 10 | Build | **New native packages** — `sharp` (image optimization), `lightningcss-*` (CSS), `@rolldown/binding-*` (Rolldown bundler), `@unrs/resolver-*` added to lock file | These are platform binaries bundled with Next 16. Larger `node_modules`. No code changes needed. | N/A — auto-handled by Next 16 | N/A |

### N/A (verified not applicable to Mehamakor)

| # | Category | Change | Why N/A |
|---|---|---|---|
| 11 | Middleware | `middleware.ts` → `proxy.ts` rename (Next.js 16) | No `middleware.ts` or `middleware.js` in codebase |
| 12 | Cache | `revalidateTag()` now requires second `cacheLife` argument | `revalidateTag` not used anywhere in codebase |
| 13 | App Router | Parallel routes now require explicit `default.js` | No parallel route slots (`@`-prefixed directories) in codebase |
| 14 | Metadata | `viewport` must be exported separately from `metadata` | Already separated: `app/layout.js:97` exports `viewport` independently |
| 15 | Image | Image generation functions (`opengraph-image`, `twitter-image`) receive `params` as a Promise | No `opengraph-image.*` or `twitter-image.*` routes in codebase |
| 16 | React | React 18 → 19 upgrade | `next@16.2.4` peer deps: `"react": "^18.2.0 || ^19.0.0"` — **React 18 is still supported**. Spec `<forbidden>` correctly says no manual React 19 install. |
| 17 | App Router | Route Handler GET responses no longer cached by default | No `route.js` GET handlers in codebase that rely on implicit caching |
| 18 | Scroll | `scroll-behavior` no longer overridden by Next.js during navigation | No explicit `scroll-behavior: smooth` in CSS that would conflict |

---

## Detailed notes on MUST-FIX items

### #1 + #2 — next lint removal + ESLint 9 flat config (linked)

The two issues are connected. Recommended migration path:

**Option A — minimal change (temporary)**
```json
// package.json
"lint": "ESLINT_USE_FLAT_CONFIG=false eslint ."
```
Keeps `.eslintrc.json`. Works but ESLint 9 shows a deprecation warning. 
Not suitable long-term.

**Option B — full flat config migration (recommended)**
Create `frontend/eslint.config.js`:
```js
import { FlatCompat } from "@eslint/eslintrc";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends("next/core-web-vitals"),
  {
    rules: {
      "no-undef": "error",
      "no-restricted-syntax": [
        "warn",
        // ... preserve existing 3 RTL rules verbatim
      ],
    },
  },
];
```
Then change `package.json`: `"lint": "eslint ."`.
Delete `.eslintrc.json`.

**Blocker:** `eslint-config-next@16` dist is CommonJS (`"use strict"`) — needs `@eslint/eslintrc`'s
`FlatCompat` to bridge legacy config into flat config format. Install:
`npm install --save-dev @eslint/eslintrc` (it's already a dependency via eslint@9).

### #3 + #4 — async params / searchParams

Pages needing the `next-async-request-api` codemod:

| File | Current pattern | Required pattern |
|---|---|---|
| `app/[slug]/page.js:31` | `generateMetadata({ params })` + `params.slug` | `generateMetadata({ params })` + `const { slug } = await params` |
| `app/[slug]/page.js:48` | `ProducerSlugPage({ params })` + `params.slug` | `await params` or codemod-generated pattern |
| `app/producer/[id]/page.js:16` | `generateMetadata({ params })` + `params.id` | `const { id } = await params` |
| `app/producer/[id]/page.js:33` | `ProducerPage({ params })` + `params.id` | `await params` |
| `app/p/[slug]/page.js:5` | `ProducerVanityRedirect({ params })` (sync fn) | Codemod wraps with `React.use(params)` |
| `app/group-buys/[id]/page.js:3` | `GroupBuyDetailPage({ params })` (sync fn) | Codemod wraps with `React.use(params)` |
| `app/producers/page.jsx:37` | `generateMetadata({ searchParams })` + `searchParams?.page` | `const { page } = await searchParams` |
| `app/producers/page.jsx:55` | `ProducersIndexPage({ searchParams })` + `searchParams?.page` | `await searchParams` |

The `next-async-request-api` codemod handles all 8 call sites automatically.

### #5 — next-pwa blocker

`next.config.js` structure:
```js
const withPWA = require("next-pwa")({...});  // ← outermost wrapper
...
let finalConfig = withPWA(nextConfig);        // ← wraps config
```
If `next-pwa@5.6.0` crashes on `require()` or on `withPWA(nextConfig)` with Next.js 16,
the entire `next.config.js` fails to load → `npm run build` exits 1 before any compilation.

**MEH-372 must ship before (or in the same PR as) the Phase B commit, OR** we can
temporarily disable the PWA wrapper:
```js
// Temporary — disable withPWA until MEH-372 resolves
let finalConfig = nextConfig; // withPWA(nextConfig);
```
This preserves the build at the cost of PWA functionality during the migration window.

---

## Codemod execution plan

### What's available

```
npx @next/codemod@latest upgrade          # interactive full-upgrade CLI (14→15→16)
npx @next/codemod@latest <transform> .    # individual transform
```

**Confirmed applicable codemods for Mehamakor:**

| Order | Codemod | Applies to | Files changed |
|---|---|---|---|
| C1 | `next-async-request-api` | 14→15 | `app/[slug]/page.js`, `app/producer/[id]/page.js`, `app/p/[slug]/page.js`, `app/group-buys/[id]/page.js`, `app/producers/page.jsx` |
| C2 | `metadata-to-viewport-export` | 14→15 | **SKIP** — viewport already separated in `app/layout.js:97` |

**Not applicable:**
- Any middleware/proxy codemod — no middleware.ts
- Any `revalidateTag` codemod — not used
- React 19 codemods — React 18 stays

### Recommended execution order (Phase B, one commit each)

```bash
# C1 — async params/searchParams (CRITICAL — apply first)
npx @next/codemod@latest next-async-request-api .
# Review diff, commit: "codemod(meh-370): next-async-request-api — async params/searchParams"

# C2 — ESLint migration (MUST-FIX — no codemod, manual)
# Create eslint.config.js, delete .eslintrc.json, update package.json lint script
# commit: "fix(meh-370): migrate .eslintrc.json → eslint.config.js (ESLint 9 flat config)"

# C3 — next-pwa disable/replace (coordinate with MEH-372)
# Either: upgrade next-pwa OR temporarily disable withPWA in next.config.js
# commit: "fix(meh-370): disable withPWA wrapper pending MEH-372 next-pwa upgrade"

# C4 — Turbopack disable (MUST-FIX — no codemod, manual)
# Add experimental: { turbopack: false } to nextConfig in next.config.js
# (Turbopack conflicts with withSentryConfig webpack plugin; revert after MEH-371)
# commit: "fix(meh-370): disable Turbopack to unblock build pending MEH-371 Sentry upgrade"
```

After C1+C2+C3+C4: run `npm run build` (Phase B step 4) to catch any remaining compile errors.

---

## Risk summary

| Risk | Likelihood | Before codemod | After codemod |
|---|---|---|---|
| Build fails due to `next-pwa@5.6.0` | HIGH | ❌ | Mitigated by disabling wrapper (C3) |
| Build fails: Turbopack + Sentry webpack conflict | CERTAIN | ❌ | Mitigated by disabling Turbopack (C4) |
| Runtime crash: params/searchParams not awaited | HIGH | ❌ pages throw | ✅ C1 codemod fixes |
| `npm run lint` fails (next lint removed) | CERTAIN | ❌ | ✅ C2 manual fix |
| Sentry not wrapping errors | MEDIUM | warning only | ❌ until MEH-371 |
| Node.js version mismatch on Railway | LOW | verify needed | verify needed |
