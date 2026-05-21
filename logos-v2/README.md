# Mehamakor — Logo v2 · 5 graphic-mark + wordmark concepts

Five **combination-mark** explorations (abstract graphic mark + Latin
wordmark "Mehamakor") + one wordmark-only concept. Pivot from the v1
Hebrew-custom-typography direction (`/logos/`) — that approach proved
unfeasible because true Hebrew letterform customization requires single-
path glyph drawing, not text + overlay tricks. v2 lets a graphic mark
carry the identity, with the Latin wordmark sitting below or beside.

## Files

```
logos-v2/
├── concept-1-circle-of-producers/
│   ├── horizontal.svg     · primary lockup (mark + wordmark + taglines)
│   ├── icon.svg           · mark only, square, transparent background
│   ├── wordmark.svg       · text-only fallback
│   └── monochrome.svg     · single-color version (no accent)
├── concept-2-open-vessel/         (same 4 files)
├── concept-3-origin-point/        (same 4 files)
├── concept-4-pure-wordmark/       (same 4 files)
├── concept-5-wordmark-dots/       (same 4 files)
├── preview.html           · side-by-side viewer · light/dark · favicon strip · app-icon previews
└── README.md              · this file
```

Open `logos-v2/preview.html` in a browser to compare all 5 concepts.

## Concept rationale (one paragraph each)

### Concept 1 — Circle of Producers
**Signature element:** a ring of 8 small dots with one accent dot in
burnt orange. The accent dot reads as an individual within a community
— mapped to mehamakor.online's premise of curating small Israeli food
businesses. **Mood:** quietly communal, geometric, editorial. The mark
is geometric enough to read at 16px (8 dots stay distinct), and the one
colored dot becomes a recurring brand device that can show up elsewhere
(section dividers, social posts).

### Concept 2 — Open Vessel
**Signature element:** an open semicircle (bowl) with a flat rim line
and a single accent dot above — a "source drop" entering the vessel.
**Mood:** generous, holding, ritual without religion. The vessel
metaphor maps directly to "directory that holds and presents." Risk:
at 16px the rim line may merge with the bowl curve and read as a single
shape; the dot above stays distinct and carries most of the recognition
weight.

### Concept 3 — Origin Point
**Signature element:** a filled center dot in mustard gold with 4–5
short rays radiating outward. **Asymmetry is intentional** — the rays
are deliberately uneven so the mark reads as organic growth from a
single source, not a symmetrical sun/star/burst. **Mood:** confident,
quietly modern, suggesting a starting point. The asymmetry is what
keeps this out of "tech-startup origin/burst" territory.

### Concept 4 — Pure Wordmark with Custom Detail
**Signature element:** no separate mark. The second "o" in "Mehamakor"
is replaced with a filled colored circle in burnt orange. The dot
becomes the brand's signature mark — recoverable for favicon use as a
standalone element. **Mood:** Aesop/Hearst restraint; typography
carries everything. **Caveat:** the dot's positioning is tuned to
Cormorant Garamond at font-size 84; if a fallback serif renders, the
dot will sit slightly off the baseline and may need re-tuning.

### Concept 5 — Wordmark + Dot System
**Signature element:** three dots in burnt orange, mustard gold, and
deep green positioned above the wordmark. **Mood:** publication-style,
playful but restrained, reusable. The three colors are not symbolic
(no flag, no tricolor reading) — they're a palette anchor. The dots
function as punctuation-as-identity: they can appear on the homepage
hero, social profile photos, or as a chapter marker in editorial
content without the wordmark.

## Design tokens used

| Token | Hex | Used in |
|---|---|---|
| Deep green (primary) | `#2E6853` | wordmark + most marks (light bg) |
| Cream (background) | `#F5F0E8` | light-mode background |
| Burnt orange (accent) | `#C8632E` | concept 1 producer dot, concept 4 signature dot, concept 5 first dot |
| Mustard gold (accent) | `#C99846` | concept 3 origin dot, concept 5 second dot, dark-mode accent in concepts 1/2 |
| Warm cream (light fg in dark mode) | `#F5F0E8` | dark-mode foreground |
| Warm black (dark bg) | `#1A1A1A` | dark-mode background |

