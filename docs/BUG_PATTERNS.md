# Known Bug Patterns

Cross-reference this file before touching any of these areas. When a bug is
found and fixed, follow the **Bug Protocol** in `CLAUDE.md` — root cause,
grep for siblings, add a regression rule, write a test, update docs.

Historical record of bug patterns that have recurred on this codebase. If
the same pattern shows up again, update the matching section here (don't
just fix it silently).

---

## RTL eye toggle position

**Pattern:** password inputs use `dir="ltr"`; toggle must be `right-3`
(physical), never `left-3`.

**Files:** `/login` + `/register` pages.

**Why physical:** inside a `dir="ltr"` island on an RTL page, logical
properties flip the opposite direction to what the visible layout suggests.
`right-3` is the intentional exception to the "no physical directional
classes" rule — add a `// rtl-ok` comment when used.

**See also:** full RTL exception list in `.claude/rules/rtl.md`.

---

## Leaflet tooltip z-index

**Pattern:** Leaflet tooltips must use z-index `500` — between
`markers:400` and `bottom-sheet:600`.

**Risk:** arbitrary z-index breaks the token system. Tooltips end up
above bottom sheets or below markers; bottom sheets end up above map
controls.

**Fix:** use the map z-index token table. Full token list in
`.claude/rules/rtl.md`.

---

## A dropdown or overlay near an inline Leaflet map must clear 400 and 1000 (MEH-2093)

**Pattern:** a `z-50` popup rendered as a sibling of a `<MiniMap>` paints
*underneath* the map and gets clipped at the map's top edge.

**Why:** `.leaflet-container` sets `overflow: hidden` and nothing else — no
`position`, no `z-index` (`leaflet.css:17`). It is therefore **not** a stacking
context, so the map's internals compete at page level rather than being sealed
inside it: panes at **400** (`leaflet.css:107`) and, in this repo, controls
pushed to **1000** and the attribution to **1001** (`globals.css`). A popup at
50 loses to all three.

**The general shape:** wrapping a library's widget in a `relative` div does not
contain its z-index. Check whether the container is a real stacking context
before assuming anything is scoped to it.

**Fix:** clear 1001 and stay below the global header at 1050 — `AddressSearch.jsx`
uses `z-[1010]`. Anything new goes in the ledger table in `.claude/rules/rtl.md`,
which `frontend/__tests__/ZTokenLedgerSync.test.js` now enforces.

**Sibling still open:** `CitiesAutocomplete.jsx:258` is the same `absolute z-50`
listbox shape and is used on the same registration page as the MiniMap. It was
out of MEH-2093's declared scope and has not been changed.

---

## Full-screen dialogs must be in the modal tier, not z-50 (MEH-2093)

**Pattern:** a `fixed inset-0 … z-50` dialog renders its `bg-black/40` overlay
across the page, while the sticky header and the mobile BottomNav stay bright on
top of it.

**Why:** none of these dialogs is portaled, and neither `<body>`
(`flex flex-col`) nor `<main>` (`flex-1 focus:outline-none`) creates a stacking
context — so the dialog, the header (**1050**) and the BottomNav (**1000**) all
compete in the ROOT stacking context, and 50 loses.

**Fix:** use the existing modal tier — `z-[9000]` for ordinary dialogs,
`z-[9500]` only for one that must sit above another modal. Guarded by
`frontend/__tests__/ModalZTier.test.js`, which fails naming any file:line that
reintroduces the combination.

**Known and accepted at this tier:** a toast (`Toaster` z-2000) raised while a
dialog is open renders *under* it, and the chat FAB (9999) floats *over* it.

---

## GSI initialize() must be singleton (MEH-274)

**Pattern:** Two components each call `window.google.accounts.id.initialize()`
independently. On client-side navigation between them (e.g. `/register/producer`
→ `/login`), the second component's script tag is removed on unmount but the
`window.google.accounts.id` global persists. The browser may not re-fire
`onload` for the cached GSI script URL, leaving the first component's
callback (producer OAuth) active. GSI's One Tap then auto-fires with the
wrong callback on the new page → 409 on `/login`, plus a double-init warning.

