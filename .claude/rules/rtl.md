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

# RTL rules

Hebrew is RTL. Every positional class, every map layer, every password
input has to be thought through — physical left/right don't mean what
they look like on an RTL page.

---

## Logical properties — never use physical directional classes

Use logical properties:

- `start-*` / `end-*` instead of `left-*` / `right-*`
- `ms-*` / `me-*` instead of `ml-*` / `mr-*`
- `ps-*` / `pe-*` instead of `pl-*` / `pr-*`

When adding ANY positional class, ask: **is this directional?** If yes,
use the logical equivalent.

### Which physical side does each resolve to? (RTL)

The whole site is `dir="rtl"` (set at the layout root), so logical
properties flip relative to a default LTR page:

- `start-*` → **right** · `end-*` → **left**
- `ms-*` → margin-right · `me-*` → margin-left
- `ps-*` → padding-right · `pe-*` → padding-left

So **"primary action on the RIGHT in RTL" = `start-*`, NOT `end-*`.** The
common slip is reading `end-` as "the end = the right side" — in RTL the
*end* is the **left**. When unsure, picture the text flow: it **starts on
the right** and **ends on the left**.

_Source: 2026-06-25 /map UX batch — an orchestrator instruction specified
`end-` for a right-aligned control; CC caught that `end-` resolves to the
left in RTL and corrected it to `start-`. (meta-patterns.md §1 — verify
orchestrator claims.)_

### Close buttons mirror to the inline-END — and the header must reserve the space (MEH-2038)

**A modal/tip/sheet close button goes at `end-*`, never `start-*`, and the
heading it floats over carries a matching `pe-*`.** Both halves are required:
the position stops the collision, the padding stops it coming back the first
time someone writes a longer title.

**Why `end-`, when the section above warns against exactly that reflex.** These
are not in tension, and the distinction is the whole rule. The warning above is
about *where a control should sit* — "primary action on the right" is a
placement decision, and in RTL right is `start-`. This rule is about
*mirroring*: an X that sits top-right in LTR sits there because that is the
**end** of the reading direction, so its RTL counterpart is top-**left** =
`end-`. Ask which one you are doing. If the answer is "the LTR design puts it
in the far corner", you are mirroring, and the logical property carries the
mirror for free.

**The failure mode is specific to RTL and invisible in LTR review.** `start-*`
is where Hebrew text *begins*, so a `start-` close button lands on the first
characters of every heading — the one position guaranteed to collide. The same
component reviewed in English looks fine, because there `start-` is the empty
left margin.

**Reference implementation: `OnboardingTip.jsx:50,55`** — `top-2 end-3` on the
button *and* `pe-5` on the paragraph. `Lightbox.jsx:156` (`top-4 end-4`) is the
position half.

**Reserving the space is arithmetic, not a guess:** the button is absolutely
positioned against the *card*, the text sits inside the card's padding, so the
overlap is `inset + button-width − card-padding`. Pad past that, not by feel.

**On a `text-center` panel, reserve symmetrically (`px-*`).** A one-sided `pe-*`
shifts the heading off its centre while the body copy below stays centred —
trading a collision for a misalignment. `LoginPromptModal.jsx:113` is the worked
case.

**Tap target ≥ 44px** on any such button (`w-11 h-11`) — `ShareButton.jsx` is
the house size. A 32px control is under the standard the rest of the repo meets.

_Source: MEH-2038 (2026-08-12) — three modals shipped with `start-*` close
buttons. `LocationModal.jsx` visibly covered its own `<h2>`; `LoginPromptModal`
escaped only because its content is centred; `KashrutBadgeStrip`'s CertModal had
the collision hand-patched with a magic `mt-6` on the image instead of being
fixed at the button._

### Intentional physical-property exceptions (keep as-is, add `// rtl-ok` comment)

- Eye-toggle buttons inside `dir="ltr"` password inputs (`right-3`)
- Carousel prev/next arrows
- `left-1/2 -translate-x-1/2` horizontal-center idiom
- `pr-11 pl-4` password-input padding pair
- Map geographic controls (zoom, locate)

