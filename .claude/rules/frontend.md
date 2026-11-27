---
paths:
  - "frontend/**/*.jsx"
  - "frontend/**/*.js"
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
  - "frontend/**/*.css"
  - "frontend/**/*.html"
  - "frontend/**/*.scss"
---

# Frontend rules

Next.js + Tailwind + Framer + Leaflet patterns. RTL-specific guidance
lives in its own file — see [.claude/rules/rtl.md](./rtl.md).

---

## Stack

Next.js 16 (App Router) + Tailwind + Framer Motion + Leaflet. JavaScript
(not TypeScript); JSDoc for typed params where it matters.

**Next 16 is newer than most training data.** Before using a Next API you have
not used in this repo (routing, caching, `proxy`, metadata, image config), read
its guide under `frontend/node_modules/next/dist/docs/` and heed deprecation
notices. The same note lives in `frontend/AGENTS.md`, but that file is written
by `next dev` and gitignored, so a fresh clone does not have it.

---

## Shared components — search before you create

Before writing a button, field, dialog, message, heading, toggle, avatar,
loading state or back link, read the table in
[frontend/components/CLAUDE.md](../../frontend/components/CLAUDE.md) «Shared
components» and build from its owner. Extend the owner with a prop before
writing a sibling.

---

## Shared helpers — search `frontend/lib` before you write one

Formatting, links and validation each have ONE owner. Import it; a second
`toLocaleDateString`, `wa.me/` builder or phone regex is the bug. When none
fits, extend the owner. `SharedHelpersTableGuard.test.js` fails when a file or
export named here no longer exists. A WhatsApp URL built outside `utils.js` fails
`scripts/checks/whatsapp-link-owner-guard.sh` (MEH-3603). A function name
defined in more files than `duplicate-name-baseline.txt` allows fails
`scripts/checks/duplicate-name-guard.sh` (MEH-3715).

| Need | Owner (`frontend/lib/`) | Exports |
|---|---|---|
| Print a date | `format-date.js` | `formatDate`, `formatEventDate` |
| "Today" in Israel time | `israel-date.js` | `israelToday` |
| "Today" drawn in a component (hydration-safe, MEH-3861) | `use-israel-today.js` | `useIsraelToday` (default export) |
| Price, price range | `utils.js` | `formatPrice`, `formatPriceRange` |
| Agorot ↔ shekels (API prices are agorot) | `money.js` | `formatAgorot`, `agorotToShekels`, `shekelsToAgorot` |
| Phone: normalise · validate | `utils.js` · `validators.js` | `normalizePhone` · `validateIsraeliPhone` |
| Email / password rules | `validators.js` | `validateEmail`, `passwordRules` |
| WhatsApp link | `utils.js` | `getWhatsAppHref`, `getWhatsAppChatHref` (no prefilled text) |
| A business's contact button (href, label) | `contact-method.js` | `getPrimaryContactHref`, `getPrimaryContactLabel` |
| Phone call link (`tel:`) | `contact-method.js` | `telHref` |
| Opening hours: parse, open-now | `hours.js` | `parseHours`, `computeStatus` |
| Distance in km | `distance.js` | `haversineKm`, `formatDistance` |
| Share / copy a link | `share-link.js` · `clipboard.js` | `shareOrCopy` · `copyText` |
| API error → Hebrew message / toast | `errors.js` | `errorMessage` (reads error.api.CODE via `defaultCodeResolver`, MEH-1943), `detailToMessage`, `showErrorToast` |
| Toast | `toast.js` | `showToast` |
| Login link that returns here · safe redirect target | `safe-redirect.js` | `loginHrefBackHere`, `safeInternalRedirect` |
| Image URL / ratio | `cloudinary.js` | `optimizeCloudinary`, `IMAGE_RATIOS` |
| Read from the API in a client component (MEH-3536) | `use-api.js` | `useApi`, `useUserApi`, `invalidateApi` |
| Fetch in a server component | `server-fetch.js` | `serverFetch` |

---

## Cloudinary

All image URLs go through `lib/cloudinary.js`. The helper injects
`f_auto,q_auto` automatically — never hardcode transform params in
component code. If a component needs a custom transform, extend the
helper, don't bypass it.

---

## Zod validation before consuming an API response (Rule 19)

Two sides, different failure handling. Both are Rule 19; the snippet below
covers only one of them.

**Response side — validate the payload before consuming it.** Not map-only:
producer feeds reach three surfaces and all three parse — the home grid
(`lib/use-home-page.js:326`, `:360`, `:430`), `/map`
(`app/[locale]/map/state/useProducersFeed.js:49`), and `/favorites`
(`app/[locale]/favorites/FavoritesClient.jsx:140`). The grid and `/map` import
`lib/schemas.js` (canonical `ProducerSchema` / `ProducersResponseSchema`);
every other response schema comes from `lib/api-responses.js`, which takes
them from the GENERATED `lib/generated/api.zod.js` (MEH-1748). That file
declares no field of its own — only generated schemas, a `pick` of one, or a
generated one with an extra screen-level `check` —
and `__tests__/ApiResponsesNoFieldLists.test.js` fails if a hand-written field
list or the old `lib/api-schemas.js` comes back. A new response schema is a
re-export from the generated file, never a `z.object`.

