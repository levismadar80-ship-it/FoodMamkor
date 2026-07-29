# Silent-failure audit — three classes (MEH-1619)

**Date:** 2026-07-27 · **Scope:** frontend CSS, components, tests, QA harnesses ·
**Trigger:** the MEH-1611 overnight run surfaced one instance of each class.

A *silent failure* here means code that is syntactically valid, type-valid, lint-clean,
review-approved — and does nothing. No error, no warning, no failing test. The three
classes below share one property: **static tools cannot see them.** Only the rendered
DOM, or a deliberately broken run, can.

Every verdict in this document comes from a **measurement**, not from reading the code.
Where a measurement was impossible, the row says so instead of guessing.

Probe harnesses (committed, re-runnable):
- `frontend/e2e/qa-meh1619-silent-failure-probe.mjs` — computed-style / rendered-DOM verdicts (classes A + B)
- `frontend/e2e/qa-meh1619-visual-noop.mjs` — before/after pixel proof for CSS deletions

---

## Summary

| Class | What it is | Scanned | Findings | Fixed in |
|---|---|---|---|---|
| **A** | Our CSS on library-managed DOM, on a property the library writes **inline** | **13** rules | **1** dead | PR #2262 |
| **B** | Props that are type-valid but whose effect is conditional on runtime element type | **8** instances | **2** inert | PR #2263 |
| **C** | Assertions where one disjunct alone can pass a broken state | **103** `||`, **5** in assertion position | **1** weak | PR #2266 |
| **B′** | Two individually-valid props that contradict — one deletes what the other configures | **3** map surfaces | **1** inert | MEH-1633 |

**5 findings, 5 fixed.** Every other row was measured effective and deliberately left alone.

**B′ was added after the fact** (MEH-1633, 27/07): it is a *second* shape that the
original class-B definition did not reach, found in an already-audited file. Recorded as
its own sub-class rather than folded into B, so the reason the first sweep missed it stays
legible.

---

## The mechanism behind class A

An inline style beats a class rule. Any property a library writes to `element.style`
is therefore **owned by that library**, and our CSS on it is decoration at best and a
positioning bug at worst.

Extracted from the installed sources, not from memory:

| Library | Properties it writes inline |
|---|---|
| `leaflet` | `transform` (`DomUtil.setTransform`, `leaflet-src.js:2532`, via `setPosition`) · `opacity` (`setOpacity`, `:2481`) · `zIndex` · `width` · `height` · `visibility` · `display` · `left` · `top` · `marginTop` · `marginLeft` · `bottom` · `position` |
| `leaflet.markercluster` | `strokeDashoffset` · `strokeOpacity` · `strokeDasharray` (spider legs), plus Leaflet's `setOpacity` on every marker it animates (`clusterShow()`, `leaflet.markercluster-src.js:1826-1836`, called from `:197/:417/:1289/:1378/:1757`) |

**`filter` appears in neither list.** That is why the MEH-1611 demote works and why
`filter: opacity()` is the correct vehicle for a marker fade.

### Class A — all 13 rules, with probe verdicts