Each exception exists because the surrounding element is `dir="ltr"` or
the property is logically symmetric (horizontal center). Outside these
cases, always use logical properties.

---

## Map z-index tokens (do not use arbitrary values on `/map`)

```
tiles:0 → markers:400 → tooltips:500 → bottom-sheet:600 →
legend:800 → controls/zoom/search:1000 → BottomNav pill:1000 →
address suggestions:1010 → global header/nav (+ account dropdown):1050 →
cookie banner:1100 → filter-sheet:1200 → Toaster (toast stack):2000 →
modals:9000 → interrupt modals:9500 → chat FAB / tooltips:9999
```

### The full live table (MEH-2093 chunk C)

**Every `z-[N]` that appears in a className under `frontend/app` +
`frontend/components`.** The chain above is the mental model; this is the
inventory. It is **documentation of a machine-checked contract, not the
contract**: the gate is `scripts/checks/z-index-tokens.sh` (MEH-2228), which
freezes every literal z-index in `frontend/` — Tailwind `z-[N]`, CSS `z-index:
N`, inline `zIndex: N` — occurrence by occurrence in
`scripts/checks/z-index-baseline.txt` and reds the required *Repo guards* job on
any literal not in that file, or any baseline line that no longer matches (the
file can only shrink). A new z value therefore needs `--update-baseline` **and
a reason in the PR body** before it can land; this table then records it.
`frontend/__tests__/ZTokenLedgerSync.test.js` keeps the rows below in sync with
the code in both directions, so "mirrors it" stays mechanically true — but a
table that is in sync is not evidence a value is right for its context
(MEH-2148: MiniMap's `z-[1000]` was recorded correctly for months while painting
over a CTA), which is why the gate sits in front of it.

