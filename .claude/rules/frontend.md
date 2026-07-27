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

Next.js 14 (App Router) + Tailwind + Framer Motion + Leaflet. JavaScript
(not TypeScript); JSDoc for typed params where it matters.

---

## Cloudinary

All image URLs go through `lib/cloudinary.js`. The helper injects
`f_auto,q_auto` automatically — never hardcode transform params in
component code. If a component needs a custom transform, extend the
helper, don't bypass it.

---

## Zod validation before every map API call (Rule 19)

Import schema from `lib/schemas.js`. Call `safeParse()` before any
`api.get` / `api.post` or Leaflet mutation. On failure:

```js
showToast.info(error.issues[0].message);
return;
```

Never pass `NaN`, `null`, `0`, or values `> 50` to the API or to map
functions.

---

## RTL

All RTL rules, logical properties, and exceptions:
[.claude/rules/rtl.md](./rtl.md).

---

## CSS on third-party-managed DOM needs a browser probe (MEH-1619)

Any CSS rule targeting DOM a library owns — `.leaflet-*`, `.mehamakor-*` marker/cluster
elements, markercluster internals, or any node a third party creates and styles — must
carry a **computed-style probe from a real browser** in the PR evidence. Reading the
stylesheet is not enough, and neither is "it looks right on screen".

Two things go wrong that no static tool sees:

1. **The library writes the same property inline**, and inline beats a class rule.
   Leaflet writes `transform`, `opacity`, `zIndex`, `width`, `height`, `visibility`,
   `display`, `left`, `top`, `margin{Top,Left}`, `bottom`, `position`
   (`DomUtil.setTransform` `leaflet-src.js:2532`, `setOpacity` `:2481`);
   markercluster re-applies `opacity` on every marker it animates
   (`clusterShow()` `leaflet.markercluster-src.js:1826-1836`). It writes **no**
   `filter` — which is why a marker fade rides `filter: opacity()` and not the
   `opacity` property.
2. **The selector matches nothing**, because the library's class names drifted or the
   state you're qualifying on stopped being a class.

Both failure modes are silent: no error, no warning, no failing test, and the rule reads
correctly.

**What the evidence must show:** the property's **computed value on the real element**,
sampled in the state the rule targets. For markers that means **un-clustered** — at the
default zoom every pin is inside a cluster and the marker selector matches zero
elements, so a probe taken there measures the camera, not the rule.

**Deleting such a rule** additionally needs a **pixel** before/after at 375 + 1440 — not
a file hash. Hashing rendered output reports encoder noise as a visual change; the same
build captured twice can differ. Harness: `frontend/e2e/qa-meh1619-visual-noop.mjs`.

**Never reach for a new `!important`** to win against an inline style — it cannot, and
where it can it usually breaks something the library needs. Move to a property the
library never touches. The one `!important` in `globals.css` that competes with a
library *stylesheet* (attribution `margin-bottom`, MEH-1365) carries a "measured" note
saying what was observed without it; match that bar or don't add one.

Precedent + full evidence tables: [docs/audits/silent-failure-audit.md](../../docs/audits/silent-failure-audit.md).

---

## Sub-class B′ — a prop that deletes the thing another prop configures (MEH-1633)

Class B above is *one* prop whose effect is conditional on the runtime element type
(`alt` on a divIcon). **B′ is a different shape: two props that are individually valid
and jointly contradictory.** One prop supplies a value; a second, elsewhere in the tree,
removes the element that value would have rendered into. Each reads correct in
isolation, which is why review passes — the reviewer's eye lands on the configuring
prop, sees the string it wants, and never looks for the switch that discards it.

The instance: `<MapContainer attributionControl={false}>` next to
`<TileLayer attribution='…' />`. react-leaflet builds no attribution control at all, so
the string has nowhere to go. **Measured on the producer page before the fix: `0`
`.leaflet-control-attribution` elements** — while the source still displayed a
perfectly good ODbL notice two lines down.

**Why B′ is worse than B.** A class-B inert prop costs an unimplemented nicety. B′ costs
a legal obligation: serving OSM tiles without visible attribution violates the ODbL and
the OSM tile usage policy, and the operational penalty is tile-blocking of the whole
domain. The failure is also *invisible by construction* — the fix and the bug live in
the same JSX block, so a grep for the attribution string finds it and reports health.

**The review question B′ adds:** for any prop that supplies a value to a library, ask
**what renders it, and is that thing still switched on?** A `*Control={false}`,
`show*={false}`, `disable*`, or `render*={null}` sibling anywhere in the same component
tree is the thing to look for. It is not enough that the value is present and correct.

**Evidence bar:** the same as class A — count the rendered element. Not "the string is
in the source". `document.querySelectorAll('.leaflet-control-attribution').length` must
be exactly `1` inside the map container: `0` is the deletion, `2` is a double-mount.

**Mechanical guard:** `scripts/checks/map-attribution-guard.sh` (runs under the required
*Repo guards* job via `scripts/checks/run-all.sh`) reds any
`attributionControl={false}` under `frontend/`. It checks that ONE pattern — it cannot
tell a valid attribution string from a plausible one, and does not try.

---

## Map z-index tokens

Quick reference (canonical ledger + full context in [.claude/rules/rtl.md](./rtl.md)
— keep these two in sync):

```
tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 →
legend:800 → controls/zoom/search:1000 → BottomNav pill:1000 →
global header/nav (+ account dropdown):1050 →
cookie:1100 → filter-sheet:1200 → Toaster:2000 → chat:9999
```

Do not use arbitrary z-index values on `/map`. Floating elements use logical
props only; the bottom-end corner belongs to the chat FAB (MEH-1135 — see rtl.md).

---

## After UI changes

- Update [docs/MANUAL_TESTING.md](../../docs/MANUAL_TESTING.md) with any
  new features. Format:
  `[ ] Test — איך לבדוק — תוצאה מצופה`.
- Open the Vercel preview on **mobile** before approving any PR that
  changes visible UI (Regression rule 4).
