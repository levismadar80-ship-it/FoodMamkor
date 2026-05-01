# MEH-407 — Phase 1 Refactor Plan

> **Status:** Phase 1 — analysis only. Zero code changes in this PR.
> Phase 2 (split + extract) waits for explicit `go` from Smadar after
> review of this document.
> **Branch:** `feature/meh-407-refactor-plan` off `staging`.

---

## Path verification (run before analysis)

The original task brief listed four files. Two paths did not exist as
written; the table below shows what was specified vs. what actually
lives in the repo. Analysis below follows the **actual** paths.

| Brief said | Actual path | Status |
|---|---|---|
| `frontend/components/MapClient.*` | `frontend/app/map/MapClient.jsx` | Renamed in tree |
| `frontend/app/producers/[slug]/page.js` | `frontend/app/producer/[id]/page.js` | Different segment + dynamic param (`id`, not `slug`) |
| `backend/app/main.py` | `backend/app/main.py` | OK |
| `ProducerDetail` component | `frontend/app/producer/[id]/ProducerDetail.jsx` | OK |

**Important finding on file #3:** `producer/[id]/page.js` is **42
lines** — a thin Next.js server-component wrapper that fetches the
producer, emits SEO metadata + JSON-LD, and renders `<ProducerDetail/>`.
It is **not a god file**. The actual god file paired with it is
`ProducerDetail.jsx` (900 lines, analyzed below). The brief appears to
have counted these as one logical unit; this plan analyzes the page
wrapper briefly and the detail component in depth.

---

## File 1 — `frontend/app/map/MapClient.jsx`

### a) Size

- **885 lines** (`MapClient.jsx:1-884`).
- One default-exported function component (`MapPage`,
  `MapClient.jsx:38`).
- ~20 `useState` calls + 4 `useRef` + ~14 `useCallback` / `useMemo`
  blocks + 6 `useEffect` blocks all inside that single component.
- No helper functions extracted to module scope; everything is closed
  over component state.

### b) Distinct responsibilities (file:line evidence)

1. **Filter / chip state machine** — `MapClient.jsx:67-76` (chip state
   default), `:232-236` (`buildParams`), `:238-260` (chip click
   handlers), `:262-296` (city picker + reset), `:458-473`
   (`toggleCategory`, `isCategoryActive`), `:476-500`
   (`filteredByCategory`, `visibleProducers`), `:514-524`
   (`activeFilterTags`).

2. **Map ↔ list data sync (bounds, hover, focus)** —
   `MapClient.jsx:104-127` (`registerMapApi` + ref dual-pane guard),
   `:298-300` (`handleBoundsChange`), `:303-311` (`handleCardClick`),
   `:315-324` (`handleMarkerClick`), `:327-346` (hover sync, debounce),
   `:352-358` (`handleMapMove`), `:360-363` (`handleMapCanvasClick`),
   `:371-428` (`handleSearchThisArea` — bounds validation + Zod +
   refetch).

3. **API data fetching** — `MapClient.jsx:129-133` (initial categories
   + producers), `:217-227` (`loadProducers`), `:423-426` (geo
   refetch). Three call sites for `/producers` GET that all bypass any
   shared hook.

4. **Geolocation + onboarding side-effects** — `MapClient.jsx:135-154`
   (first-visit hint w/ sessionStorage + 3 timers), `:162-169`
   (location modal trigger), `:185-193` (body class for sheet open),
   `:196-215` (deep-link from `/producer/:id` via sessionStorage),
   `:430-455` (`handleGpsClick`).

5. **Layout shell — desktop split-pane** — `MapClient.jsx:740-785`.
   Hard-codes the grid template, sort `<select>`, list-pane chrome,
   and overlay positioning of `desktopMiniPopup`.

6. **Layout shell — mobile sheet + city picker overlay** —
   `MapClient.jsx:787-874`. Sticky filter bar, `MapBottomSheet`,
   pinned-selected-card markup, city picker modal.

7. **Inline UI fragments built as JSX expressions inside the
   component** — `filterChipsBar` (`:527-574`), `mapPane`
   (`:577-664`), `cardList` (`:667-706`), `desktopMiniPopup`
   (`:709-738`). These are de-facto subcomponents that re-render on
   every parent state change because they live in the same closure.

### c) Proposed split

