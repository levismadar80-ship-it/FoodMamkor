/** @type {import('tailwindcss').Config} */
// Canonical design tokens generated from docs/DESIGN.md via `npm run design:export`
// (ADR-019). Spread first so the legacy tokens below override on name collision during
// the Expand phase (MEH-686 Step 18 PR-A). Contract phase migrates + removes legacy.
const tokens = require("./tailwind.tokens.json");

// MEH-1831: next/font self-hosts the brand families and publishes each one as a
// CSS variable on <html> (app/[locale]/layout.js). Every family named in a stack
// needs its variable in front of it, otherwise a rule naming "DM Sans" literally
// matches no @font-face — next/font's faces carry generated names — and silently
// renders a system fallback.
//
// The prepend happens HERE and not in tailwind.tokens.json because that file is
// generated from docs/DESIGN.md by `npm run design:export`, and the required CI
// job "Verify tailwind.tokens.json sync with DESIGN.md" re-runs the generator
// and diffs the result byte-for-byte. Editing it by hand reds that job.
// Matching on the family name rather than the token key keeps docs/DESIGN.md the
// single owner of which family a token uses — rename a family there and this
// still follows it.
//
// Order matters as much as membership. A body stack carries TWO variables, and
// each is inserted in the same relative position its family already occupied, so
// the sequence a browser walks is unchanged: DM Sans (latin) before Heebo
// (Hebrew), never the reverse. Getting this backwards would render Hebrew body
// text in a latin face on a Hebrew-first site, with nothing failing — see the
// adjustFontFallback note in app/[locale]/layout.js for the measured instance of
// exactly that. frontend/__tests__/FontVariableTokens.test.js pins both
// properties.
const FONT_VAR_BY_FAMILY = [
  ["Frank Ruhl Libre", "var(--font-headline)"],
  ["DM Sans", "var(--font-body)"],
  ["Heebo", "var(--font-hebrew)"],
];

function withFontVariables(tokenFontFamily) {
  return Object.fromEntries(
    Object.entries(tokenFontFamily).map(([token, stack]) => {
      const family = Array.isArray(stack) ? stack.join(", ") : stack;
      const variables = FONT_VAR_BY_FAMILY.filter(([name]) => family.includes(name))
        // Order by where the family appears in the declared stack, so the
        // variables lead in the stack's own order rather than this list's.
        .toSorted(([first], [second]) => family.indexOf(first) - family.indexOf(second))
        .map(([, variable]) => variable);
      return [token, [[...variables, family].join(", ")]];
    }),
  );
}

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
        ...withFontVariables(tokens.theme.extend.fontFamily),
      },
    },
  },
  plugins: [],
};
