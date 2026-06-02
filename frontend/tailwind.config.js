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
      },
      borderRadius: {
        ...tokens.theme.extend.borderRadius,
      },
      fontFamily: {
        ...tokens.theme.extend.fontFamily,
      },
    },
  },
  plugins: [],
};
