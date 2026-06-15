# Internal Link / Route Integrity Audit — 2026-06-13

> Overnight batch #3 — Task 4. **Report only — no code changes.**
> Branch: `feature/audit-link-integrity`. Scope: every `<Link href>`,
> `router.push/replace`, and `redirect()` target in `frontend/app/**` +
> `frontend/components/**`, cross-referenced against the actual App-Router
> route tree under `frontend/app/[locale]/**`.
> Checks: **broken links · links to non-existent routes · post-login redirect
> contract · orphaned pages · soft-404 handling · hardcoded URLs that should
> use a route/SITE_URL helper.**

## TL;DR

Navigation is mostly sound — the nav chrome (Header, BottomNav, Footer) all
point at valid routes, and there's a proper `not-found.js` + `error.js` at the
locale root. But the audit found **two hard 404 links**, a **post-login redirect
param mismatch that silently drops the destination on 3 entry points**, a stale
`?tab=` admin pattern (4 sites), **two producer-facing share URLs hardcoded to
`mehamakor.online`**, four dynamic detail routes that **soft-404** (HTTP 200 +
noindex instead of `notFound()`), and **three orphaned routes** — one of which
(`/accessibility`) is an IS-5568 legal-compliance concern because it isn't
linked from the footer.

---

## A. Broken links → 404 — **HIGH**

| # | Source | Target | Why it 404s |
|---|---|---|---|
| A1 | `app/[locale]/map/page.js:76` — `<Link href={\`/producers/${p.slug}\`}>` | `/producers/<slug>` | Producer detail lives at **`/[slug]`** (root) or `/producer/[id]`. There is **no `/producers/[slug]` route** (only `producers/page.jsx`). Every other call site uses `/${slug}` (e.g. `ProducerCard`, sitemap `:66`). This link is the odd one out → 404. |
| A2 | `app/[locale]/settings/page.jsx:813` — `<Link href="/producer/edit">` | `/producer/edit` | No such route (`app/[locale]/producer/` has only `[id]/` and `dashboard/`), and no `next.config` rewrite maps it (`rewrites()` only covers `/api/:path*`). → 404. |

Both are static literal hrefs, so they are reproducible 100% of the time (not
data-dependent).

---

## B. Post-login redirect contract mismatch (`?next=` vs `?redirect=`) — **HIGH**

The login page reads **`?redirect=`**:
`app/[locale]/login/LoginClient.jsx:61` → `const redirectTo = params.get("redirect") || "/";`

But **3 call sites send `?next=`** instead — the param is silently ignored and
the user lands on `/` after login rather than the page they were gated from:

| Source | Sends | Intended destination |
|---|---|---|
| `app/[locale]/experiences/new/NewExperienceClient.jsx:78` | `/login?next=/experiences/new` | `/experiences/new` |
| `components/ProducerCard.jsx:122` | `/login?next=${nextPath}` | the producer the user was saving |
| `components/LoginPromptModal.jsx:81` | `/login?next=${nextPath}` | the gated action's page |

Only `app/[locale]/register/producer/RegisterProducerClient.jsx:373` uses the
correct `?redirect=`. **Fix direction:** standardize on one param name — either
make `LoginClient` also accept `next`, or change the 3 senders to `redirect`.
This is a real UX regression on the favorite-gate, experience-create gate, and
the generic login-prompt modal.

---

## C. Stale `/admin?tab=` pattern — **MEDIUM**

`/admin` (`app/[locale]/admin/page.js`) does **not** read `searchParams` / a
`tab` query (grep: 0 hits). Admin sections are now separate routes
(`/admin/producers`, …) per `admin/layout.js:40-54`. These 4 links pass a
`?tab=producers` that is ignored, landing the user on the admin **dashboard**
instead of the producers list:

