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
global header/nav (+ account dropdown):1050 →
cookie banner:1100 → filter-sheet:1200 → Toaster (toast stack):2000 → chat FAB:9999
```

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
