/**
 * The four brand typefaces, self-hosted from files committed in this repo.
 *
 * MEH-1831 moved these off `fonts.googleapis.com` at RUNTIME. MEH-2029 moves
 * them off `fonts.gstatic.com` at BUILD time, which is the half that was still
 * on the network: `next/font/google` downloads every (family × subset) file on
 * every build — 60 binary fetches, which the `subsets:` option does not reduce —
 * and any one of them failing fails the build. It did, non-deterministically:
 * the same commit failed the Chromium job and passed WebKit, then swapped on
 * retry. A build that crashes before `next start` runs ZERO e2e specs, so an
 * external network blip erased a PR's entire E2E signal.
 *
 * THE COMMITTED BINARIES ARE NOT RE-ENCODED. Each `.woff2` under `./fonts/` is
 * a byte-for-byte copy of a file the last `next/font/google` build emitted into
 * `.next/static/media`, so the outlines and metrics cannot have drifted from
 * what the site shipped. Provenance and the copy commands: `./fonts/README.md`.
 *
 * WHY EACH FAMILY IS ONE FILE PER SUBSET, NOT ONE PER WEIGHT. All four are
 * variable fonts, and Google serves one file per subset covering the whole wght
 * axis — which is why 60 `@font-face` rules were backed by only 20 files. Each
 * weight below is therefore its own `src` entry pointing at the SAME path. That
 * reproduces the previous CSS exactly: the browser instantiates wght at the
 * declared value, and a weight that was never declared (600 on a headline, say)
 * still snaps to the nearest declared face instead of becoming a newly-available
 * interpolation. Declaring `weight: "400 900"` would have changed rendering.
 *
 * WHY SOME FAMILIES ARE SPLIT INTO TWO CALLS. `next/font/local` applies
 * `declarations` to every face in a call, so one call can carry exactly one
 * `unicode-range` — and a family needing both hebrew and latin therefore needs
 * two calls and two CSS variables. The pair is chained in the font stacks
 * (`app/globals.css`, `tailwind.config.js`), and the ordering rule is:
 *
 *     THE CALL THAT CARRIES THE ADJUSTED FALLBACK GOES LAST.
 *
 * That fallback face is `local(Arial)` / `local(Times New Roman)` with NO
 * unicode-range, so it matches every glyph in existence. Put it ahead of a real
 * face and it silently eats that face's script — which is the exact failure
 * MEH-1831 hit with Arial capturing Hebrew, one level up.
 *
 * EVERY ARGUMENT HERE MUST BE A LITERAL. Turbopack's SWC transform serialises
 * these call arguments statically; a helper function or an imported constant is
 * not evaluated, it is DROPPED. A dropped `src` fails the build loudly, but a
 * dropped `declarations` would fail silently and cost a subset's unicode-range.
 * So: no `map()`, no shared constants, no spreads. The repetition is the point.
 * Guarded by `__tests__/fonts-are-local.test.js`.
 */
import localFont from "next/font/local";

// Google's `hebrew` subset range, verbatim from the emitted CSS this replaced.
// Google's `latin` subset range, likewise, appears on the latin calls below.

export const frankRuhlLibre = localFont({
  src: [
    { path: "./fonts/frank-ruhl-libre-hebrew.woff2", weight: "400", style: "normal" },
    { path: "./fonts/frank-ruhl-libre-hebrew.woff2", weight: "700", style: "normal" },
    { path: "./fonts/frank-ruhl-libre-hebrew.woff2", weight: "900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-headline",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F",
    },
  ],
  // Not last in the headline stack — see the ordering rule above.
  adjustFontFallback: false,
});