| token | n | representative owner | what it is |
|---|---|---|---|
| `z-[10000]` | 1 | `app/[locale]/layout.js:231` | skip-to-content link, on focus only |
| `z-[9999]` | 3 | `components/ui/Tooltip.jsx:148` · `InfoTooltip.jsx:64` | tooltips. ChatWidget's FAB shares the value via inline `zIndex: 9999` (`ChatWidget.jsx:212,220`) — not a Tailwind token, so a grep for `z-[9999]` misses it |
| `z-[9997]` | 1 | `components/InstallPrompt.jsx:97` | PWA install prompt |
| `z-[9500]` | 6 | `components/LoginPromptModal.jsx:85` | **interrupt modals** — must sit above an ordinary modal |
| `z-[9000]` | 20 | `components/LocationModal.jsx:156` | **ordinary modals.** MEH-2093 chunk B moved 14 dialogs here from `z-50`; 20 → 21 in MEH-2137 chunk 3, which replaced a native `window.confirm` on the duplicate-product-name path with a real dialog beside `ProductsSection`'s existing delete-confirm; back to 20 in MEH-2209, which merged the admin producer reject + request-changes modals into one `ProducerDecisionModal` |
| `z-[2000]` | 1 | `components/Toaster.jsx:54` | toast stack — **below** both modal tiers, deliberately |
| `z-[1210]` | 2 | `components/ui/Popover.jsx:321` | Popover mobile bottom sheet |
| `z-[1200]` | 3 | `components/FilterSheet.jsx:200` | filter sheet; portaled to `<body>` below lg |
| `z-[1150]` | 2 | `components/MiniMap.jsx:531` · `FavoritesClient.jsx:76` | MiniMap fullscreen |
| `z-[1100]` | 1 | `components/CookieBanner.jsx:72` | cookie banner |
| `z-[1060]` | 1 | `components/public/ProductSheet.jsx:359` | product sheet |
| `z-[1050]` | 2 | `components/Header.jsx:321` | global sticky header — `sticky`+z ⇒ **its own stacking context** |
| `z-[1010]` | 3 | `components/AddressSearch.jsx:266` · `components/CitiesAutocomplete.jsx:273` · `components/CitySearch.jsx:206` | autocomplete / combobox suggestion lists. Above Leaflet panes (400), controls (1000) and attribution (1001); below the header. **AddressSearch:** MEH-2093 chunk A, fixing an observed clipping. **CitiesAutocomplete:** MEH-2102, *defensive alignment only* — measured 16/08, no current consumer places a map where that list can reach it. **CitySearch:** MEH-2108, an observed occlusion — at 1000 it tied with the Leaflet controls *and* the MiniMap fullscreen button (`MiniMap.jsx:56`), and DOM order handed the band to the map (9 of 15 hit-test samples inside the 72px band were painted by map chrome; 0 after) |
| `z-[1002]` | 1 | `components/AccountSheet.jsx:125` | account sheet panel |
| `z-[1001]` | 2 | `components/AccountSheet.jsx:114` · `Header.jsx` | account sheet overlay + UserMenu dropdown |
| `z-[1000]` | 11 | `components/BottomNav.jsx:359` · `map/components/NearMePill.jsx:62` | BottomNav pill + map controls. Was 14 until MEH-2108 moved `CitySearch.jsx:206` up to 1010; 13 → 12 in MEH-2148, which merged MapPane's two top-centre overlays (the search-area pill and the pickup-layer notice) into ONE `z-[1000]` stack — see the MEH-1187 one-corner-one-job note there; **12 → 11 in MEH-2148 close-out**, which took `MiniMap.jsx`'s shared map-button token OFF the page scale entirely (`z-[1000]` → local `z-10`) after it was measured painting over the producer page's `z-[598]` StickyContactBar at 88.5% of the bar width. Its two buttons now rely on a stacking context each — the inline wrapper carries `isolate`, the fullscreen overlay is `z-[1150]` — so neither appears in this table any more |
| `z-[900]` | 2 | `components/OnboardingTip.jsx:39` | onboarding tip |
| `z-[800]` | 4 | `map/components/MapPane.jsx:238` · `AdminRowMenu.jsx` | map legend, admin row menu |
| `z-[600]` | 1 | `components/MapBottomSheet.jsx:122` | map bottom sheet |
| `z-[598]` | 1 | `producer/[id]/components/StickyContactBar.jsx:71` | sticky contact bar — just under the sheet |
| `z-[2]` | 1 | `app/[locale]/dev/components/page.jsx:154` | dev playground |
| `z-[1]` | 2 | `app/[locale]/about/AboutClient.jsx:624` | decorative layering |

**22 live tokens.** Counts are occurrence counts, not file counts.

### Modal overlays are portalled to `<body>` — a z token only ranks at the root

**A `fixed inset-0` modal overlay is portalled to `<body>`; a z token is only
meaningful at the root stacking context.** A modal rendered in place inherits
whatever its mount point's ancestors impose, and `position` + a z-index (or
`transform`, `opacity < 1`, `filter`, `contain`, `isolation`, and — per CSSWG
2023 — `position: sticky`) makes any of them a stacking context. Inside one, the
overlay's `z-[9500]` competes only with that context's own children, so a *lower*
root-level token wins on screen. **Raising the number is not the fix and cannot
be**: a bigger value inside a capped context is still capped.

Measured, not reasoned: `frontend/qa-meh-2215-stacking-probe.mjs` walks an
overlay's ancestors for every context-creating property, hit-tests the Header and
the /producer tab bar, and samples pixel luma off the captured frames. It ships
with a chain-walker self-test (four cases with known answers, one lifted from a
real repo file) and a per-capture luma control, both run before any row is
printed. Re-run it before claiming any modal is or is not trapped — the answer
depends on ancestors at runtime, so no grep can produce it.

