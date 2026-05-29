/** @type {import('tailwindcss').Config} */
// Canonical design tokens generated from docs/DESIGN.md via `npm run design:export`
// (ADR-019). Spread first so the legacy tokens below override on name collision during
// the Expand phase (MEH-686 Step 18 PR-A). Contract phase migrates + removes legacy.
const tokens = require("./tailwind.tokens.json");

module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      // ── Canonical tokens (generated; additive, no legacy collision) ──
      fontSize: tokens.theme.extend.fontSize,
      spacing: tokens.theme.extend.spacing,
      colors: {
        ...tokens.theme.extend.colors,
        // ── Legacy tokens — remaining aliases pending Contract migration (MEH-686) ──
        primary: "#2e6853",        // ירוק כהה — כפתורים, לוגו
        "primary-dark": "#2E4A2E", // hero overlays, footer
        background: "#F5F0E8",      // קרם חם — לא לבן
        accent: "#8B6914",          // זהב חם — מחירים, הדגשות
        border: "#e5dfd3",          // canonical (matches tailwind.tokens.json; MEH-708 Chunk 2 flip)
      },
      borderRadius: {
        ...tokens.theme.extend.borderRadius,
      },
      fontFamily: {
        ...tokens.theme.extend.fontFamily,
        // ── Legacy family alias — `english` retained: still consumed by
        //    HomeStaticBlocks.jsx:201 + MapProducerCard.jsx:88 (MEH-708 Chunk 1 grep gate). ──
        english: ['"Cormorant Garamond"', "serif"],
      },
    },
  },
  plugins: [],
};
