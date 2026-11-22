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


### Close buttons mirror to the inline-END — and the header must reserve the space (MEH-2038)

**A modal/tip/sheet close button goes at `end-*`, never `start-*`, and the
heading it floats over carries a matching `pe-*`.** This is mirroring, not
placement: an X in the LTR far corner sits at the *end* of the reading
direction, so its RTL twin is `end-`. A `start-` X lands on the first letters
of every Hebrew heading, and looks fine in an English review.

- Reserve `inset + button-width − card-padding` px, not by feel. Reference:
  `LocationModal.jsx` (`end-4` + `pe-10`).
- On a `text-center` panel reserve symmetrically (`px-*`) —
  `LoginPromptModal.jsx`.
- Tap target ≥ 44px (`w-11 h-11`, as `ShareButton.jsx`).

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
address suggestions:1010 → global header/nav (+ account dropdown, mobile chat launcher):1050 →
cookie banner:1100 → filter-sheet:1200 → Toaster (toast stack):2000 →
modals:9000 → interrupt modals:9500 → chat panel + desktop FAB / tooltips:9999 →
skip link:10000 → custom cursor dot:10001 (top of the scale, MEH-2300)
```

### The full live table (MEH-2093 chunk C · MEH-3169 names)

**Every z-index in `frontend/app` + `frontend/components` is a named token**
from the one `Z_INDEX` object in `frontend/tailwind.config.js`, used as a
Tailwind class `z-<name>` or, where a class cannot reach (`globals.css`, inline
`style`), as `var(--z-<name>)`. A new z-index = a new name in `Z_INDEX` plus a
row here, never a bracketed literal.

Held by `scripts/checks/z-index-tokens.sh` (Repo guards; the literal baseline
is empty and only shrinks) and `frontend/__tests__/ZTokenLedgerSync.test.js`
(every name used, every `var(--z-…)` defined, each row's value and occurrence
count **n** true). A table in sync is not evidence a value is right for its
context (MEH-2148). When writing prose about a token, spell it without
brackets (`z-1010`), or the sync test counts a phantom owner (MEH-2115).

| token | value | n | owner | what it is |
|---|---|---|---|---|
| `cursor` | 10001 | 1 | `app/globals.css` `.custom-cursor` | custom cursor dot — **top of the scale**, see below (MEH-2300) |
| `skip-link` | 10000 | 1 | `app/[locale]/layout.js` | skip-to-content link, on focus only |
| `tooltip` | 9999 | 3 | `components/ui/Tooltip.jsx` · `InfoTooltip.jsx` | tooltips |
| `chat` | 9999 | 2 | `components/ChatWidget.jsx` (inline style) | chat panel + DESKTOP launcher |
| `install-prompt` | 9997 | 1 | `components/InstallPrompt.jsx` | PWA install prompt |
| `modal-interrupt` | 9500 | 1 | `components/LoginPromptModal.jsx` | **interrupt modals** — must sit above an ordinary modal; 6 → 1 in MEH-3096, which moved the outreach dialogs and the group-buy cancel dialog onto the shared `ui/Dialog` (ordinary tier) |
| `modal` | 9000 | 7 | `components/ui/Dialog.jsx` · `LocationModal.jsx` · `Lightbox.jsx` | **ordinary modals.** MEH-2093 chunk B moved 14 dialogs here from `z-50`; the tier grew to 24 through MEH-2137 / 2435 / 2518 / 3043 and fell to 7 in MEH-3096, which moved the centred dialogs onto the one shared shell `components/ui/Dialog.jsx` |
| `toast` | 2000 | 1 | `components/Toaster.jsx` | toast stack — **below** both modal tiers, deliberately |
| `popover-sheet` | 1210 | 1 | `components/ui/Popover.jsx` | Popover mobile bottom sheet |
| `filter-sheet` | 1200 | 2 | `components/FilterSheet.jsx` | filter sheet scrim + sheet; portaled to `<body>` below lg (MEH-1075) |
| `popover-sheet-scrim` | 1200 | 1 | `components/ui/Popover.jsx` | Popover mobile sheet scrim |
| `alerts-sheet` | 1150 | 3 | `favorites/FavoritesClient.jsx` · `producer/[id]/components/ProducerHeader.jsx` | /favorites + business-page alerts sheet (MEH-2770: sheet + its scrim, scrim first so DOM order lifts the sheet) |
| `minimap-fullscreen` | 1150 | 1 | `components/MiniMap.jsx` | MiniMap fullscreen overlay — a sibling of the isolated map wrapper, so it ranks at the root |
| `cookie-banner` | 1100 | 1 | `components/CookieBanner.jsx` | cookie banner |
| `product-sheet` | 1060 | 1 | `components/public/ProductSheet.jsx` | product sheet |
| `header` | 1050 | 1 | `components/Header.jsx` | global sticky header — `sticky`+z ⇒ **its own stacking context** (MEH-1109: 1000 → 1050) |
| `chat-launcher-mobile` | 1050 | 1 | `components/ChatWidget.jsx` (inline style) | chat launcher below lg (MEH-2499): above BottomNav/BackToTop, below cookie banner / filter sheet / toasts / install prompt |
| `autocomplete` | 1010 | 3 | `components/AddressSearch.jsx` · `CitiesAutocomplete.jsx` · `CitySearch.jsx` | autocomplete / combobox suggestion lists. Above Leaflet panes (400), controls (1000) and attribution (1001); below the header. **AddressSearch:** MEH-2093 chunk A, fixing an observed clipping. **CitiesAutocomplete:** MEH-2102, *defensive alignment only*. **CitySearch:** MEH-2108, an observed occlusion — at 1000 it tied with the Leaflet controls and DOM order handed the band to the map |
| `account-sheet` | 1002 | 1 | `components/AccountSheet.jsx` | account sheet panel |
| `account-scrim` | 1001 | 1 | `components/AccountSheet.jsx` | account sheet overlay |
| `user-menu` | 1001 | 1 | `components/Header.jsx` | UserMenu dropdown — capped at the header's page-level tier |
| `map-attribution` | 1001 | 1 | `app/globals.css` `.leaflet-control-attribution` | Leaflet attribution — see the MEH-1365 note below; do not touch |
| `map-controls` | 1000 | 8 | `map/components/MapPane.jsx` · `MapKey.jsx` · `NearMePill.jsx` · `app/globals.css` (Leaflet zoom + corner controls) | map chrome. MapPane's top-centre stack (MEH-2148: ONE stack for the search-area pill and notices), its empty-state card and desktop GPS button; MapKey's "?" control and its panel (MEH-2424, same token on purpose, rendered last so DOM order lifts it). MiniMap's buttons are NOT here: MEH-2148 close-out took them off the page scale (local `z-10` inside an `isolate` wrapper) after they were measured painting over the producer page's sticky contact bar |
| `bottom-nav` | 1000 | 1 | `components/BottomNav.jsx` | mobile BottomNav pill |
| `back-to-top` | 1000 | 1 | `components/BackToTop.jsx` | back-to-top button |
| `hero-suggestions` | 1000 | 2 | `components/HeroSearch.jsx` | home hero search dropdowns |
| `map-legend` | 800 | 1 | `map/components/MapPane.jsx` | /map desktop legend |
| `row-menu` | 800 | 1 | `components/admin/AdminRowMenu.jsx` | admin table row menu |
| `popover` | 800 | 2 | `components/ui/Popover.jsx` | Popover desktop panel (fixed and absolute forms) |
| `map-sheet` | 600 | 1 | `components/MapBottomSheet.jsx` | map bottom sheet |
| `sticky-bar` | 598 | 3 | `producer/[id]/components/StickyContactBar.jsx` · `components/RegistrationOverlays.jsx` · `components/public/OrderBar.jsx` | sticky contact bar — just under the sheet; MEH-3043 the event / workshop sign-up bar, same tier (it sits above the BottomNav pill spatially, not by z); MEH-3216 the order bar, which takes the contact bar's place once a product is picked |
| `map-picked-card` | 598 | 1 | `map/components/MobileSheetSelectedCard.jsx` | phone map: picked-business card above the sheet's top edge — under the sheet (600) so a dragged sheet covers it, above the markers (400) (MEH-3119) |
| `dev-badge` | 2 | 1 | `app/[locale]/dev/components/page.jsx` | dev playground card badge |
| `decor` | 1 | 2 | `about/AboutClient.jsx` · `about/process/AboutProcessClient.jsx` | decorative texture overlay |

Counts are occurrence counts, not file counts; the number of rows is derived by
the sync test, never written here.

**The custom cursor dot sits above every row** (10001): the native pointer is
hidden site-wide, so an overlay that ties the dot leaves no pointer at all
(MEH-2300). `__tests__/CustomCursorZOrder.test.js` holds it; a new value at or
above 10001 reds it — raise the cursor with it.

### Modal overlays are portalled to `<body>` — a z token only ranks at the root

**A `fixed inset-0` modal overlay is portalled to `<body>`.** Inside an
ancestor stacking context (`position`+z, `transform`, `opacity < 1`, `filter`,
`contain`, `isolation`, `position: sticky`) its token competes only with that
context's children, so raising the number cannot fix it. Whether a modal is
trapped depends on runtime ancestors: measure with
`qa-meh-2215-stacking-probe.mjs` (deleted, see `docs/media-archive.md`) before claiming either way, and over
the Header pair the hit test with the luma read (`Header.jsx` is
`pointer-events-none`, so a hit test alone has two causes).

**Grep `--z-` too:** inline `var(--z-chat)` and `globals.css` declarations carry
no `z-<name>` class, and a bare `z-50` / `z-10` is Tailwind's own scale.

Code is the source of truth; this ledger mirrors it — update the table when a
component's z-index changes. Bottom sheets always sit below map controls.

**Leaflet attribution (z-1001) vs bottom-sheet (z-600) — resolved spatially,
not by z-index (MEH-1365).** The attribution must stay visible (ODbL) and above
the header. Below 1024px it rides the sheet's top edge via
`margin-bottom: max(calc(var(--map-sheet-h, 0vh) + 6px), 10px)` in
`globals.css` (`!important`; the 10px floor is ours, MEH-1636, held by
`frontend/__tests__/leaflet-attribution-default.test.js`). Overlap in that
corner → adjust geometry, never z-index.

### Floating-elements corner ownership (MEH-1135)

Floating elements use **logical props only** (`insetInlineStart` /
`insetInlineEnd`, `start-*` / `end-*`). **The bottom-end corner belongs to the
chat FAB** (`ChatWidget.jsx`); a new bottom-corner float clears it on the
**vertical** axis. **On `/map`** the FAB is off (MEH-1180) and that corner is
`NearMePill.jsx`'s (MEH-1194).

---

## Known RTL bug patterns (cross-ref [docs/BUG_PATTERNS.md](../../docs/BUG_PATTERNS.md))

- **RTL eye toggle** — password inputs use `dir="ltr"`; toggle must be
  `right-3` (physical), never `left-3`. Live in `/login` + `/register`.
- **Leaflet tooltip z-index** — must be `500` (between markers:400 and
  bottom-sheet:600). See Map z-index tokens above.

---

## RTL allowlist — single source of truth (MEH-365 / MEH-426)

`.claude/hooks/rtl-allowlist.txt` is the **single source of truth** for RTL
exceptions, read by `check-rtl.sh` (PreToolUse hook, one edit at a time), the
`verify-frontend` agent and `scripts/checks/rtl-logical-props-guard.sh`
(MEH-3351, Repo guards — the only one that sees the whole committed tree). The
guard copies the hook's pattern, so **widening the pattern is a change to the
hook**. The guard strips comments first, so prose like "right-aligned" is not a
class.

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