| Source | Link |
|---|---|
| `app/[locale]/admin/producers/new/page.js:24` | `<Link href="/admin?tab=producers">` |
| `app/[locale]/admin/producers/[id]/edit/page.js:51` | `<Link href="/admin?tab=producers">` |
| `components/admin/ProducerForm.jsx:263` | `router.push("/admin?tab=producers")` |
| `components/admin/ProducerForm.jsx:711` | `router.push("/admin?tab=producers")` |

These resolve (no 404) but go to the **wrong destination**. **Fix direction:**
point them at `/admin/producers`.

---

## D. Hardcoded domain URLs (should use `SITE_URL`) — **MEDIUM**

| # | Source | Hardcoded value | Issue |
|---|---|---|---|
| D1 | `app/[locale]/producer/dashboard/page.js:16` | `\`https://mehamakor.online/p/${slug}\`` | Producer's own public-profile share URL is built with a hardcoded host. If production is `mehamakor.co.il` (`docs/DEPLOYMENT.md`), the producer is shown/sharing a **staging** URL. Should use `SITE_URL` from `lib/env`. |
| D2 | `app/[locale]/producer/dashboard/followers/page.js:43` | `\`https://mehamakor.online/p/${slug}\`` | Same hardcoded host for the profile URL shown on the followers page. |
| D3 | `app/[locale]/admin/help/page.jsx:183` | `https://mehamakor.online` | Informational external-link label in admin help — lower priority, but still drifts if the prod host changes. |

D1/D2 also bypass the `/p/[slug]` → `/{slug}` redirect indirection — they hardcode
both host **and** the `/p/` vanity prefix. Centralizing on `SITE_URL` +
`buildPageUrl` would fix host drift and prefix coupling in one move.

---

## E. Soft-404 on dynamic detail routes — **MEDIUM**

`/[slug]` and `/[slug]/recipes/[recipe_id]` correctly call `notFound()` (3 and 2
refs) when the entity is missing → real HTTP 404 + the locale `not-found.js`.
But these four detail routes call `notFound()` **0 times** — a missing id returns
**HTTP 200** with noindex metadata and a client-rendered empty/loading state:

| Route | notFound() refs | Behavior on missing entity |
|---|---|---|
| `app/[locale]/producer/[id]/page.js` | 0 | 200 + noindex meta (`:32`), no hard 404 |
| `app/[locale]/events/[id]/page.js` | 0 | renders `<EventDetailClient/>`; 200 + noindex (`:39`) |
| `app/[locale]/experiences/[id]/page.js` | 0 | 200 + noindex |
| `app/[locale]/group-buys/[id]/page.js` | 0 | 200 + noindex |

The noindex metadata mitigates the SEO half, but these are **soft-404s**:
inconsistent with `/[slug]`, no real not-found UX, and they return 200 to
monitors/crawlers. **Fix direction:** call `notFound()` in the missing-entity
branch so all detail routes behave like `/[slug]`.

---

## F. Orphaned routes (exist, not linked from any UI) — **MEDIUM / LOW**

| # | Route | Refs (excl. own page) | Note |
|---|---|---|---|
| F1 | `/accessibility` | **0** internal links | **IS-5568 concern.** Israeli accessibility law expects the accessibility statement to be reachable (conventionally a footer link). `Footer.jsx:69-71,229-230` links about/process/for-businesses/terms/privacy but **not** `/accessibility`. The page exists and is indexable but unreachable in-app. |
| F2 | `/upgrade` | **0** | Producer upgrade page — no entry point found (only its own page + a layout comment). Either dead or missing a CTA. |
| F3 | `/messages` | **0** | Full SEO metadata but no nav/icon/link points to it. Orphaned (also flagged in the SEO audit: indexable but unlinked). |

Routes intentionally reached only via external/tokenized links are **not**
counted as orphans here (`/rate/[token]`, `/ref/[code]`, `/verify-email`,
`/reset-password`).

---

## G. Dev-only page linked from production chrome — **LOW**

`/dev/components` is referenced by **2** internal `href`s (a component gallery /
style guide). It has no `noindex` and is reachable in production. **Fix
direction:** gate the links behind a dev flag, or remove them + `noindex` the page.