Each caller routes failure to **its own** error state; there is no shared
handler and none of them uses the toast snippet below. `/map` empties the
list and toasts a localized string (`useProducersFeed.js:36-39`); `/favorites`
parses **per row** and drops only the bad row, reserving the error state for
a non-array payload (`FavoritesClient.jsx:130-143`). Its row schema is the
generated FavoriteOut, whose nested producer is the whole ProducerListOut, so
nothing ProducerCard renders can be stripped (the `.loose()` of MEH-1713 is no
longer needed and is gone).

**Test fixtures follow the contract.** A unit test that feeds one of these
schemas builds its payload with `__tests__/helpers/contract-row.js`
(`contractRow`, `uuidFor`, `favoriteRow`), so ids are UUIDs and required
fields are present — the same shape the backend sends.

**Request side — validate params before the call.** `safeParse()` before any
`api.get` / `api.post` or Leaflet mutation. On failure:

```js
showToast.info(error.issues[0].message);
return;
```

Live at `LocationsEditor.jsx:105` — the only site using this form. Never
pass `NaN`, `null`, `0`, or values `> 50` to the API or to map functions.

---

## RTL

All RTL rules, logical properties, and exceptions:
[.claude/rules/rtl.md](./rtl.md).

---

## CSS on third-party-managed DOM needs a browser probe (MEH-1619)

Any CSS rule on DOM a library owns (`.leaflet-*`, `.mehamakor-*` markers,
markercluster internals) carries a **computed-style probe from a real browser**
in the PR evidence, sampled in the state the rule targets (markers:
**un-clustered** — at default zoom the marker selector matches nothing).
Two silent failures no static tool sees:

1. **The library writes the same property inline**, and inline beats a class.
   Leaflet and markercluster write `transform`, `opacity`, `zIndex`, size,
   position, `display` — never `filter` on a live path, which is why a marker
   fade rides `filter: opacity()`. `frontend/__tests__/leaflet-inline-writers.test.js`
   (MEH-1637) re-derives this from `node_modules` on every run.
2. **The selector matches nothing** because the library's class names drifted.

Deleting such a rule also needs a **pixel** before/after at 375 + 1440
(`frontend/e2e/qa-meh1619-visual-noop.mjs`), not a file hash. **Never add a new
`!important`** to beat an inline style; move to a property the library never
touches. Evidence: [docs/audits/silent-failure-audit.md](../../docs/audits/silent-failure-audit.md).

---

## Sub-class B′ — a prop that deletes the thing another prop configures (MEH-1633)

Two props, each valid, jointly contradictory: `<MapContainer
attributionControl={false}>` next to `<TileLayer attribution='…' />` renders
**no** attribution (an ODbL breach that risks tile-blocking the domain), while
a grep for the string reports health. For any prop that supplies a value to a
library, ask **what renders it, and is that thing still switched on?**
(`*Control={false}`, `show*={false}`, `disable*`, `render*={null}`). Evidence:
count the rendered element (`.leaflet-control-attribution` exactly `1`).
`scripts/checks/map-attribution-guard.sh` (Repo guards) reds
`attributionControl={false}` under `frontend/`.

---

## Map z-index tokens

The ledger is [rtl.md](./rtl.md) «Map z-index tokens», checked by
`frontend/__tests__/ZTokenLedgerSync.test.js`. No arbitrary z-index on `/map`.

---

## One control, one element — phone and desktop (MEH-2776)

Prefer ONE element per control that adapts with responsive classes. A second
copy per screen size (`hidden lg:…` + `lg:hidden`) drifts: a fix lands in one
copy and the other keeps the old look. MEH-2506 moved «מרחק מ…» on the phone
only; the desktop chip stayed until MEH-2769.

- Where two copies already exist (`/map` shells, Header, event/experience
  detail, rescue card), build both from one function and change both together.
- A fix that touches one copy only says why in the PR, and asks Sapir when the
  reason is not a locked decision.
- `/map` is guarded by the MEH-2776 case in `map-02.spec.ts`: it fails when a
  control sits in a different container per shell, or exists in one shell
  without a reason in `SHELL_ONLY`. Add a reason there; don't loosen it.
  Blind spot: the phone's region wrappers (`SHELL_WRAPPERS`) count as the
  shell, so a move between two of them is not caught.

---

## A route change goes through the router — never `history.pushState` (MEH-3463)

Two routes that are one screen (tabs) share a **layout** that renders the
screen once (`app/[locale]/(whats-on)/layout.js`); the page files carry only
the route and its metadata, and the tab is read from `usePathname()`. Switch
with `router.push(path, { scroll: false })` or `<Link>`. Writing another route
with `history.pushState` leaves Next holding one URL with the other page's
tree — on 20/11 that put half the hub on «אירועים» and half on «חוויות» in
production. `pushState` is for a new **query on the same path** only, and each
such file is listed with its reason in
`frontend/__tests__/NoHandWrittenRouteChangeGuard.test.js`, which fails on any
other caller.

---

## After UI changes

- Cover the new behaviour with an automated test; only a real-device-only
  check goes to [docs/RELEASE_CHECKLIST.md](../../docs/RELEASE_CHECKLIST.md)
  (workflow rule 10, MEH-2796).
- Before merging a PR that changes visible UI, capture and read the phone +
  desktop screenshots (sizes: workflow rule 38; rule 23). There is no human
  mobile pass.
