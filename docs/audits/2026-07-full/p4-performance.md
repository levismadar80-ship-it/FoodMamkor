# P4/8 — Performance: Core Web Vitals · bundle · Cloudinary · async queries

> Pass 4 of the **MEH-1721** audit epic. **Read-only** — this report maps
> bottlenecks; it fixes none. Mobile-first, matching the audience.
> Every route-touching finding carries a **mount status** (epic §2.7).

---

## 1 · Snapshot

| | |
|---|---|
| **Baseline SHA** | `114e4c847617495a71058e180007797dfc83533f` — pinned by the epic |
| **Audited tree** | `origin/staging` @ `5aa959ce` |
| **`frontend/` drift vs baseline** | 22 files, +1,317 / −54 — this pass describes **staging**, not the baseline |
| **Build** | `npm ci` + `npm run build` **both ran here, exit 0** — 123 static pages generated |
| **Client JS emitted** | 111 chunks · **4.9 MB raw** · **1,326 KB gzipped** |
| **Route handlers (backend)** | 189 — 177 `def`, 12 `async def` |

Unlike P1/P3, the frontend **has** drifted from the pinned baseline, so the
numbers below are current-staging numbers. Stated up front because a bundle
size is only meaningful with a commit attached.

### Measured here vs. not measured

This pass got further than P0 did: `npm ci` and `next build` **actually ran**,
so bundle figures are real output, not estimates. What is still missing:

- **No Lighthouse, no field CWV.** LCP / CLS / INP were **not measured**. A real
  run needs a served build talking to a live backend, and `*.up.railway.app` is
  blocked from the CC sandbox. Everything below about CLS and INP is a
  **structural** read of the code, not a score.
- **No per-route First Load JS.** Next 16's build output prints the route table
  **without size columns** here, so the usual per-route First-Load-JS figure
  does not exist in this log. I measured the emitted chunks directly instead —
  which gives a real total and real per-chunk sizes, but **not** a per-route
  attribution.
- **No chunk→package attribution.** Greps for package names inside minified
  chunks returned 0–1 hits each, which is not evidence. Rather than name a
  library as "the big one" on that basis, the chunk table below is reported
  by size only.

---

## 2 · Findings summary

| ID | Sev | Finding | Mount | Fix | Tier |
|---|---|---|---|---|---|
| F-1 | 🟡 Med | 25 live GET list endpoints with no `LIMIT` | mounted | S–M | 🟡 |
| F-2 | 🟡 Low | `ExperienceDetailClient.jsx:100` — hero-sized image bypasses the Cloudinary helper | mounted | S | 🟢 |
| F-3 | ⚪ Info | `ProductsSection.jsx:454` — 48px image bypasses the helper (next/image still optimizes) | mounted | S | 🟢 |
| F-4 | ⚪ Info | 187 of 256 app/component files are client components | — | L | 🟡 |
| F-5 | ⚪ Info | 7 `async def` handlers make sync DB calls — residual only, the expensive part is already offloaded | mounted | S | 🟢 |

**0 critical, 0 high.** The reason is §3: the things that usually dominate a
mobile perf audit on a map-heavy site — Leaflet in the initial bundle,
un-transformed Cloudinary images, missing `sizes`, un-reserved map height —
are **already handled here**, deliberately and with tickets attached.

**No STOP condition (a) triggered** — nothing surfaced an architectural root
that needs escalation to Opus. The findings are point bottlenecks.

---

## 3 · Already handled (measured, not assumed)

Stating these explicitly, because a findings list alone would misrepresent the
codebase as worse than it is.

**Leaflet is never in the initial bundle.** Every map surface is
`dynamic(..., { ssr: false })`: `HomepageMiniMap` (`app/[locale]/page.js:31`,
with a `loading` skeleton), `MapComponent` (`map/components/MapPane.jsx:35`),
and `MiniMap` on producer / event / experience detail. `ChatWidget` is lazy too
(`ChatWidgetLazy.jsx:15`). 9 `dynamic()` call sites in total.

**Map containers reserve their height**, so the largest layout-shift risk on the
site is closed: `MapClient.jsx:453` and `:530` set explicit
`calc(100vh - …)` / `calc(100dvh - …)` heights on the desktop and mobile shells.