**Files:** `frontend/components/GoogleAuthButton.jsx`,
`frontend/components/ProducerOAuthButtons.jsx`.

**Fix:** Use the `useGoogleSignIn` hook (`frontend/lib/use-google-sign-in.js`)
which calls `cancel()` before every `initialize()` and on unmount. Only one
call site for `initialize()` — in the hook. No component may call it directly.

**Regression spec:** `frontend/e2e/flows/09-login-console-clean.spec.ts`

**Superseded by MEH-3690 (24/11/2026):** the site no longer renders Google's
button or calls `google.accounts.id.initialize()` at all, so this bug cannot
recur. Every Google sign-in is our own button (`frontend/components/ui/GoogleButton.jsx`)
with its own code client per mount (`frontend/lib/use-google-code-sign-in.js`),
which has no shared callback to go stale. `useGoogleSignIn` is deleted.

**Rule:** a new Google sign-in uses `useGoogleCodeSignIn` and `GoogleButton`;
never `window.google.accounts.id.initialize()` / `renderButton()`.

---

## Undefined vars after refactor

**Pattern:** deleting/renaming a prop, variable, or function without
grepping every consumer first.

**Example:** PR #43 broke `ProducerCard` this way — a prop was renamed
in one component but the consumer still referenced the old name.

**Fix:** grep before delete (Regression rule 1). Always verify
`ProducerCard`, `Header`, `BottomNav` still render cleanly after any
refactor PR.

---

## Anthropic `proxies` kwarg TypeError

