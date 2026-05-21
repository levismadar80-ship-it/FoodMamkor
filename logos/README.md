# Mehamakor logo — 5 SVG wordmark concepts (MEH-637)

Five concept explorations for the מהמקור wordmark. Each concept applies a
**different signature technique** to Frank Ruhl Libre 900 so the wordmark
is visibly distinct from the default-typed reference — addressing the
Direction A v3 failure mode where four explorations were Frank Ruhl 900
with only kerning adjustments.

## Files

| File | Concept | Signature technique |
|---|---|---|
| `mehamakor-concept-1-contextual-alternates.svg` | 1 | Two distinct מ glyphs (contextual alternates) |
| `mehamakor-concept-2-custom-ligature.svg` | 2 | ה+מ stroke bridge ligature |
| `mehamakor-concept-3-letterform-ר-ק.svg` | 3 | Modified ק descender curl + ר bracket terminal |
| `mehamakor-concept-4-serif-termination.svg` | 4 | Rounded terminal pills + connecting cap rule |
| `mehamakor-concept-5-stress-counter.svg` | 5 | Stress band + diamond counter wedges |
| `preview.html` | — | Side-by-side viewer with light/dark toggle, favicon strip, app icon |

Open `preview.html` in a browser. Both light (#2E6853 on #F5F0E8) and dark
(#F5F0E8 on #1A1A1A) panels are shown for every concept so they can be
compared directly. The page-chrome toggle changes the surrounding UI only.

## How the modifications are drawn

Each SVG uses two layers:

1. **Base text layer.** `<text>` elements for each Hebrew letter,
   `font-family="Frank Ruhl Libre, Noto Serif Hebrew, serif"`. Self-contained:
   when Frank Ruhl Libre is installed (or loaded via the HTML preview's
   Google Fonts `@import`), the wordmark renders in the intended typeface;
   otherwise it falls back to the system Hebrew serif. **Font files are not
   embedded in the SVG** per scope constraints.
2. **Modification overlay layer.** `<rect>` / `<path>` / `<ellipse>` /
   `<polygon>` shapes drawn explicitly. These ARE the custom letterform
   modifications — they exist in the SVG independent of which font renders
   the base text. The "visible shape-level difference" required by
   acceptance criterion #2 lives in this layer.

**Honest caveat:** the overlay shapes are positioned against Frank Ruhl
Libre 900 metrics at font-size 220. If a fallback Hebrew serif renders
(no Frank Ruhl installed), the overlays may sit slightly off the letter
stems / corners they target. For a production-grade cut, each overlay
must be re-traced as part of a single per-letter glyph path (rather than
text + overlay) once the concept direction is chosen.

## Default Frank Ruhl test — visible shape-level differences

Place each concept next to Frank Ruhl Libre 900 typed in Word/Figma at
the same size. A naive viewer should be able to point at:

### Concept 1 — Contextual Alternates
- **Visible difference:** the **second** מ (middle of wordmark, RTL
  reading order) has a darker, thicker rectangular block on its right-side
  vertical stem and a notched bite out of its top-left counter. The first
  מ (rightmost) does not. Default Frank Ruhl renders both mems identically.

### Concept 2 — Custom Ligature
- **Visible difference:** a solid horizontal bar (~14px high, ~98px wide)
  connects the lower-third of the gap between ה and the second מ. Default
  Frank Ruhl has clean white space between every letter — no inter-letter
  connectors anywhere in the wordmark.

### Concept 3 — Custom Letterform on ק and ר
- **Visible difference 1:** the ק descender extends below the baseline
  with a small curl inward at the bottom — a true tail that exceeds
  Frank Ruhl's straight descender.
- **Visible difference 2:** the top corner of ר shows an L-shaped bracket
  termination (a small flat tab projecting outward) rather than Frank
  Ruhl's continuous corner radius.

### Concept 4 — Serif Termination Refinement
- **Visible difference 1:** every letter sits on a small horizontal
  ellipse pill at the base of its main vertical stem — six rounded "feet"
  along the baseline. Default Frank Ruhl has squared serif feet.
- **Visible difference 2:** a single thin horizontal rule (6px) runs
  above the wordmark, connecting the top serifs. Default Frank Ruhl has
  disconnected per-letter top serifs.

### Concept 5 — Stress Contrast + Counter Modification
- **Visible difference 1:** a darker green band (#1f4a3a in light mode)
  sits across the lower-third of the wordmark, dropping a stress
  contrast through all letters. Default Frank Ruhl has uniform color.
- **Visible difference 2:** small diamond shapes inset into the interior
  counters of the letters that have counters (מ ה ק ר). Default Frank
  Ruhl leaves counters as plain negative space.

## Hebrew-correctness test

Read each wordmark aloud as if encountering it for the first time. None
of the modifications should change the perceived letter identity. The
modifications stay within Hebrew letterform rules:

- No diacritic-like marks above the baseline (no niqqud confusion).
- Descenders only on ק (and would-be ך/ן/ץ/ף/ם sofit forms — none here).
- No mirroring or inversion that could read as another letter.

## Confidence and uncertainty flags

| Concept | Confidence | Native-Hebrew-typographer review needed for |
|---|---|---|
| 1 — Contextual alternates | Medium | Does the modified second מ still read cleanly as mem, or does the stem thickener push it toward a different letter perception? Latin contextual alternates have a long tradition; the Hebrew tradition is thinner — borrowed move may feel foreign. |
| 2 — Custom ligature | Medium-low | Does the bridge bar between ה and מ create a perceived dagesh or read as a different letter combination? The bridge is positioned mid-letter, not at a baseline, which is unusual for Hebrew. |
| 3 — ק descender + ר bracket | Medium | The ק curl is the more confident modification — it extends an existing descender. The ר bracket terminal is more experimental; should be checked against legibility at small sizes. |
| 4 — Serif termination | High | Adding terminal pills and a top rule is additive, not transformative — base letterforms are unchanged. Lowest risk of misreading. |
| 5 — Stress contrast + counters | Medium | The stress band is visually striking but its placement assumes Frank Ruhl Libre 900 baseline metrics. With a fallback font, the band may clip letter bottoms unintentionally. |

**I don't know — requires native-Hebrew-typographer review:**
- Whether Concept 1's stem thickener crosses into "this reads as a
  different letter" territory.
- Whether Concept 2's mid-height ligature bar is too aggressive for
  editorial tone.
- Whether Concept 3's ק curl direction (curl toward the wordmark vs
  away) is the more idiomatic Hebrew choice.

The user should bring at least one native Hebrew reader / typographer
into the review before promoting any concept to production.

## What's NOT here (and why)

- **No animated SVGs** — over-engineering guard says static only.
- **No gradient fills** — brand spec says solid colors only.
- **No graphic mark beside the wordmark** — Aesop/Gentlewoman/Hearst
  pattern, the wordmark IS the logo.
- **No alternative typefaces** — Frank Ruhl Libre 900 + DM Sans 500 only.
- **No separate favicon / app-icon SVG files** — those are derivatives
  shown in `preview.html`, generated by cropping the wordmark to a
  single מ (favicon, viewBox `780 100 140 170`) or scaling the full
  wordmark onto a green rounded-square (app icon).

## Fonts loaded by the HTML preview only

`preview.html` `@import`s from Google Fonts:

```
https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500&family=Frank+Ruhl+Libre:wght@900&display=swap
```

The standalone `.svg` files do NOT bundle font files — they rely on
`font-family` with a serif fallback so the SVG remains self-contained
under 5KB and portable across rendering contexts. If a downstream
consumer (slide deck, doc) needs the SVG to look identical to the
preview, they must have Frank Ruhl Libre 900 installed locally OR
convert the wordmark text to outlines as part of the production cut.

## File-size budget

All five SVGs land under 3KB (budget was 5KB), leaving room for the
production cut to add explicit glyph paths if the text+overlay approach
is replaced with single-path letterforms.

| File | Bytes |
|---|---|
| `mehamakor-concept-1-contextual-alternates.svg` | ~2.5KB |
| `mehamakor-concept-2-custom-ligature.svg` | ~2.3KB |
| `mehamakor-concept-3-letterform-ר-ק.svg` | ~2.5KB |
| `mehamakor-concept-4-serif-termination.svg` | ~3.0KB |
| `mehamakor-concept-5-stress-counter.svg` | ~2.8KB |