**Every `fill` image declares `sizes`.** 23 `<Image>` tags across `app/` +
`components/`; **0** use `fill` without `sizes`. That is the responsive-srcset
gap, and it is absent.

**Cloudinary transforms go through one helper.** `lib/cloudinary.js`
`optimizeCloudinary()` injects `f_auto,q_auto` (so images ship WebP/AVIF), is
idempotent (`cloudinary.js:26` skips URLs already carrying a transform), and is
imported by **22** files. `ImageWithFallback` (`:29`) routes through it too, so
components using that wrapper are covered without calling the helper themselves.

**The 4 raw `<img>` avatar tags are correct, not an oversight.** `settings/page.jsx:293`,
`BottomNav.jsx:354`, `AccountSheet.jsx:108`, `Header.jsx:546` all render
`user.avatar_url` — an OAuth avatar on `googleusercontent.com`, which is
**not** in `next.config.js` `remotePatterns` (only `res.cloudinary.com` and
`images.unsplash.com` are). `next/image` would throw on those hosts. Each tag
carries fixed CSS dimensions (`w-16 h-16`, `w-full h-full`), so the box is
reserved and there is no CLS. The fifth raw `<img>`
(`MapComponent.jsx:154`) is inside a Leaflet popup **HTML string**, where a
React component is not an option — and it already sets `loading="lazy"` and
escapes the alt text.

**Password hashing is already off the event loop** — see F-5.

---

## 4 · Bundle

`npm run build` → exit 0, 123 static pages, 111 client chunks.

| | |
|---|---|
| Total client JS, raw | **4.9 MB** |
| Total client JS, gzipped | **1,326 KB** |
| Largest single chunk | **335.9 KB** raw |

Ten largest chunks (raw KB): 335.9 · 335.9 · 276.8 · 226.3 · 217.5 · 135.0 ·
120.2 · 113.5 · 110.0 · 99.4.

**This total is not what any one visitor downloads** — it is everything emitted
across 70+ routes, and route-level code splitting means a given page pulls a
small subset. Without per-route First Load JS (§1) this pass **cannot** say what
the home route actually costs a phone, and it would be wrong to imply 1.3 MB
lands on first paint. Treat the figure as an inventory total.

Two configured optimizations are present and worth recording:
`optimizePackageImports: ["@phosphor-icons/react", "framer-motion"]`
(`next.config.js:107`) — Phosphor is not in Next's default optimize list and
~89 files import from it, so this is load-bearing.

### F-4 ⚪ Info — 187 of 256 files are client components

73% of files under `app/` + `components/` carry `"use client"`. In an App Router
codebase that is high, and it is the structural reason the client bundle is the
size it is: a client component and everything it imports ship to the browser.

**Deliberately Info, not a finding with a number attached.** Many of these are
genuinely interactive (forms, filter sheets, the map, dashboards) and belong on
the client. Establishing which could become server components is a per-file
judgment across ~187 files — real work, but *triage* work, and the
over-engineering guard is explicit that a pass should not propose a restructure.
Fix size **L**, and it should be scoped from measured per-route cost, which this
pass does not have.

---

## 5 · Images

### F-2 🟡 Low — `ExperienceDetailClient.jsx:100`, hero-sized image bypasses the helper

```jsx
app/[locale]/experiences/[id]/ExperienceDetailClient.jsx:98-100
<div className="h-[360px] bg-cover bg-center"
     style={{ backgroundImage: `url(${ex.image_url})` }}
```

A **360px-tall, full-width** image, rendered from the raw Cloudinary URL: no
`f_auto` (so no WebP/AVIF), no `q_auto`, no width cap. Because it is a CSS
`background-image`, `next/image` cannot compensate either — this one is
un-optimized end to end, and it is the LCP element of the page it sits on.

**Mount status: mounted.** The `experiences` router is mounted
(`router_registry.py`, AST-verified), so the route is reachable.

This is precisely the class MEH-1229 swept — `ProducerSections.jsx:345` and
`RecipeDetail.jsx:167` both carry comments recording that they *were* raw
`<Image src={…}>` bypassing the helper and are now routed through
`ImageWithFallback`. This site was missed, most likely because it is a
`backgroundImage` rather than an `<Image>`, so an `<Image>`-shaped grep would
not find it.

