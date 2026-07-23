# MEH-1074 Wave 3 — 375px walkthrough: demo business, customer + producer journeys

**Date:** 2026-07-11 · **Viewport:** 375×667 · **Stack:** local `next start` + uvicorn + Postgres 16, seeded via `backend/seed_data.py` + `backend/scripts/seed_demo_business.py` (PR #1597) · **Screenshots:** `qa-artifacts/MEH-1074-wave3/` · **Raw step log:** `walkthrough-findings.json`

> Every verdict below is from an executed browser step against the seeded demo business (מאפיית רוח השדה, `/ruach-hasadeh`), not code-reading. Sandbox-environment failures are separated from product findings — see the appendix; they do NOT reproduce on CI runners (E2E suite green on the same commits) or Vercel.

## Customer journey — verdicts

| # | Step | Verdict | Evidence |
|---|---|---|---|
| 1 | Home load + categories | PASS | `customer/01,02` |
| 2 | /producers list + card grid | PASS (flaky first-load in sandbox only — appendix) | `customer/14` shows rendered grid |
| 3 | Demo producer page — full profile | PASS: breadcrumb, gallery (1/3), badges מאומתת + רישיון יצרן + חדש + ללא גלוטן + משלוח, tabs אודות/מוצרים/משלוח/ביקורות, 4 products with ₪ ranges, delivery cities, contact block | `customer/05` fullpage |
| 4 | Trust strip (MEH-1048) | PASS: "✅ עסק מאומת · 4.7 · 3 ביקורות" + excerpt + "מעבר לכל הביקורות" | `customer/38` |
| 5 | Reviews list + owner reply (MEH-1039) | PASS: full list renders, owner reply to רות כ. present (`תודה רבה רות…`) | `customer/39` fullpage; probe: `owner reply visible: true` |
| 6 | WhatsApp CTA | PASS: opens `web.whatsapp.com/send?phone=972500000001&text=היי! מצאתי אותך במהמקור — מאפיית רוח השדה` | `customer/07` (target URL in shot) |
| 7 | Recipe card → recipe detail | PASS | `customer/08,09` |
| 8 | Events list → demo event detail | PASS | `customer/10,11` |
| 9 | /map · /search?q=מחמצת | PASS | `customer/12,13` |
| 10 | Favorites gate (logged out → login redirect) | PASS | `customer/14` |
| 11 | Consumer registration (form validation, terms gate, HIBP check, submit) | PASS — submit enabled only after name+email+password+terms, real POST | `customer/15,16` |
| 12 | Write review (logged in) | PARTIAL: login-gated CTA "התחברו כדי לכתוב ביקורת" verified (`customer/38`); form-fill automation not completed (harness) |

## Producer journey — verdicts

| # | Step | Verdict | Evidence |
|---|---|---|---|
| 1 | Register wizard, 5 frames (MEH-866/994/984/952) — real POST | PASS: preflight → ACCOUNT → DETAILS → CATEGORY (license gate inline) → STORY (declarations) → CONFIRM | `producer/19–23` |
| 2 | Admin approval via real /admin/producers UI | PASS | `producer/24,25` |
| 3 | Owner login (demo owner) | PASS — required the `email_verified` seed fix (found by this walkthrough, shipped in #1597) | `producer/26` |
| 4 | Dashboard overview: greeting, availability control (פתוח להזמנות/זמין היום/עמוס השבוע/בהפסקה), profile-strength "הפרופיל מלא", KPIs (rating 4.7 · 3 ביקורות, WhatsApp clicks, views) | PASS | `producer/27,28` |
| 5 | Availability → בהפסקה toggle (MEH-291 state machine) | PASS | `producer/44,45` |
| 6 | Recipes list + new-recipe form | PASS | `producer/32,33` |
| 7 | New-event form | PASS | `producer/34` |
| 8 | Insights | PASS | `producer/36,37` |
| 9 | Edit tab (products/categories/images/location cards) | NOT VERIFIABLE IN SANDBOX (async chunk 404 — appendix). Renders on real infra: MEH-1100 runner QA screenshots (`qa-artifacts/MEH-1100/`, merged today) + CI E2E green |

## Product findings (tickets filed)

1. **Dashboard conversion stat can exceed 100%** — "133.3% מהצופות פנו אלייך" rendered with 3 views / 4 WhatsApp contacts. Contacts aren't a subset of views (map/card CTAs count without a page view), so the ratio needs a cap or a different denominator/wording. Evidence: `producer/27`. → ticket filed (cross-ref MEH-1089 dashboard UX matrix).
2. **4 stray page exports violate the Next.js Page contract** — `isSlugShaped` (`app/[locale]/[slug]/page.js:31`, exported for `SlugPageBotHardening.test.jsx`) and `CategoriesCard`/`ImagesCard`/`LocationCard` (`app/[locale]/producer/dashboard/edit/page.js`). Turbopack builds don't enforce the check; `next build --webpack` hard-fails type validation on them. Latent portability bug + contract violation. → ticket filed.

## Appendix — sandbox-environment failures (NOT product)

Recorded so future sessions don't re-diagnose (pairs with the MEH-360 Railway-egress note):

- **Turbopack builds in the CC sandbox emit HTML referencing chunks that are never written** (deterministic across rebuilds; e.g. `2b3ipbflwfndy.js`). Webpack builds mostly work but **`next start` 404s some async chunks that exist on disk** (`0vm75vyvwy1vj.js`, edit tab) — pages depending on them hang on skeletons/error boundary. CI runners are unaffected.
- **Never rebuild `.next` under a live `next start`** — in-memory manifests desync from disk → RSC "React Client Manifest" errors + text/plain chunks. Kill via `fuser -k 3000/tcp` (plain `pkill` patterns kill the caller's own command group, exit 144).
- **Egress proxy**: intermittently swallows browser fetches to `127.0.0.1:8000` (pages stuck on skeletons) — launch Playwright with `proxy: { server: HTTPS_PROXY, bypass: "127.0.0.1,localhost" }`. Full `--no-proxy-server` is worse: external requests (GSI/fonts/telemetry) hang instead of failing fast and stall hydration waits. `res.cloudinary.com` is proxy-blocked → next/image 500s + broken photos, local only.
- **Stale `node_modules` vs #1532's 18-package bump** reproduced the same symptoms until `npm ci`.
- Harness selector notes: reviewer names render abbreviated ("רות כ." not "רות כהן"); reviews live behind the ביקורות tab → "מעבר לכל הביקורות"; consumer register submit gates on the terms checkbox + HIBP debounce; cookie banner intercepts low-page clicks — accept it first.