| New module | Moves out | What lives there |
|---|---|---|
| `app/map/state/useMapFilters.js` | resp. (1) | chip state, `buildParams`, `chipStateToParams` glue, derived `activeFilterTags`, `visibleCategoryChips`, `filteredByCategory`, `visibleProducers` |
| `app/map/state/useMapSync.js` | resp. (2) | `mapApiRef` / `mapRef`, `registerMapApi`, marker/card click + hover handlers, `handleSearchThisArea`, `handleBoundsChange` |
| `app/map/state/useProducersFeed.js` | resp. (3) | `allProducers`, `categories`, `loadProducers`, error toast |
| `app/map/state/useFirstVisitHints.js` | resp. (4) | onboarding hint timers, location modal trigger, focusProducer deep-link, body class effect, GPS click |
| `app/map/components/FilterChipsBar.jsx` | resp. (7a) | extract `filterChipsBar` JSX |
| `app/map/components/MapPane.jsx` | resp. (7b) | extract `mapPane` (incl. legend, hint, GPS button, "search this area" button, empty-state card) |
| `app/map/components/MapCardList.jsx` | resp. (7c) | extract `cardList` |
| `app/map/components/DesktopMiniPopup.jsx` | resp. (7d) | extract `desktopMiniPopup` |
| `app/map/components/CityPickerModal.jsx` | bottom of resp. (6) | extract showCityPicker overlay |
| `app/map/MapClient.jsx` (post-split) | resp. (5)+(6) shell only | compose hooks, render `<DesktopLayout/>` and `<MobileLayout/>` shells; aim < 250 lines |

Notes on the split:
- Hooks (`use*`) own state + effects; components stay presentational
  so render frequency is bounded by props they actually need.
- The ref-juggling between desktop + mobile `<MapComponent/>`
  instances (`MapClient.jsx:104-127`) is the hardest invariant to
  preserve — it must move into `useMapSync` intact, with the
  `boundsAreValid` guard from `:386-393` carried verbatim.
- Z-index tokens and the `// rtl-ok` annotations on overlay buttons
  must travel with the JSX they belong to (per
  `.claude/rules/rtl.md`).

### d) Risk score: **5 / 5** (highest)

- Listed as a central component
  (`.claude/central-components.json` per [docs/CENTRAL_COMPONENTS.md]).
- Two `<MapComponent/>` instances + a hidden one — moving the dual-ref
  reconciliation is one bad commit away from regressing the "search
  this area" button silently (the bounds become 0×0 and Zod rejects).
- Closures over chip state + categories appear in `loadProducers`,
  `handleSearchThisArea`, `buildParams`, and the filter-tag remover —
  splitting these into hooks risks stale-closure bugs unless the deps
  array on `handleSearchThisArea` (`:428`) is preserved.
- Touching `/map` requires a Zod-before-API audit per workflow rule
  19, plus mobile preview per regression rule 4.

### e) Recommended order: **4th (last)** — see ordering table below.

---

## File 2 — `frontend/app/producer/[id]/ProducerDetail.jsx`

### a) Size

- **900 lines** (`ProducerDetail.jsx:1-900`).
- One default export (`ProducerDetail`, `:45`).
- ~9 `useState`, 5 `useRef`, ~8 `useEffect`, 2 `useCallback`.
- Renders ~17 distinct sections + a sticky sidebar + a sticky mobile
  contact bar — all in one component.

### b) Distinct responsibilities (file:line evidence)

1. **Producer fetch + initial-state hydration** —
   `ProducerDetail.jsx:45-50` (props + state), `:90-98` (fetch effect
   gated on `initialProducer`). Loading + 404 fallbacks
   `:160-174`.

2. **Analytics / tracking** — `ProducerDetail.jsx:63-78`
   (`trackContactClick`), inline beacons at `:439-443`, `:720-725`,
   `:870-879`. Three near-identical WhatsApp beacon blocks pasted
   inline in JSX.

3. **Section-scroll + tab-bar state** —
   `ProducerDetail.jsx:51-56` (refs), `:80-88` (`scrollToSection`),
   `:101-110` (StickyContactBar IntersectionObserver), `:114-128`
   (lazy-reviews IntersectionObserver), `:247-274` (mobile tab-bar
   JSX).

4. **Side-effect business logic** —
   `ProducerDetail.jsx:133-136` (push recently-viewed),
   `:138-144` (events fetch), `:147-158` (similar producers fetch).
   Three independent effects each calling `api.get`.

5. **Display-only formatters** —
   `ProducerDetail.jsx:176-179` (`shareUrl`), `:181-191`
   (`vacationReturnLabel`, `isVacation`), `:193-195`
   (`producerInitials`), `:197-213` (`handleShowOnMap` —
   sessionStorage + router push).

