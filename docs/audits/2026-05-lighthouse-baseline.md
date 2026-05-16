# Lighthouse baseline — May 2026 (MEH-594, Sub 1/4)

> **Status:** template — to be filled in by Smadar.
> **Why empty:** the Claude Code sandbox cannot reach `*.vercel.app` or `mehamakor.online` (MEH-360 — envoy proxy egress block) AND has no Chromium runtime to execute Lighthouse locally. STOP condition (b) of MEH-594 fires.
>
> **How to fill in:**
> ```bash
> # mobile, throttled, headless — matches what Smadar's iPhone visitor sees
> npx lighthouse https://mehamakor.online/ --form-factor=mobile --output=json --output-path=tmp/home-mobile.json
> # then drop the four numeric scores into the table below
> ```
>
> Run on **production** (`mehamakor.online`) — preview URLs are warm + faster than the real site. The audit baseline should reflect real-visitor experience, not preview-perfect.

## Per-page scores

Run each URL twice and record the second run (first run primes Vercel's edge cache).

| Page | URL | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|---|
| Homepage | `https://mehamakor.online/he` | — | — | — | — |
| /map | `https://mehamakor.online/he/map` | — | — | — | — |
| /producer/[id] | `https://mehamakor.online/he/producer/{a-real-slug}` | — | — | — | — |
| /producers | `https://mehamakor.online/he/producers` | — | — | — | — |
| /register/producer | `https://mehamakor.online/he/register/producer` | — | — | — | — |
| /about | `https://mehamakor.online/he/about` | — | — | — | — |
| /settings | `https://mehamakor.online/he/settings` (login required) | — | — | — | — |

## What we know from code (inference, not measurement)

- **Homepage hero asset is Unsplash 1920×wide WebP** (`frontend/app/[locale]/home/HomeHero.jsx:11`). At zoom 8 on mobile this is the LCP candidate; performance score may sit in the 80s mobile because of it.
- **`HomepageMiniMap` is `dynamic({ ssr: false })` + lazy via IntersectionObserver** (`page.js:30-32`, `HomepageMiniMap.jsx:127-150`). Should NOT regress LCP — designed not to. Confirm post-MEH-538.
- **/map page SSRs 100 producers for SEO** (`frontend/app/[locale]/map/page.js:30-41`). The hidden HTML list adds DOM weight but is text-only — minimal performance impact. SEO score should be high.
- **/producers SSRs 24 producers per page** with `x-total-count` header + canonical/rel-prev/next (`frontend/app/[locale]/producers/page.jsx:34-46`). SEO score should be high (canonicals + paginated rel links present).
- **Header + footer translations via next-intl `useTranslations()`** server-side. No client hydration cost on copy.

## Comparison points worth measuring

Once the baseline is in:

1. **Before/after MEH-538** — re-run homepage once Smadar QAs the mini-map on mobile. If LCP / FCP regressed >5 points, raise as bug.
2. **/about vs /producers** — both are SSR text-heavy pages with similar shape; their Performance scores should be within ±3 of each other. If they differ by more, investigate.
3. **Mobile vs desktop on homepage** — `--form-factor=mobile` vs `--form-factor=desktop`. The desktop number is usually 10-20 points higher; the gap tells us how much the hero parallax is costing on mobile.

## Cross-reference

- Section 1 of `2026-05-homepage-discovery-audit.md` cites this file as the source for "Visual & performance — deferred".
- MEH-360 is the documented sandbox egress block; nothing to fix.
- MEH-538 PR #672 noted Lighthouse baseline was deferred — this is the same deferral, not new.
