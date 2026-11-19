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

**Reference implementation: `LocationModal.jsx` (MEH-2038)** — the close button at
`end-4` (16→60px from the card edge) *and* `pe-10` on the heading + subtitle (on every width since MEH-3271) (16 + 44 − 24 = 36px needed, 40px reserved).
The earlier reference, `OnboardingTip.jsx` (`top-0 end-0 w-11 h-11` + `pe-8`, MEH-1687: 0 + 44 − 16 = 28px needed, 32px reserved),
left with the coach-mark tour in MEH-2394. `Lightbox.jsx:156` (`top-4 end-4`) is the
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
address suggestions:1010 → global header/nav (+ account dropdown, mobile chat launcher):1050 →
cookie banner:1100 → filter-sheet:1200 → Toaster (toast stack):2000 →
modals:9000 → interrupt modals:9500 → chat panel + desktop FAB / tooltips:9999 →
skip link:10000 → custom cursor dot:10001 (top of the scale, MEH-2300)
```

### The full live table (MEH-2093 chunk C · MEH-3169 names)

**Every z-index in `frontend/app` + `frontend/components` is a named token.**
MEH-3169 replaced each literal with a name from the one `Z_INDEX` object in
`frontend/tailwind.config.js`. The value of each name is the literal it
replaced, so nothing moved on screen. A name is used two ways:

- a **Tailwind class** `z-<name>` (e.g. `z-modal`, `focus:z-skip-link`), and
- a **CSS custom property** `var(--z-<name>)`, which the config's
  `zIndexVariables` plugin emits on `:root` for every name. Use it where a class
  cannot reach: `globals.css` declarations (Leaflet controls, attribution, the
  custom cursor) and inline `style` objects (ChatWidget).

When one number serves two roles, it has two names (598, 800, 1000, 1001, 1050,
1150, 1200, 9999). A new z-index = a new name in `Z_INDEX` plus a row here,
never a bracketed literal.

The chain above is the mental model; this table is the inventory. It is
**documentation of a machine-checked contract, not the contract**: the gate is
`scripts/checks/z-index-tokens.sh` (MEH-2228), which freezes every literal
z-index left in `frontend/` (Tailwind bracket values, CSS `z-index: N`, inline
`zIndex: N`) occurrence by occurrence in `scripts/checks/z-index-baseline.txt`,
and reds the required *Repo guards* job on any literal not in that file, or any
baseline line that no longer matches (the file can only shrink). After MEH-3169
the baseline is empty (0 lines). A new literal therefore needs
`--update-baseline` **and a reason in the PR body**; a new token needs a row
here. `frontend/__tests__/ZTokenLedgerSync.test.js` checks the scale, the code
and these rows against each other: every name in the scale is used, every
`var(--z-…)` is defined, every row's **value** is the scale's and every row's
**n** is the real occurrence count (classes + properties). A table in sync is
still not evidence a value is right for its context (MEH-2148: MiniMap's 1000
token was recorded correctly for months while painting over a CTA), which is why
the gate sits in front of it.

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

**The custom cursor dot sits above every row.** `.custom-cursor` in
`app/globals.css` is `z-index: var(--z-cursor)` (10001). It must be **strictly**
above everything fixed: the native pointer is hidden site-wide
(`.custom-cursor-on *{cursor:none}`), so any overlay that ties or beats the dot
leaves no pointer at all over that overlay. That is exactly MEH-2300 — at 9999 it
tied the chat panel and lost on DOM order.
`__tests__/CustomCursorZOrder.test.js` resolves the names through
`tailwind.config.js` and asserts the cursor stays above ChatWidget's inline
values and every z class in the app, and that `pointer-events: none` stays. A
new value at or above 10001 therefore reds that test — raise the cursor with it.

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
`style={{ zIndex: "var(--z-chat)" }}` (ChatWidget) and a `globals.css`
declaration carry no `z-<name>` class, and a bare Tailwind `z-50` / `z-10` is
Tailwind's own scale, not one of ours. A z-index audit that only greps for
`z-<name>` classes misses the first; grep `--z-` too.

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
exceptions. All three enforcement tools read from it:

- `check-rtl.sh` (PreToolUse hook) — blocks edits to non-allowlisted files
  containing physical RTL classes unless every violation is annotated within
  ±1 line of an inline marker.
- `verify-frontend` agent — static scan reports violations not covered by
  a path exception or an inline marker (±1 adjacency).
- `scripts/checks/rtl-logical-props-guard.sh` (MEH-3351) — the CI gate, under
  the required *Repo guards* job. It copies the hook's pattern and both
  exception routes and reads this file, so it cannot disagree with the hook
  about what counts or what is exempt. It is the only one of the three that
  sees the **whole committed tree**: the hook sees one edit at a time and only
  through Claude Code's Edit/Write, so a physical class from a commit made
  outside Claude Code, a session with hooks off, a merge or a `git apply` used
  to land with nothing red.
  **Widening the pattern is a change to the hook, not to the guard** — the
  guard follows it automatically.
  It differs from the hook in one way only, and the difference is not a rule
  change: comments are stripped across lines before matching, because
  `\b(right-)[0-9a-z]` matches the English words "left-to-right" and
  "right-aligned", and prose is not a class.

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