**As of 29/08 exactly one modal was trapped** (`LoginPromptModal`, inside
ImageGallery's `absolute … z-20` overlay wrapper, both gallery arms); the other
seven measured chain-clean to `<html>` and were left byte-identical. That is an
as-of, not a standing property: a new mount point re-opens the question.

**`elementFromPoint` alone cannot settle it over the Header.** `Header.jsx:321`
is `pointer-events-none`, so that band is never returned by a hit test whether or
not it paints on top — a green there has two causes. Pair it with the luma read,
and note the mirror trap: once a modal is portalled, its own opaque card may be
what sits over the sample point, so a near-zero luma delta there is not by itself
evidence of a trap either. Name the element; do not infer it.

> **`z-[50]` is gone as of MEH-2115, and the row it leaves behind is instructive.**
> The row read **n=2** while only ONE line was a real className
> (`MapClient.jsx:770`); the other, `:769`, was the tail of a `{/* … */}` block
> whose text happens to contain the token. `isComment()` in
> `__tests__/ZTokenLedgerSync.test.js:27-29` only recognises a line that *starts*
> with `*`, `//`, `/*` or `{/*` — a continuation line of a block comment starts
> with prose, so it counts as live. **The ledger and the guard agreed with each
> other and both disagreed with reality.** Consequence when writing prose about a
> token: spell it without brackets (`z-1010`, not the bracketed form) unless the
> line starts with a comment marker, or you add a phantom owner to that row. The
> MEH-2115 comment at `MapClient.jsx:770` is written that way and says so.
>
> The bar itself now carries **no** z token by design — see that comment: it must
> not create a stacking context, because doing so imprisoned the CitySearch
> suggestion list rendered inside it (measured 3/3 occluded; 0/3 after).

> **`z-[9998]` is NOT in this table on purpose.** It appears exactly once in the
> repo — a prose comment at `map/components/CityPickerModal.jsx:16` calling it
> "the cookie token". The cookie banner is `z-[1100]` and has been for some time,
> so that comment is stale and `9998` is live nowhere. Recorded here so the next
> reader who greps `z-[9998]` and finds a hit does not add a row for a value that
> does not exist. The guard counts className occurrences, not comments, which is
> why it does not demand a row for it.

**Two ways a grep undercounts this table, both load-bearing:** an inline
`style={{ zIndex: N }}` (ChatWidget) carries no Tailwind token at all, and a bare
Tailwind `z-50` / `z-10` is not an arbitrary value so `z-\[` never matches it. A
z-index audit that only greps `z-\[[0-9]+\]` will miss both.

Code is the source of truth; this ledger mirrors it — update the table
when a component's z-index changes (grep'd MEH-861: `BottomNav.jsx:152`
`z-[1000]`, `CookieBanner.jsx:68` `z-[1100]`, `ChatWidget.jsx`
`zIndex: 9999`; MEH-1135: `Toaster.jsx:36` `z-[2000]` — the toast stack
sat above filter-sheet/cookie but was previously unrecorded in this
ledger; and the chat FAB moved from physical `right` to logical
`insetInlineEnd` (launcher + panel), so it now owns the bottom-END corner
per locale — z unchanged at 9999; MEH-1075: `FilterSheet.jsx` `z-[1200]` — above
controls/cookie, below chat; portaled to `<body>` below lg; MEH-1109:
the global `Header.jsx:213` `<header>` moved `z-[1000]` → `z-[1050]` —
`sticky`+`z-index` makes it a stacking context, so the UserMenu dropdown
(`Header.jsx` `z-[1001]`) is capped at the header's page-level tier; at
1000 the later-in-DOM map "חפש באזור זה" pill won the tie-break and
covered the open dropdown. 1050 sits above map controls:1000, below
cookie:1100).

Bottom sheets must ALWAYS sit below map controls. See `globals.css` for
CSS overrides and `MapClient.jsx` for the Tailwind classes that reference
these tokens.