**Fix S:** wrap in `optimizeCloudinary(ex.image_url, { aspectRatio: IMAGE_RATIOS.banner, width: 1280 })` —
`EventDetailClient.jsx:86` already does exactly this for the same shape of
element and is the working precedent. 🟢 GREEN.

### F-3 ⚪ Info — `ProductsSection.jsx:454`

```jsx
<Image src={product.image_url} alt={product.name} fill className="object-cover" sizes="48px" />
```

Raw Cloudinary URL, no helper. Lower consequence than F-2 on both counts: it is
a **48px** thumbnail, and it goes through `next/image`, which resizes and
re-encodes it via `/_next/image`. What is lost is Cloudinary doing that work at
the CDN edge instead of the Next server. `sizes` is correctly declared.

**Mount status: mounted.** **Fix S**, 🟢 GREEN.

---

## 6 · Backend

### F-1 🟡 Med — 25 live GET list endpoints with no `LIMIT`

An AST sweep of `app/routers/` found **27** `GET` handlers that call `.all()`
without any `.limit()` in the same function. Two are on **unmounted** routers
and are therefore **latent, not live** (§7):

| Latent (not reachable) | Router status |
|---|---|
| `home_products.py:167 list_home_products` | `home_products` **not mounted** |
| `producer_follows.py:94 list_my_following` | `producer_follows` **not mounted** |

The remaining **25 are live**. The public ones matter most, since their result
set grows with the catalog and the caller is a phone:

| Endpoint | | Bounded by |
|---|---|---|
| `events.py:73` | `list_events` | every active event |
| `experiences.py:116` | `list_experiences` | every experience |
| `producer_recipes.py:352` | `list_public_recipes` | every published recipe |
| `reviews.py:181` | `list_reviews` | every review on a producer |
| `group_buys.py:62` | `list_group_buys` | every open group buy |
| `favorites.py:17` | `get_favorites` | one user's favorites |
| `producer_me.py:1118 / :1295` | `list_my_products` / `list_my_locations` | one producer's catalog |

The rest are admin surfaces (`admin.py:110` `list_producers`, `admin.py:452`
`pending_producers`, `admin_recipes`, `admin_outreach`, `admin_whatsapp`,
`reviews.py:402`, `group_buys.py:286`, …) — same unbounded-by-data property,
smaller blast radius. `producers.py:433 list_categories` is bounded by the
category table and is not a concern.

**Med, not High, and the reason is honest:** at today's row counts every one of
these returns a small list. The defect is that **nothing caps them** — response
size grows linearly with the table, on the mobile-first surface, with no ceiling
in the code. That is a latent cliff rather than a current regression, and
without row counts (same limitation as P3 §8) this pass cannot say how close the
cliff is.

**Note the contrast:** the main producer listing (`producer_listing.py`) *is*
paginated and has a dedicated count query. The pagination discipline exists in
this codebase; it just has not reached these 25.

**Fix S** per endpoint (`limit`/`offset` params + a cap), **M** as a batch —
each is an API-shape change the frontend must consume. 🟡 YELLOW.

### F-5 ⚪ Info — 7 `async def` handlers make sync DB calls

Of 189 route handlers, **177 are plain `def`** — which is the *correct* pairing
with synchronous SQLAlchemy, since FastAPI runs `def` handlers in a threadpool
and the event loop is never blocked. Only 12 are `async def`, and 7 of those
touch a sync `Session`:

```
auth.py:264   register            auth.py:404  register_producer
auth.py:1217  reset_password      users_me.py:114 change_password
upload.py:66  upload_image        upload.py:148 upload_avatar
upload.py:222 upload_owner_photo
```

**The expensive part is already fixed, and this is the honest headline.** The
detector flags these as "blocking async handlers", which in most codebases means
bcrypt on the event loop — ~50–200 ms per call at `bcrypt__rounds=12`
(`auth.py:23`), stalling every concurrent request. **MEH-306 already handled
it**: `auth.py:298`, `auth.py:1245`, `users_me.py:144` and `:159` all wrap the
hash/verify in `await asyncio.to_thread(...)`, with comments explaining why.