---

## Top 20 (prioritized)

| # | Pri | Finding | Evidence (file:line) |
|---|---|---|---|
| 1 | HIGH | Broken link → `/producers/<slug>` (no such route; should be `/<slug>`) | `map/page.js:76` |
| 2 | HIGH | Broken link → `/producer/edit` (no such route) | `settings/page.jsx:813` |
| 3 | HIGH | Post-login `?next=` dropped (login reads `?redirect=`) — experiences gate | `NewExperienceClient.jsx:78` ↔ `LoginClient.jsx:61` |
| 4 | HIGH | Post-login `?next=` dropped — favorite gate | `ProducerCard.jsx:122` ↔ `LoginClient.jsx:61` |
| 5 | HIGH | Post-login `?next=` dropped — generic login modal | `LoginPromptModal.jsx:81` ↔ `LoginClient.jsx:61` |
| 6 | MED | `/admin?tab=producers` ignored → lands on dashboard | `ProducerForm.jsx:263` |
| 7 | MED | `/admin?tab=producers` ignored | `ProducerForm.jsx:711` |
| 8 | MED | `/admin?tab=producers` ignored | `admin/producers/new/page.js:24` |
| 9 | MED | `/admin?tab=producers` ignored | `admin/producers/[id]/edit/page.js:51` |
| 10 | MED | Producer share URL hardcoded to `mehamakor.online` | `producer/dashboard/page.js:16` |
| 11 | MED | Profile URL hardcoded to `mehamakor.online` | `producer/dashboard/followers/page.js:43` |
| 12 | MED | Soft-404: `/producer/[id]` never calls `notFound()` | `producer/[id]/page.js` |
| 13 | MED | Soft-404: `/events/[id]` never calls `notFound()` | `events/[id]/page.js` |
| 14 | MED | Soft-404: `/experiences/[id]` never calls `notFound()` | `experiences/[id]/page.js` |
| 15 | MED | Soft-404: `/group-buys/[id]` never calls `notFound()` | `group-buys/[id]/page.js` |
| 16 | MED | `/accessibility` orphaned + not in footer (IS-5568) | `Footer.jsx:69-71,229-230` |
| 17 | LOW | `/upgrade` orphaned (no entry point) | `upgrade/` (0 inbound links) |
| 18 | LOW | `/messages` orphaned (no nav link) | `messages/` (0 inbound links) |
| 19 | LOW | `/dev/components` linked from production | (2 inbound `href`s) |
| 20 | LOW | `admin/help` hardcodes `mehamakor.online` external label | `admin/help/page.jsx:183` |

---

## What's working well (no action)

- **Nav chrome targets are all valid:** `BottomNav.jsx:58-60` (`/`, `/map`,
  `/about`), `Footer.jsx` (about/process/for-businesses/terms/privacy/
  register-producer), Header nav.
- **`/p/[slug]` → `/{slug}` redirect** keeps the vanity prefix from creating a
  duplicate route (`p/[slug]/page.js`).
- **Locale `not-found.js` + `error.js` exist** (`app/[locale]/not-found.js`,
  `error.js`) — the hard-404 path renders a proper page where it's triggered.
- **Producer/recipe detail correctly hard-404** via `notFound()` (`[slug]:3 refs`,
  `[slug]/recipes/[recipe_id]:2 refs`).
- **Dynamic template hrefs are otherwise correct:** `/${slug}`,
  `/events/${id}`, `/experiences/${id}`, `/group-buys/${id}`,
  `/admin/producers/${id}/edit`, `/about/for-businesses/guides/${slug}`.

---

_Audit method: static cross-reference of all `href`/`router.push`/`router.replace`/
`redirect()` targets against the `app/[locale]/**` route tree. API calls
(`api.get('/producers/${id}')` etc.) were excluded — they hit the backend
namespace, not the frontend router. No runtime crawl (sandbox cannot reach the
Vercel preview — MEH-360); confirm the 404s against a live preview before fixing._