6. **Header / badges / vacation block (main column top)** —
   `ProducerDetail.jsx:215-423`. Breadcrumb, gallery, name +
   `BadgeRow` + `TrustBadge` + reviews chip + premium chip +
   favorites count + `AvailabilityBadge` + daily-availability dot,
   short description, contact name, city + category, top product +
   price, secondary categories, highlights strip,
   `KashrutBadgeStrip`, vacation banner.

7. **Mobile inline CTA + action row** —
   `ProducerDetail.jsx:425-480`. `WhatsAppQuestionChips`,
   `PrimaryContactButton` w/ inline beacon, "show on map" button,
   `WhatsAppShareButton`, referral chip.

8. **Content sections** — `ProducerDetail.jsx:482-690`. Description,
   `OpeningHours`, `MiniMap`, similar producers carousel, events
   list (with `showAllEvents` toggle), products grid,
   `DeliveryBlock` / legacy `delivery_areas` table,
   `DirectoryDisclaimer`, `ReportButton`, `ReviewsSection`
   (lazy-mounted).

9. **Sticky contact sidebar** — `ProducerDetail.jsx:693-832`.
   Vacation notice, primary CTA, 2-column tile grid (phone /
   instagram / website / email — each with its own inline beacon and
   trim/sanitize logic), `FollowButton`, WhatsApp group invite,
   `ShareButton`.

10. **Mobile sticky contact bar** —
    `ProducerDetail.jsx:834-898`. IO-driven slide-in, social-proof
    pill, primary CTA mirror.

### c) Proposed split

| New module | Moves out | What lives there |
|---|---|---|
| `app/producer/[id]/hooks/useProducerData.js` | resp. (1, 4) | producer fetch + events + similar producers + recently-viewed write |
| `app/producer/[id]/hooks/useStickyBar.js` | resp. (3) — bar half | inline-CTA IntersectionObserver, returns `isBarVisible` |
| `app/producer/[id]/hooks/useLazyReviews.js` | resp. (3) — reviews half | reviews IO, returns `reviewsVisible` + `containerRef` |
| `app/producer/[id]/hooks/useTabScroll.js` | resp. (3) — tab half | sectionRefs, tabBarRef, `scrollToSection` |
| `app/producer/[id]/lib/contact-tracking.js` | resp. (2) | `trackContactClick` + a single `pingWhatsAppBeacon(producerId)` helper to dedupe the three pasted blocks |
| `app/producer/[id]/lib/producer-format.js` | resp. (5) | `shareUrl`, `vacationReturnLabel`, `producerInitials`, `handleShowOnMap` |
| `app/producer/[id]/components/ProducerHeader.jsx` | resp. (6) | name, badges, availability, kashrut, vacation banner, highlights |
| `app/producer/[id]/components/ActionRow.jsx` | resp. (7) | mobile inline CTA + share + referral |
| `app/producer/[id]/components/ProducerSections.jsx` | resp. (8) | description, opening hours, mini-map, similar, events, products, delivery, disclaimer, report, reviews wrapper |
| `app/producer/[id]/components/ContactSidebar.jsx` | resp. (9) | sticky aside; internally splits the 4 contact tiles into a `<ContactTile/>` to remove the trim duplication on `producer.website` and `producer.instagram` |
| `app/producer/[id]/components/StickyContactBar.jsx` | resp. (10) | mobile bar, takes producer + isBarVisible + isVacation as props |
| `app/producer/[id]/ProducerDetail.jsx` (post-split) | top-level layout only | compose hooks, render `<ProducerHeader/>` + `<ProducerSections/>` + `<ContactSidebar/>` + `<StickyContactBar/>`; aim < 200 lines |

### d) Risk score: **4 / 5**

- Not in `.claude/central-components.json` but it is the
  conversion-critical page — every "show on map" feature, WhatsApp
  CTA, and review unlock flow funnels through here.
- Three pasted WhatsApp-beacon blocks (`:439-443`, `:720-725`,
  `:870-879`) MUST be deduped through one helper, not three —
  consolidating them is the single highest-leverage change but also
  the one most likely to silently change tracking semantics. Each
  block has slightly different `try/catch` wrapping; the helper must
  preserve fail-soft on every path.
- The legacy-vs-new delivery model branch (`:621-663`) is a tar pit;
  `ProducerSections.jsx` must keep both branches and the extraction
  must NOT decide that the legacy path "looks dead" (regression rule
  1, grep before delete).
- IO observers depend on render order — extracting `inlineCTARef`
  and `reviewsContainerRef` into hooks must keep the same ordering or
  the bar fires on mount.

### e) Recommended order: **3rd**.

---

## File 3 — `backend/app/main.py`

### a) Size