What remains on the event loop is the SQLAlchemy round-trip itself
(`db.add` / `db.commit` / `db.query`) — single-digit milliseconds against a
local Postgres. Real, but small, and on low-frequency endpoints
(register, password change, upload).

**Recorded as Info rather than a finding** because reporting it at face value
would have overstated it by two orders of magnitude. **Fix S** if ever wanted
(drop `async`, or offload the DB call the same way), 🟢 GREEN.

---

## 7 · Mount check (epic §2.7) — and a near-miss worth recording

Two routers exist on disk with route decorators but are **not mounted**:

| Router | Evidence |
|---|---|
| `home_products` | `router_registry.py:89` — `# app.include_router(home_products.router)`, commented out per the MEH-1406 brand LOCK |
| `producer_follows` | no `include_router` reference at all |

Any finding on their routes is **latent** and, per §2.7, never High — a
decorator proves the route exists, not that it is reachable.

> **The first mount check this pass ran was wrong, and it failed in the exact
> direction §2.7 exists to prevent.** A regex for `(\w+)\.router` over
> `router_registry.py` reported `home_products` as **mounted** — because it
> matched the **commented-out** line 89 and the explanatory comments at 55/59/69.
> Had that stood, `list_home_products` would have been reported as a live
> unpaginated endpoint, i.e. mount blindness reintroduced inside the pass whose
> ticket cites MEH-1743 as its source.
>
> The correct method is an **AST walk**, which discards comments by
> construction: parse `router_registry.py`, collect `include_router(x.router)`
> call arguments. That returns 32 mounted of 34 on disk, and is what §6 uses.
> Recording it because "grep the registry" is the obvious approach and it
> silently produces a false positive on precisely the router the epic warns about.

---

## 8 · Not measured

- **Lighthouse / Core Web Vitals — LCP, CLS, INP.** No score was produced. A run
  needs a served build plus a reachable backend; Railway egress is blocked from
  the CC sandbox. §3's CLS statements are structural (reserved heights, `sizes`
  present), **not** a measured CLS value. INP was not assessed at all beyond the
  client-component count in F-4.
- **Per-route First Load JS.** Next 16's route table printed without size
  columns; §4 substitutes directly-measured chunk sizes, which do not attribute
  to routes.
- **Chunk → package attribution.** Deliberately not claimed (§1).
- **Actual image weights.** No Cloudinary asset was fetched; F-2's severity rests
  on the transform being absent, not on a measured byte count.
- **Server-side response times.** No endpoint was timed. F-1 rests on the absence
  of a `LIMIT`, not on an observed slow response.
- **Backend `frontend/` drift is real (22 files).** Anything merged after
  `5aa959ce` is outside this snapshot.

---

## 9 · Appendix — commands and raw results

### Build

```
$ npm ci && npm run build
✓ Generating static pages using 3 workers (123/123) in 1108ms
EXIT=0

$ du -sh .next/static/chunks            →  4.9M
$ find .next/static/chunks -name '*.js' | wc -l   →  111
$ cat all chunks | gzip -c | wc -c      →  1326 KB gzipped

10 largest chunks (raw KB):
 335.9  335.9  276.8  226.3  217.5  135.0  120.2  113.5  110.0  99.4
```

### Frontend inventory

```
next/image importing files:                18
files containing a raw <img>:               5   (4 OAuth avatars + 1 Leaflet popup)
<Image> tags:                              23
<Image fill> without sizes:                 0
dynamic() call sites:                       9
files with "use client":                  187  of 256
prod dependencies: 19        devDependencies: 25
optimizeCloudinary importers:              22
```

### Backend

```
route handlers:        189   (177 def · 12 async def)
async handlers making sync DB calls:  7
GET handlers with .all() and no .limit():  27   → 2 latent (unmounted), 25 live

$ python3 -c "ast walk of router_registry.py include_router(x.router)"
mounted: 32    on disk: 34
NOT MOUNTED: ['home_products', 'producer_follows']
```

### Baseline drift

```
$ git diff --stat 114e4c84..origin/staging -- frontend/
 22 files changed, 1317 insertions(+), 54 deletions(-)
```