**Pattern:** initializing `anthropic.Anthropic(api_key=...)` without our own
`http_client`, or (anthropic 1.0+) with a plain `httpx.Client` instead of the
SDK's `DefaultHttpxClient` — the second raises `TypeError: Invalid
http_client argument; httpx.Client is from the httpx package, but this SDK
uses httpx2`.

**Error:**
`TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`

**Files:** `backend/app/routers/chat.py`,
`backend/app/services/moderation_common.py` (`make_anthropic_client`, MEH-3619).

**Fix:** always
`anthropic.Anthropic(api_key=..., http_client=anthropic.DefaultHttpxClient())`.

**Why this is sneaky:** the error is caught by the AI fail-open
mechanism, so there's no user-facing 5xx — just a silent "offline"
Hebrew message. "Cleaning up" the kwarg appears to work in testing but
silently disables AI features in production.

**Full context:** [docs/LOCKED_DECISIONS.md](./LOCKED_DECISIONS.md).

---

## Grid card does not fill its cell (MEH-2802)

**Pattern:** a card inside a CSS grid cell ends where its content ends. The
grid stretches the CELL to the row's tallest item, but the card's wrapper and
link are not `h-full`, so cards in one row come out at different heights, a
full-height decoration (the start-edge tick, the bottom border) stops short,
and the footer row (chip + price) sits on a different line in each card. Home
«אירועים קרובים», lg+ 3-up: `EventEntryRow` compact had none of it.

**Rule:** a card in a grid fills its cell, and its footer is pushed to the
bottom — the MDN card cookbook pattern, already in `ProducerCard.jsx`
(`flex flex-col h-full` + `mt-auto`). In `EventEntryRow` compact (lg only):
wrapper + link `h-full`, link `grid-rows-[auto_1fr]` (band = row 1,
rail + body = row 2), body `flex flex-col`, chip row `mt-auto`, title
`line-clamp-2` (one very long title must not set the height of the whole row).
Keep a minimum
gap above the footer with padding (`pt-*`), since `mt-auto` collapses to 0 in
the tallest card.

**Guard:** `frontend/e2e/flows/45-card-grid-equal-height.spec.ts` — at 1280px on
`/`, equal card height (±1px) per grid row and one chip+price bottom line, for
«אירועים קרובים» and the seasonal `ProducerCard` grid. jsdom has no layout, so
the class half (`__tests__/EventEntryRow.test.jsx`) cannot catch a height bug on
its own. Fewer than 2 cards → the spec skips with the reason, decided from the
API's answer and not from the rendered count.

---

## Duplicate producer-detail CTAs

**Pattern:** rendering both the sidebar WhatsApp CTA and the sticky bar
CTA at the same breakpoint.

**Rule:** sidebar WhatsApp is canonical. Sticky bar is mobile-only.
Never render both at the same breakpoint.

---

## Same fact in two sections (MEH-2803)

**Pattern:** one fact rendered in two places on one page, each correct on its
own. The business page showed its hours under «מתי מקבלים הזמנות» (the order
window) and again, unlabelled, under «הגעה ומיקום» (store hours) — nearly the
same values in two formats («7:00» beside «07:00», «ראשון–חמישי» beside
«א'-ה'»), so a visitor reads a duplicate and wonders which one is right. Same
family as «Duplicate producer-detail CTAs» above: two renderers, no single
owner of the fact.

**Rule:** one fact, one place. A second set of the same KIND of fact is shown
only under its own label, saying what it is the hours OF — Google Business
Profile's «More hours» (pickup, delivery, online ordering beside the regular
hours). When the two sets are equal, they are one fact: one set, one label
(«הזמנות וביקור במקום»). Unreadable data is never merged — it is shown as
typed, labelled.

**Guard:** `frontend/__tests__/ProducerHoursSection.test.jsx` («one fact, one
place») — renders ProducerSections with identical order window and store
hours and asserts exactly one `[data-testid="hours-set"]` and that each time
range appears ONCE in the page text. Red on the pre-MEH-2803 page («7:00–14:00»
×2). Companion: `__tests__/hoursHebrewParse.test.js` reads the demo seed's
`opening_hours` and fails if it drifts into a format `parseHours` cannot read.

---

## The MEH-1398 hard-404 is backend-conditional — verifying it needs a live backend (MEH-1521)

**Pattern:** `frontend/middleware.js`'s `producerExists()` existence-checks
`/[locale]/<slug>` against the backend before deciding whether to rewrite to
a real HTTP 404. On any non-2xx-that-isn't-404, or an unreachable/slow
backend, it deliberately **fails open** (serves the page) rather than
minting a false 404 — a transient backend blip must not deindex a real
business (MEH-1899 discriminates this from the old `return res.ok`, which
collapsed 500/503/429 onto the same 404 as a genuine miss).

**The trap this causes:** any 404 verification run WITHOUT a live backend —
sandboxed CC session, backend down, backend unreachable from the test
runner — will see `200` on every route, including genuinely-missing slugs,
and can be misread as "the 404 regressed" when the real cause is "the
backend wasn't reachable from where I measured." MEH-1521 itself nearly
reached that wrong conclusion once (23/07).

**Rule:** before trusting any 404/200 measurement on a `/[locale]/<slug>`
route, confirm the backend was live and reachable from the same vantage
point as the request. `curl -I` both branches (a real miss AND a healthy
hit) in the same session — a single status code proves nothing on its own.

**Bounded, not indefinite:** the existence check now carries an explicit
3s `AbortSignal.timeout()` (`middleware.js` — `EXISTENCE_CHECK_TIMEOUT_MS`)
so a slow backend degrades to the same fail-open path within a bounded
window instead of hanging the edge request for however long the platform's
own connect timeout is.

**Observability:** every fail-open fires `console.error` (captured in
Vercel's middleware runtime logs) via the `report()` helper in
`middleware.js`, tagged with the response status or thrown error. **Not
wired to Sentry** despite `sentry.edge.config.js` existing (Edge Middleware
CAN reach Sentry — that part of MEH-1521's Phase 0 is answered) — adding an
unverified `Sentry.capture*` call here would violate
[.claude/rules/observability.md](../.claude/rules/observability.md)'s
dashboard-receipt requirement, which cannot be performed from a sandboxed
CC session with no live backend/Sentry access. Left for a session that can
verify a real event lands in the dashboard before claiming Done.

**Regression spec:** `frontend/__tests__/MiddlewareSlugErrorSeparation.test.jsx`.

## A full-screen overlay with no scrim must cover the VISUAL viewport (MEH-3509)

**Symptom:** iPhone, business page: the fullscreen map opened with no X, no
+/− and no OSM credit on screen, and nothing closed it.

**Root cause:** `fixed inset-0` is the LAYOUT viewport. After a pinch on the
page (the inline mini map has its gestures off, so a pinch on it zooms the
whole page) or with iOS 26 drift (`IosViewportPin.jsx`), the visible window is
a smaller part of it, so a control in the overlay's corner is off-screen. The
map then takes every touch, so the page cannot be zoomed back out either.

**Fix:** `lib/use-visual-viewport-box.js` gives the overlay the visual
viewport's box (`offsetTop/offsetLeft/width/height`, with `right/bottom: auto`
so an RTL document does not drop `left`). `MiniMap.jsx` uses it and re-fits
the map when the box changes.

**Siblings, not changed (checked 20/11, 14 sites):** the other `fixed inset-0`
overlays either close on a backdrop tap (scrims, `Lightbox.jsx`) or hold
nothing that captures the pinch (`RegistrationOverlays.jsx`), so the page can
still be zoomed back out and the way out found. A new overlay
that fills the screen with something that eats every touch (a map, a canvas,
an image viewer) uses the hook.

**Regression spec:** `frontend/__tests__/MiniMap.test.jsx` «MEH-3509».

## A root provider's update during hydration throws the page back to the loader (MEH-3828)

**Symptom:** on a slow phone the whole page turns into the route loader
(`app/[locale]/loading.js`) about 5 s after load, then mounts again. The
footer jumps by about a screen (≈ 1.0 CLS) and data the page read is read
twice. No console error.

**Root cause:** a context provider above the page (here `AuthProvider`) sets
state from its mount effect as an urgent update. When it reaches a Suspense
boundary still waiting to hydrate (a `next/dynamic` chunk not loaded yet),
React drops that boundary's server HTML and shows its fallback
(https://react.dev/errors/421; React 18 logs it only in development).

**Fix:** set that state inside `startTransition`, so hydration finishes first.
The cost: consumers see the old value until the page has hydrated.

**Siblings:** a new provider in `app/[locale]/layout.js` that sets state on
mount does the same.

**Regression spec:** `frontend/__tests__/AuthHydrationNoFallback.test.jsx`.

---

## A bottom layer without `vv-pin` floats up the screen on iOS 26 (MEH-3889)

**Pattern:** iOS 26 Safari can lay out `position: fixed` layers against a stale
viewport (after the keyboard closes, or after a fast scroll), so anything with
`bottom: …` sits hundreds of px above the real bottom. Sapir's 26/11 iPhone
screenshot: the BottomNav pill and the chat launcher mid-screen over the home
feed.

**Root cause, two parts:** (1) `IosViewportPin.jsx` inferred the gap from
`innerHeight`, which read healthy while the layers were drifted; it now measures
a 0-height `fixed; bottom: 0` probe. (2) Only layers carrying `vv-pin` are
re-seated, and eight bottom sheets did not (filters, product, city, support,
popover, both alert sheets, the map sheet).

**Held by:** `scripts/checks/vv-pin-guard.sh` (Repo guards) fails a new
bottom-anchored fixed layer without `vv-pin` or a `vv-pin-exempt: <reason>`.
`MapBottomSheet.jsx` is the one exemption: the map controls ride its edge.
A real-device signal: the `ios_viewport_drift` PostHog event (once per mount).


## A lazy add-on whose download fails takes the whole page to the error screen (MEH-3946)

**Symptom:** «משהו השתבש» instead of the page, after a navigation or on a weak
network; in WebKit E2E a `ChunkLoadError` for the chat chunk.

**Root cause:** `next/dynamic` rethrows a failed `import()` during render, so the
nearest error boundary (`frontend/app/[locale]/error.js`) replaces the page for
a widget the visitor never opened.

**Held by:** an optional add-on loads through `optionalChunk()`
(`frontend/lib/optional-chunk.js`), which renders nothing on a failed download
and rethrows any other error. `scripts/checks/optional-chunk-guard.sh` (Repo
guards) fails a plain `dynamic(() => import(…))` outside its list of chunks the
page needs (the /map map, the order sheet). Browser test:
`frontend/e2e/flows/55-optional-chunk-failure.spec.ts`.