**Leaflet attribution (z-1001) vs bottom-sheet (z-600) — resolved spatially,
not by z-index (MEH-1365).** The attribution must stay legally visible (ODbL)
AND above the header (the MEH-15/30 loop: z-1 → header covered it → z-1001 →
it covered the sheet). Do not touch either z value: on <1024px the attribution
now rides the sheet's live top edge via
`margin-bottom: max(calc(var(--map-sheet-h, 0vh) + 6px), 10px)` (globals.css,
`!important` to outrank Leaflet's own
`.leaflet-container .leaflet-control-attribution { margin: 0 }`). Any future
overlap in that corner → adjust geometry, never z-index.

**The 10px floor is ours, not a Leaflet default (MEH-1636).** Leaflet ships two
competing rules of equal specificity and the later one wins, so its effective
default for this control is `margin: 0` — which is why the `!important` above
names that rule and not `.leaflet-bottom .leaflet-control`. Don't take this
paragraph's word for it: `frontend/__tests__/leaflet-attribution-default.test.js`
reads the installed `leaflet.css` and reds if the cascade ever shifts.

### Floating-elements corner ownership (MEH-1135)

Floating elements position with **logical props only** (`insetInlineStart` /
`insetInlineEnd`, `start-*` / `end-*`) — never physical `right` / `left`. **The
bottom-end corner belongs to the chat FAB** (`ChatWidget.jsx`, `insetInlineEnd`).
A physical-`right` FAB caused three repeat collisions with logical `start-*`/`end-*`
floats (MEH-979 · MEH-970 · MEH-1133) because in RTL physical-right == the inline
start; MEH-1135 made the FAB logical so the whole system shares one axis. Any new
bottom-corner float must clear the FAB's corner (or the near-me pill's) on the
**vertical** axis rather than contend for the same horizontal edge.

**Exception — `/map`:** the chat FAB is pathname-gated OFF `/map` (MEH-1180), so
the bottom-END corner there is free and is owned by `NearMePill.jsx` (circular
near-me icon button, `end-4`, MEH-1194). A new float on `/map` contends with the
near-me pill (and the search-this-area pill), NOT the FAB.

---

## Known RTL bug patterns (cross-ref [docs/BUG_PATTERNS.md](../../docs/BUG_PATTERNS.md))

- **RTL eye toggle** — password inputs use `dir="ltr"`; toggle must be
  `right-3` (physical), never `left-3`. Live in `/login` + `/register`.
- **Leaflet tooltip z-index** — must be `500` (between markers:400 and
  bottom-sheet:600). See Map z-index tokens above.

---

## RTL allowlist — single source of truth (MEH-365 / MEH-426)

`.claude/hooks/rtl-allowlist.txt` is the **single source of truth** for RTL
exceptions. Both enforcement tools read from it:

- `check-rtl.sh` (PreToolUse hook) — blocks edits to non-allowlisted files
  containing physical RTL classes unless every violation is annotated within
  ±1 line of an inline marker.
- `verify-frontend` agent — static scan reports violations not covered by
  a path exception or an inline marker (±1 adjacency).

### Two sections in the allowlist

```
# ============ PATH EXCEPTIONS ============
# Files where physical properties are justified (entire file exempt).
frontend/app/map/MapClient.jsx
...

# ============ CONTENT PATTERNS ============
# Inline annotation markers (suppress individual violations within ±1 line).
rtl-ok
```

Both consumers parse the file with the same awk state-machine (look for
`# === PATH EXCEPTIONS` / `# === CONTENT PATTERNS` headers, skip comments
and blank lines, route entries by section). No blank lines anywhere — `grep
-v -f` treats them as match-everything patterns.

### Inline `rtl-ok` annotation

Add `rtl-ok` on the same line as a physical class, or either adjacent line
(±1), to suppress a single violation without exempting the whole file:

```jsx
{/* rtl-ok */}
<div className="left-1/2 -translate-x-1/2">   {/* horizontal center — direction-neutral */}
```

Both tools enforce the same ±1 window. A new physical exception that is
not direction-neutral → add the file to PATH EXCEPTIONS instead of using
inline annotation.