- **220 lines** (`main.py:1-220`).
- 1 module-level FastAPI factory + 4 inline endpoints.
- 3 helper functions (`_redacted_db_url`, `_run_db_init_sync`,
  `_init_db_background`) + `lifespan`.
- 25 `app.include_router(...)` calls, with one router
  (`category_requests`) imported inline at `:167` instead of at the
  top-of-file router import block.

### b) Distinct responsibilities (file:line evidence)

1. **Logging + env redaction** — `main.py:20-21` (configure_logging +
   logger), `:24-36` (`_redacted_db_url`).

2. **DB init + seed orchestration** — `main.py:42-52`
   (`_run_db_init_sync` — imports models, calls `Base.metadata.create_all`,
   runs seed), `:55-62` (`_init_db_background` background runner).
   *Locked decision:* `Base.metadata.create_all` at `:46` is the
   dev/CI safety net per MEH-352 — leave behind. The Alembic-only
   policy from `.claude/rules/db.md` means `_migrate_columns` is
   already gone; **do not touch this block** per task constraints.

3. **App factory + middleware stack** — `main.py:97-101` (FastAPI
   ctor, slowapi limiter, CorrelationId), `:104-111` (CORS),
   `:114-123` (security headers middleware), `:126-142` (request
   metrics middleware — note the late `import time as _time` /
   `from app.services.analytics import record_request` at the file
   middle, lines 126-128).

4. **Router registration** — `main.py:145-173`. 25 routers, mostly
   imported via the big import at `:18`; `category_requests` is
   imported inline at `:167-168` — single inconsistency.

5. **Inline endpoints (do not belong in main)** —
   `main.py:176-180` (`/push-vapid-key`), `:183-209`
   (`/holiday-mode` — opens its own SessionLocal, runs a query against
   `AdminSetting`), `:212-214` (`/`), `:217-220` (`/health`).

### c) Proposed split

| New module | Moves out | What lives there |
|---|---|---|
| `backend/app/observability.py` | resp. (1) | `configure_logging` invocation, `_redacted_db_url`, structlog logger |
| `backend/app/startup.py` | resp. (2) | `_run_db_init_sync`, `_init_db_background`, `lifespan`. Keeps the MEH-352 `create_all` safety net + seed call as-is |
| `backend/app/middleware/__init__.py` | resp. (3) | `add_security_headers`, `record_request_metrics`, `install_middlewares(app)` factory that registers CORS + slowapi + correlation in correct order. Hoists the file-middle imports to module top |
| `backend/app/router_registry.py` | resp. (4) | one `register_routers(app)` function that owns the 25-router list; flatten the inline `category_requests` import into the top-level imports |
| `backend/app/routers/system.py` | resp. (5) — `/health`, `/`, `/push-vapid-key` | thin router for ops endpoints |
| `backend/app/routers/holiday_mode.py` | resp. (5) — `/holiday-mode` | dedicated router; uses `Depends(get_db)` instead of opening its own `SessionLocal` |
| `backend/app/main.py` (post-split) | shell only | imports the modules above, instantiates `app`, calls `install_middlewares(app)` and `register_routers(app)`; aim < 60 lines |

### d) Risk score: **2 / 5**

- 25-router include order is not safety-critical; FastAPI matches by
  path, not registration order. Moving them into a registry is
  mechanical.
- Middleware order **is** critical: CorrelationIdMiddleware must wrap
  SlowAPIMiddleware so request IDs appear on rate-limit responses —
  the new factory must register in the same order as `:99-111` and
  the two `@app.middleware("http")` decorators (`:114`, `:131`)
  become `app.add_middleware(...)` calls in the same order.
- The `lifespan` swap is the only behavioral change; it must continue
  to set `app.state.db_init_status` (`:89-90`, `:60-62`) — `/health`
  reads it (`:219`).
- **Constraint compliance:** the task prohibits touching the Alembic
  / `_migrate_columns` concern; `_run_db_init_sync` at `:42-52`
  contains only the MEH-352 safety net + seed and is moved as-is.

### e) Recommended order: **2nd**.

---

## File 4 — `frontend/app/producer/[id]/page.js`

### a) Size

- **42 lines** (`page.js:1-42`). Not a god file.
- 2 server functions (`getProducer`, `generateMetadata`) + 1 thin
  Client-shell component (`ProducerJsonLd`) + the page default.

### b) Distinct responsibilities (file:line evidence)

1. **Server fetch helper** — `page.js:6-14` (`getProducer`).
2. **SEO metadata + JSON-LD** — `page.js:16-19` (`generateMetadata`),
   `:21-31` (`ProducerJsonLd` w/ `dangerouslySetInnerHTML`).