Line numbers are `globals.css` as of the audit (pre-#2262).

| # | Selector | Property | Inline writer? | Measured | Verdict |
|---|---|---|---|---|---|
| A-1 | `.leaflet-container` :168 | height/width/radius | no (Leaflet writes w/h on **tiles** — measured `256px`) | radius `16px` | effective |
| A-2 | `.leaflet-tile-pane` :178 | `filter` | no | `saturate(0.85) brightness(1.02)` | effective |
| A-3 | `.leaflet-marker-pane` :183 | `filter: none` | no | `none` | effective (defensive) |
| A-4 | `.leaflet-control-zoom` :198 | `z-index !important` | no inline (competes with Leaflet's own stylesheet) | `1000` | effective |
| A-5 | `.leaflet-top.leaflet-{left,right}` :201 | `z-index !important` | no inline | `1000` | effective |
| A-6 | `.leaflet-control-attribution` :216 | font-size / z-index / color | no inline | z `1001` | effective |
| A-7 | `.leaflet-control-attribution` @<1024 :238 | `margin-bottom !important` | no inline writer; competes with Leaflet's **`.leaflet-container .leaflet-control-attribution { margin: 0 }`** — the later, winning rule (corrected in MEH-1636; this cell previously named `.leaflet-bottom .leaflet-control`) | `119.68px` with `--map-sheet-h: 14vh` — exactly `14vh + 6px` | effective; the 10px floor is **ours**, not a Leaflet default — pinned by `frontend/__tests__/leaflet-attribution-default.test.js` |
| A-8 | `.leaflet-control-attribution a` :242 | `color` | no | inherit | effective |
| A-9 | `.mehamakor-marker-wrap` :298 | background/border `!important` | no inline (competes with `.leaflet-div-icon`) | bg transparent, border `0px` | effective |
| **A-10** | `.mehamakor-marker:not(.selected):not(.visited):hover` :303 | **`transform`** | **YES — `translate3d(680px, 633px, 0px)`** | selector matched **0** elements (11 matched `-wrap`); `.selected` **0**, `.visited` **0** | **DEAD — removed** |
| A-11 | `.mehamakor-cluster` :307 | background/border `!important` | no inline | bg transparent, border `0px` | effective |
| A-12 | `.mehamakor-map-focused …:not(.focused)` :338 | `filter` | `opacity` yes, **`filter` no** | `filter: grayscale(1) opacity(0.35)` while inline opacity is `1` | effective (the MEH-1611 fix, re-verified here) |
| A-13 | same, `@prefers-reduced-motion` :343 | `transition` | no | — | effective |

### A-10 in detail — dead twice over

1. **The selector matched nothing.** It named the bare marker class; Leaflet renders
   the *wrap* class. Measured on a live `/map` with 11 un-clustered markers:
   `.mehamakor-marker` → **0**, `.mehamakor-marker-wrap` → **11**. Its state qualifiers
   were equally stale — `.selected` and `.visited` matched **0**, because marker state
   has been baked into the divIcon HTML since MEH-763.
2. **It could not have won anyway.** Leaflet owns that element's `transform`. Had the
   rule ever applied, it would have *replaced* the positioning transform and thrown the
   pin to the pane origin — a worse bug than the one it was trying to fix.

**Deleting it lost nothing** — proven, not assumed:

| probe | result |
|---|---|
| hover a marker directly | icon HTML unchanged, no ring — **no affordance existed** |
| hover its card | icon rebuilt, rings **0 → 1** (`useMapSync.js:162-168` → `refreshMarkerIcon` → box-shadow) |
| pixel diff, before vs after deletion | **0** differing px at 1440 (of 1,296,000) and at 375 (of 304,500), on `/map` **and** a producer page |

> **Open UX gap, deliberately not closed here.** Hovering a marker gives no feedback at
> all; only card-hover does. That is a design decision, not an audit's to make. If it is
> ever restored, it must target the icon's **inner div** — never the Leaflet-positioned
> wrap.

---

## Class B — type-valid, runtime-inert

The blind spot: `alt` is a **real, correctly-typed** field of Leaflet's `MarkerOptions`.
TypeScript would accept it. Lint accepts it. Review accepts it. Its effect is conditional
on the runtime icon type:

```js
if (options.title) { icon.title = options.title; }        // any element
if (icon.tagName === 'IMG') { icon.alt = options.alt || ''; }  // <img> only
// leaflet-src.js:7903-7909
```

A divIcon renders a `<div>`, so `alt` is dropped. **This is a data point for MEH-324
(TS migration): TypeScript would not have caught either instance.**

| # | Site | Prop | Measured on the rendered element | Verdict |
|---|---|---|---|---|
| **B-1** | `MiniMap.jsx:126` | `alt={label}` | `DIV`, `hasAltAttr: false`, `altValue: null` | **inert — removed** |
| **B-2** | `MapComponent.jsx:781` | `alt: markerLabel` | `DIV`, `hasAltAttr: false`, `altValue: null` | **inert — removed** |
| B-3 | `MiniMap.jsx:125` | `title` | `title="הסניף"` present | effective |
| B-4 | `MiniMap.jsx:266` | `title` (legacy default `<img>` icon) | effective by the same code path | effective |
| B-5 | `HomepageMiniMap.jsx:252` | `title` | already documented as the correct pattern (MEH-916) | effective |
| B-6 | `MapComponent.jsx:782` | `title` | `title="עסק שכן"` present | effective |
| B-7 | `MapComponent.jsx:783` | `keyboard: true` | `tabindex="0"` present | effective |
| B-8 | `MapComponent.jsx:520` | `interactive: true` (circleMarker) | SVG path — option applies to paths | effective |

**No accessibility was lost.** `/map` pins additionally carry `role="button"` and
`aria-label` from the MEH-765 `add` handler — all measured present.

A stale file-header in `MapComponent.jsx` had listed *"Set `alt: producer.name`
explicitly"* as one of the fixes for bug #10. It was wrong the day it was written; the
header now records that, rather than quietly dropping the line.

---

## Sub-class B′ — the class-B definition was too narrow (MEH-1633, 27/07/2026)

**The original class-B definition did not cover this, and that is the finding.** Class B
was scoped to *one prop whose effect is conditional on the runtime element type* — the
`alt`-on-a-divIcon shape. Written that way, the sweep above asked of each prop "does
this one land?" and never asked "is something **else** switching it off?". B′ is the
second shape: **two props, each individually valid, that contradict each other.** One
supplies a value; another, elsewhere in the tree, deletes the element that value renders
into.

Because `attributionControl` is not conditional on anything at runtime — it does exactly
what it says — it could not surface under a definition about runtime-conditional props.
It sat inside the audited component, one line from an audited prop, through a sweep of
that very file. Scope, not diligence, is what missed it.

| # | Site | Props | Measured on the rendered element | Verdict |
|---|---|---|---|---|
| **B′-1** | `MiniMap.jsx:257` + `:261` | `attributionControl={false}` on `<MapContainer>` vs `attribution='…'` on the child `<TileLayer>` | `.leaflet-control-attribution` count **0** (container present, `hasContainer: true`) at 1440 **and** 375 | **inert — prop removed** |
| B′-2 | `HomepageMiniMap.jsx:233` + `:236` | `attributionControl={true}` + `attribution` | count **1** | effective (the correct pattern; the fix copies its string byte-for-byte) |
| B′-3 | `MapComponent.jsx:576-578` | imperative `L.tileLayer(…, { attribution })`, no control suppressed | count **1** | effective |

**Measured before → after**, same probe, same build pipeline, only the prop differing —
so the probe is shown discriminating, not merely green (testing.md § "Every new guard
test must be shown failing"):

| Surface / viewport | before (prop present) | after (prop removed) |
|---|---|---|
| producer page @1440 | count `0`, text `null`, hrefs `[]` | count `1`, `"Leaflet \| © OpenStreetMap"`, hrefs `["https://leafletjs.com/", "https://www.openstreetmap.org/copyright"]` |
| producer page @375 | count `0`, `margin-bottom: null` | count `1`, `margin-bottom: 10px` |
| after SPA nav from `/map` @375 | count `0` | count `1`, `margin-bottom: 10px`, `--map-sheet-h` empty |

`11/11` checks pass after, `1/11` before — and the single "before" pass is the
navigation-type assertion, which is unrelated to the bug. Tiles render grey in these
captures: OSM tile egress is blocked from the CC sandbox (measured `HTTP 000`). The
attribution control is DOM, not a tile, so the measurement is unaffected.

**Why this one was not merely cosmetic.** Class A cost a dead hover ring and class B an
unimplemented `alt`. B′ served OSM tiles with no visible attribution — an ODbL and OSM
tile-usage-policy violation whose operational penalty is tile-blocking of the domain.

**Mechanical guard, not just a note:** `scripts/checks/map-attribution-guard.sh`, picked
up automatically by `scripts/checks/run-all.sh` under the required *Repo guards* job.
Shown failing by construction: reintroducing the prop reds it with
`VIOLATION frontend/components/MiniMap.jsx:257`.

> **Adjacent finding — surfaced here, closed in MEH-1636.** Leaflet's own default
> `margin-bottom` for this control is **`0`, not `10px`**:
> `.leaflet-container .leaflet-control-attribution { margin: 0 }` (`leaflet.css:413-417`)
> is equal in specificity to `.leaflet-bottom .leaflet-control { margin-bottom: 10px }`
> (`:166-168`) and comes later, so it wins. Measured: `0px` at 1440 (where our rule does
> not apply) and `10px` at 375 (where it does). The `10px` at 375 is therefore **our
> `globals.css` floor**, not a Leaflet default, and the sheet-closed state is **not**
> equivalent to having no rule at all.
>
> Four sites asserted the opposite in prose (row A-7 above, two sentences in
> `globals.css`, and `.claude/rules/rtl.md:99`). All four are corrected. Correcting prose
> with prose would only have re-minted the same unverifiable claim, so the fix is
> executable: **`frontend/__tests__/leaflet-attribution-default.test.js`** reads the
> installed `leaflet.css` on every run and asserts the four facts the conclusion rests on
> — both declared values, the source order, and the equal specificity. It is the single
> place this fact now lives; every corrected site points at it rather than restating it.

---

## Class C — assertions that cannot fail

Swept **103** `||` occurrences across 229 unit-test files, 31 e2e specs, 7 QA harnesses.
**5** sit in an assertion's pass condition. The question per instance: *can one side
alone carry the assertion past a broken state?*

| # | Site | Shape | Verdict |
|---|---|---|---|
| **C-1** | `qa-meh1611-map-focus.mjs:136` | `grayscaled && (fadedViaFilter \|\| fadedViaProp)` | **weak — fixed.** `fadedViaProp` alone satisfied the fade half, and a property-borne fade *is* the MEH-1611 regression |
| C-2, C-3 | `20-admin-recipes-queue.spec.ts:70,82` | `row.or(empty)` | **justified.** Documented at `:67`, paired with an explicit request assertion at `:81`; the claim really is "the queue rendered something". Tightening it would make a deliberately data-tolerant test brittle against variable seed data |
| C-4 | `ImageGalleryEmpty.test.jsx:79` | `expect(style.background \|\| "").toBe("")` | **safe.** Null-safe *read*, not a disjunction; a set background still fails |
| C-5 | `ProducerSectionsProducts.test.jsx:139` | `(getAttribute("src") \|\| "").includes(…)` | **safe.** Same null-safe-read shape |

### C-1: the proof needed a second attempt, and that is the lesson

The obvious construction — reintroduce the broken CSS in the app, rebuild, re-run —
turned the suite red (exit 1, six checks). Convincing, and **worthless as evidence for
this change**: the *old* OR form fails that same construction too (verified — also exit
1, same six).

The reason is the sampling window. By the time the probe reads, `fitBounds` has animated
and markercluster has rewritten the inline opacity back to `1`, so the pin reads as
not-faded under either form. That construction cannot discriminate between the two
classifiers, so it cannot justify replacing one with the other.

The discriminating proof is a **self-test**: inject three synthetic pins (filter-fade /
property-fade / plain) into the live pane and assert how the *real* classifier sorts
them.

| classifier | self-test | the property-fade pin |
|---|---|---|
| `&& fadedViaFilter` (now) | 4/4 pass, suite 24/24, exit 0 | correctly `full` |
| `&& (… \|\| fadedViaProp)` (before) | **FAIL**, exit 1 | **miscounted** as demoted (`demoted=2, full=1`) |

Precedent for shipping a self-test beside a checker: `.claude/scripts/audit-skills.sh --self-test`.

---

## The audit's own silent failure

The first no-op comparator hashed the before/after PNGs and reported `/map` as differing
at both widths. It was wrong: re-capturing the **same build twice** also produced
different hashes, and a pixel diff showed **0** differing pixels. The bytes differed only
in PNG encoding.

A hash answers *"are these files equal"*; the claim under test was *"does this render the
same"*. Wrong instrument — and precisely the mirror image of class C. An OR-assertion is a
**false negative** (passes a broken state); a hash-compare of rendered output is a **false
positive** (fails a correct one). Both are unfalsifiable-in-the-wrong-direction, and both
look rigorous.

Recorded because a report that only lists other people's measurement errors is not an
audit — and because the near-miss was one step from "the deletion changed rendering,
revert it", which would have been the wrong call for the right-looking reason.

---

## Related, deliberately out of scope

- **MEH-324 (TS migration)** — class B strengthens the argument for it but is **not
  solved** by it. `alt` is correctly typed; the failure is semantic.
- **Stryker / mutation testing** — the industrial version of "prove the assertion can
  fail". Sibling ticket, post-launch. Failing-by-construction is the manual form.
- **MEH-916 (axe)** — the existing precedent for "assert the effect, not the prop".
- **Marker-hover affordance** — see the A-10 note. Needs a design call.
- **`run()` in `qa-meh1611-map-focus.mjs` has no `try/finally`** around
  `browser.close()`, so a mid-assert throw leaks a Chromium until the process exits.
  `selfTest()` was given one when it was written (#2266); `run()` is pre-existing and
  was left alone, because widening an audit PR into unrelated cleanup is how audits
  stop being reviewable. Low stakes — these `qa-*.mjs` harnesses are run by hand, not
  by CI (`e2e.yml` runs `*.spec.ts`), so nothing leaks on a runner. Worth folding into
  the next edit of that file rather than its own ticket.
- **Producer-detail E2E fault** — three specs (`03`/`04`/`06`) failed across every PR in
  this batch with `#__next_error__`, while `staging` stayed green. Proven unrelated to
  these diffs by an inert-delta A/B (a comment-only commit flipped a passing suite red).
  Environmental; wants its own ticket.