Each SVG includes a `@media (prefers-color-scheme: dark)` block that
flips the foreground/background tokens automatically.

## Typography

- **Wordmark:** `Cormorant Garamond` (weight 500) with serif fallback
  (`EB Garamond, Georgia, serif`). Letter-spacing `0.025em` for the
  refined editorial feel. Concept 4's signature dot is tuned to this
  font's "o" position.
- **Micro-tagline:** `DM Sans` (weight 500), `letter-spacing 0.22em`,
  `opacity 0.62` — `LOCAL FOOD · REAL PRODUCERS · ISRAEL`.
- **Hebrew tagline:** `Frank Ruhl Libre` (weight 500) with Noto Serif
  Hebrew fallback, `opacity 0.55` — `מהמקור`. Positioned below the
  English wordmark, smaller, as a quiet bilingual anchor (not a
  primary brand element).
- **No embedded font files** in the SVGs. All fonts declared via
  `font-family` with system-serif/sans fallbacks. The HTML preview
  `@import`s the three fonts from Google Fonts for accurate rendering.

## File-size budget

All 20 SVGs are 718–1974 bytes (budget was 5KB per file). Plenty of
headroom for the production cut to add explicit glyph paths if the
wordmark is converted to outlines.

## Verification I performed

- All 20 SVGs parse as valid XML
- All 20 SVGs are well under 5KB
- All 5 icon files have transparent backgrounds (no `<rect class="bg">`)
  so the app-icon green frame and favicon strip light frame both show
  through correctly
- All 5 horizontal lockups include the brand wordmark + micro-tagline
  + Hebrew anchor, with correct accent dot color per concept

## Verification I could NOT perform (sandbox limit)

- I cannot open a browser in this sandbox to visually confirm:
  - The light/dark panels render with correct brand colors
  - The favicon strip is legible at 16px for each concept
  - Each concept's mark reads as distinct (not just color variations)
  - The monochrome versions still carry brand identity
- All four of these need to be verified by you opening
  `logos-v2/preview.html` locally.

## Notes on the light/dark panels in preview.html

The HTML preview shows each concept's horizontal lockup in two side-
by-side panels (light + dark). Each panel sets `color-scheme: light`
or `color-scheme: dark` in CSS — modern browsers (Chrome / Safari /
Firefox 2024+) propagate this to `<object>`-embedded SVGs, which fires
the SVG's own `@media (prefers-color-scheme: dark)` block and gets
exact brand colors. If you see both panels rendering identically, your
browser may not be propagating `color-scheme` — in that case, toggle
your OS appearance to dark mode and reload; the "dark" panel will
match.

## Concept-distinctness check

Each concept's mark uses a categorically different shape vocabulary:
- C1: **multiple dots arranged in a ring**
- C2: **arc + flat line + single dot**
- C3: **radiating lines from a center dot**
- C4: **no separate mark — wordmark with embedded dot**
- C5: **three dots in a colored row**

There is no concept that's just a recoloring of another. C1 and C5 both
use dots, but C1's mark is 8 monochrome dots in a circle (with one
accent), while C5 is 3 differently-colored dots in a row — visually
distinct at every size.

## What's NOT here (and why)

- No animated SVGs (over-engineering guard)
- No gradients or shadow effects (anti-SaaS guard per brand brief)
- No rustic farm illustrations / religious symbols / nationalism (per
  forbidden-categories list)
- No PNG exports / favicon.ico binary / apple-touch-icon — the spec
  asked for SVGs only at this stage; raster generation is a separate
  step once a concept is selected
- No app icon SVG variant separate from `icon.svg` — the same icon
  asset is used inside the preview's app-icon frame (the rounded green
  square is CSS chrome, not part of the SVG asset)
