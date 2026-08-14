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

**Rule:** Any new component that renders a Google Sign-In button must use
`useGoogleSignIn`, never `window.google.accounts.id.initialize()` directly.

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

**Pattern:** initializing `anthropic.Anthropic(api_key=...)` without
`http_client=httpx.Client()`.

**Error:**
`TypeError: Client.__init__() got an unexpected keyword argument 'proxies'`

**Files:** `backend/app/routers/chat.py`,
`backend/app/services/home_product_moderation.py`.

**Fix:** always
`anthropic.Anthropic(api_key=..., http_client=httpx.Client())`.

**Why this is sneaky:** the error is caught by the AI fail-open
mechanism, so there's no user-facing 5xx — just a silent "offline"
Hebrew message. "Cleaning up" the kwarg appears to work in testing but
silently disables AI features in production.

**Full context:** [docs/LOCKED_DECISIONS.md](./LOCKED_DECISIONS.md).

---

## Duplicate producer-detail CTAs

**Pattern:** rendering both the sidebar WhatsApp CTA and the sticky bar
CTA at the same breakpoint.

**Rule:** sidebar WhatsApp is canonical. Sticky bar is mobile-only.
Never render both at the same breakpoint.

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