3. **Page composition** — `page.js:33-42`.

### c) Proposed split

**No split recommended.** The file is already a minimal Next.js
server-component wrapper. The only minor smell is that the page renders
`<ProducerDetail/>` without forwarding the server-fetched producer
(`:39`), so the client refetches it via `api.get` in
`ProducerDetail.jsx:90-98`. Wiring `initialProducer={producer}` /
`fetchPath` would eliminate the duplicate request — but that is a
**behavior change**, out of scope for an analysis-only PR. Logged in
the smells appendix below.

### d) Risk score: **1 / 5**.

### e) Recommended order: **1st (no-op)** — left as-is. Any change
here belongs in a follow-up that owns the SSR-hydration concern end
to end with `ProducerDetail`.

---

## Recommended refactor order

| Order | File | Risk | Why this slot |
|---|---|---|---|
| 1 | `producer/[id]/page.js` | 1 | No split needed; documenting closes the file in this plan. |
| 2 | `backend/app/main.py` | 2 | Mechanical. No behavior change if middleware order + lifespan state are preserved. Builds the pattern for the frontend splits. |
| 3 | `producer/[id]/ProducerDetail.jsx` | 4 | Higher yield than MapClient (deduping the 3 WhatsApp beacons + the 4 contact tiles is concrete LOC reduction) but lower blast radius — no `<MapComponent/>` ref-reconciliation. |
| 4 | `app/map/MapClient.jsx` | 5 | Last because it is a central component, has the dual-pane ref invariant, and a regression here breaks the conversion-critical `/map` page. By this point the hook + presentational-component split pattern is proven on the other three files. |

Phase 2 must split the work into **four sequential PRs** (one per
file, per workflow rule 18 / regression rule 3 — one PR = one logical
change). No bundling.

---

## Acceptance for Phase 2 (proposed, not committed)

Per file, before merge:
- `npm run build` passes (frontend) / `pytest tests/test_api.py` passes
  (backend).
- `/adversarial-review` clean — central-component override applies for
  `MapClient.jsx` and `main.py` per `.claude/rules/testing.md`.
- Vercel preview opened on mobile for the two frontend files
  (regression rule 4).
- Diff is structural-only: no behavior changes. If a refactor reveals
  a true bug, file a separate Linear ticket per the
  over-engineering-guard rule below.

---

## נספח: smells נוספים (noted, not fixed in Phase 2 unless escalated)

> Per the over-engineering guard: surface, don't fix. Each item below
> is a candidate Linear ticket, not an inline change.

1. **SSR producer not forwarded to client** — `page.js:34-39` fetches
   the producer for `generateMetadata` and JSON-LD, then renders
   `<ProducerDetail/>` without `initialProducer`, so
   `ProducerDetail.jsx:90-98` refetches the same record. Free
   waterfall removal.

2. **Three pasted WhatsApp beacon blocks in ProducerDetail** —
   `ProducerDetail.jsx:439-443`, `:720-725`, `:870-879`. Same beacon,
   three subtly different try/catch shells. One helper covers all
   three.

3. **Two pasted WhatsApp-CTA blocks across MapClient** —
   `MapClient.jsx:730-734` (desktop mini-popup) and `:843-847`
   (mobile sheet). Same `getWhatsAppHref` + same beacon + same SVG
   inline.

4. **Inline `import` mid-file in `main.py`** — `main.py:126-128`
   (`import time as _time`, `from app.services.analytics import
   record_request`) and `:167` (`from app.routers import
   category_requests`). Hoist to module top during the split.

5. **`/holiday-mode` opens its own `SessionLocal`** —
   `main.py:194-209`. Every other endpoint uses `Depends(get_db)`.
   Standardize during the system-router extraction.

6. **`useEffect` deps array suppression** —
   `MapClient.jsx:427-428` disables `react-hooks/exhaustive-deps`.
   Acceptable for the current implementation but the hook split
   (`useMapSync`) is the cleanest moment to revisit it.

7. **Magic number `400` ms hover debounce** —
   `MapClient.jsx:336-339`. Worth a named constant in `useMapSync`.

8. **`AdminSetting` query repeated** — `main.py:198-202` queries
   `AdminSetting.key.in_([...])` directly; same pattern likely lives
   in the admin router. Consolidating belongs to the holiday-mode
   ticket, not this refactor.

---

## Out of scope (per task constraints)

- `_migrate_columns` / Alembic concerns in `main.py` — separate ticket
  per task brief.
- New abstractions beyond what is required to split each god file.
- Any code change in this PR. This document is the entire deliverable
  for Phase 1.