export const frankRuhlLibreLatin = localFont({
  src: [
    { path: "./fonts/frank-ruhl-libre-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/frank-ruhl-libre-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/frank-ruhl-libre-latin.woff2", weight: "900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-headline-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  // Last in the headline stack, so Frank Ruhl Libre's adjusted fallback belongs
  // here. The metrics are read from the font file and both subsets carry the
  // same head/OS-2 metrics, so which call computes them does not matter — only
  // that the face it emits sits last.
  adjustFontFallback: "Times New Roman",
});

// `adjustFontFallback: false` is load-bearing, not a tuning preference.
// next/font's generated "DM Sans Fallback" face is `src: local(Arial)` with NO
// unicode-range, and Arial covers Hebrew — so with it enabled it sits between
// DM Sans and Heebo in every body stack and captures every Hebrew glyph on the
// site. Measured via CDP CSS.getPlatformFontsForNode: Hebrew body text resolved
// to "Liberation Sans" (the Linux Arial metric clone) instead of Heebo. DM Sans
// is latin-subset only here, so its swap can only ever affect latin runs, and
// the CLS this option would buy is worth less than the Hebrew typeface it
// silently replaces. Heebo keeps ITS adjusted fallback — that is the face
// Hebrew body text actually swaps from, so it is where the zero-CLS win belongs
// on a Hebrew-first site.
//
// MEH-2029 measured a wrinkle worth recording rather than silently inheriting:
// under Next 16's Turbopack build, `next/font/google` emitted a "DM Sans
// Fallback" face into `--font-body` ANYWAY, with this option set — so the
// tuning above was NOT in effect on the build this replaces. `next/font/local`
// honours it, which is why the emitted CSS changes here: the intent is being
// restored, not dropped. What that face did NOT do on Linux is capture Hebrew —
// `local(Arial)` finds no font literally named Arial, so it never loaded and
// Hebrew still reached Heebo (measured: `e2e/qa-meh2029-font-resolution.mjs`).
// On a machine that HAS real Arial it would load, which is the case MEH-1831
// was written about and which cannot be measured from this sandbox.
export const dmSans = localFont({
  src: [
    { path: "./fonts/dm-sans-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/dm-sans-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/dm-sans-latin.woff2", weight: "600", style: "normal" },
  ],
  display: "swap",
  variable: "--font-body",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  adjustFontFallback: false,
});

// MEH-1831: Heebo is the FOURTH Google-hosted family, and that ticket did not
// know about it — it was loaded by `@import url(fonts.googleapis.com/...)` on
// line 1 of globals.css, which the ticket's own removal assertion
// (`grep --include="*.js*"`) could not match. It is not decorative: DM Sans
// ships latin glyphs only, so Heebo is the face that renders Hebrew body text
// site-wide.
//
// MEH-2029 dropped weight 300. `grep -rnE "font-light|font-weight: ?300"` over
// every .js/.jsx/.css/.json under frontend/ returned exactly one hit — the old
// declaration itself. Nothing on the site ever asked for it.
export const heebo = localFont({
  src: [
    { path: "./fonts/heebo-hebrew.woff2", weight: "400", style: "normal" },
    { path: "./fonts/heebo-hebrew.woff2", weight: "500", style: "normal" },
    { path: "./fonts/heebo-hebrew.woff2", weight: "600", style: "normal" },
    { path: "./fonts/heebo-hebrew.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-hebrew",
  declarations: [
    {
      prop: "unicode-range",
      value: "U+0307-0308,U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F",
    },
  ],
  adjustFontFallback: false,
});

// Heebo's adjusted fallback lives on this call because this call sits last in
// the body stack. It is still the face Hebrew body text swaps FROM — a fallback
// with no unicode-range covers Hebrew regardless of which call emitted it — so
// the zero-CLS win MEH-1831 placed on Heebo has not moved.
export const heeboLatin = localFont({
  src: [
    { path: "./fonts/heebo-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/heebo-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/heebo-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/heebo-latin.woff2", weight: "700", style: "normal" },
  ],
  display: "swap",
  variable: "--font-hebrew-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  adjustFontFallback: "Arial",
});

// Latin-only, so one call and one variable — its stack is unchanged. Both
// styles fit in a single call because `style` distinguishes their faces where a
// second `unicode-range` could not. The italic is in use: it sets the LTR
// numerals in HomeClient, EventsClient and RegisterProducerClient.
export const cormorantGaramond = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-italic.woff2", weight: "400", style: "italic" },
    { path: "./fonts/cormorant-garamond-latin-italic.woff2", weight: "600", style: "italic" },
  ],
  display: "swap",
  variable: "--font-latin",
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
    },
  ],
  adjustFontFallback: "Times New Roman",
});

/**
 * The class list that publishes every font variable onto <html>.
 *
 * Order here is irrelevant — these are CSS custom properties, and what decides
 * which face wins a glyph is the order of the `var()` references inside the
 * font stacks in globals.css / tailwind.config.js.
 */
export const FONT_VARIABLES = [
  frankRuhlLibre.variable,
  frankRuhlLibreLatin.variable,
  dmSans.variable,
  cormorantGaramond.variable,
  heebo.variable,
  heeboLatin.variable,
].join(" ");
