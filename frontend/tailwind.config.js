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
        // ── Legacy tokens — preserved for visual continuity; Contract phase migrates each (MEH-686) ──
        primary: "#2e6853",        // ירוק כהה — כפתורים, לוגו
        "primary-light": "#3a7d64",
        "primary-dark": "#2E4A2E", // hero overlays, footer
        secondary: "#4cb08b",       // ירוק בינוני — הדגשות
        "secondary-light": "#6dc4a3",
        background: "#F5F0E8",      // קרם חם — לא לבן
        accent: "#8B6914",          // זהב חם — מחירים, הדגשות
        light: "#EAF3DE",           // ירוק בהיר — badges
        "site-text": "#1C1A17",     // שחור חם — לא pure black
        "site-muted": "#5c584f",    // warm muted gray — body copy de-emphasis
        "text-primary": "#1C1A17",
        "text-secondary": "#6B6B6B",
        border: "#e8e0d0",          // TODO (MEH-686 Contract): drift to #e5dfd3 per DESIGN.md — deferred
      },
      borderRadius: {
        ...tokens.theme.extend.borderRadius,
        DEFAULT: "16px",           // legacy bare `rounded` (20 files) — Contract phase migrates to rounded-lg
      },
      fontFamily: {
        ...tokens.theme.extend.fontFamily,
        // ── Legacy families — Contract phase splits headline/body into sized tokens ──
        headline: ['"Frank Ruhl Libre"', "serif"],
        english: ['"Cormorant Garamond"', "serif"],
        body: ['"DM Sans"', '"Heebo"', "sans-serif"],
        sans: ['"DM Sans"', '"Heebo"', "sans-serif"],
      },
    },
  },
  plugins: [],
};
