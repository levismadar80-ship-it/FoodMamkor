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
//
// This list must name EVERY family declared with next/font in
// app/[locale]/layout.js — not merely the ones that happen to appear in
// tailwind.tokens.json today. Cormorant Garamond is the case in point: it has a
// variable (--font-latin) but no token currently references it, so it is
// reachable only via the hand-written `.font-english` rule in globals.css. If a
// future docs/DESIGN.md edit adds a Cormorant token, the entry below is what
// stops it emitting a stack with no variable — a state that builds clean, emits
// the utility, and renders the system serif.
// MEH-2029: a family split across two next/font/local calls (one per unicode
// subset) contributes BOTH variables, in chain order. The half carrying the
// size-adjusted fallback face is listed second on purpose — that face has no
// unicode-range, so ahead of a real face it would match every glyph the real
// face was there to render.
const FONT_VAR_BY_FAMILY = [
  ["Frank Ruhl Libre", ["var(--font-headline)", "var(--font-headline-latin)"]],
  ["DM Sans", ["var(--font-body)"]],
  ["Heebo", ["var(--font-hebrew)", "var(--font-hebrew-latin)"]],
  ["Cormorant Garamond", ["var(--font-latin)"]],
];

function withFontVariables(tokenFontFamily) {
  return Object.fromEntries(
    Object.entries(tokenFontFamily).map(([token, stack]) => {
      const family = Array.isArray(stack) ? stack.join(", ") : stack;
      const variables = FONT_VAR_BY_FAMILY.filter(([name]) => family.includes(name))
        // Order by where the family appears in the declared stack, so the
        // variables lead in the stack's own order rather than this list's.
        .toSorted(([first], [second]) => family.indexOf(first) - family.indexOf(second))
        .flatMap(([, variables]) => variables);
      return [token, [[...variables, family].join(", ")]];
    }),
  );
}

// MEH-3169: the z-index scale, by ROLE. Each value is the literal it replaced,
// byte for byte, so the rendered stacking order does not move. One value can
// carry two roles (598, 800, 1000, 1001, 1050, 1150, 1200, 9999): each role gets
// its own name, so a later change to one of them does not drag the other.
// Every name is a Tailwind class (`z-modal`) AND a CSS custom property
// (`var(--z-modal)`, emitted on :root by the plugin below). The property is for
// the places a class cannot reach: globals.css declarations and inline `style`
// objects (ChatWidget). Both come from this one object, so each value is written
// exactly once. The scale as documentation, with owners:
// .claude/rules/rtl.md § "Map z-index tokens", kept in sync by
// __tests__/ZTokenLedgerSync.test.js.
const Z_INDEX = {
  decor: "1", // decorative texture overlay (about pages)
  "dev-badge": "2", // dev playground card badge
  "sticky-bar": "598", // producer contact bar · event sign-up bar
  "map-picked-card": "598", // phone map: picked-business card, under the sheet
  "map-sheet": "600", // /map bottom sheet
  "map-legend": "800", // /map desktop legend
  "row-menu": "800", // admin table row menu
  popover: "800", // ui/Popover desktop panel
  "map-controls": "1000", // map chrome + Leaflet controls (globals.css)
  "bottom-nav": "1000", // mobile BottomNav pill
  "back-to-top": "1000", // BackToTop button
  "hero-suggestions": "1000", // home hero search dropdowns
  "account-scrim": "1001", // AccountSheet overlay
  "user-menu": "1001", // Header UserMenu dropdown
  "map-attribution": "1001", // Leaflet attribution (globals.css)
  "account-sheet": "1002", // AccountSheet panel
  autocomplete: "1010", // address / city suggestion lists
  header: "1050", // global sticky header
  "chat-launcher-mobile": "1050", // ChatWidget launcher below lg (inline style)
  "product-sheet": "1060", // public product sheet
  "cookie-banner": "1100", // cookie banner
  "alerts-sheet": "1150", // /favorites + business-page alerts sheet and scrim
  "minimap-fullscreen": "1150", // MiniMap fullscreen overlay
  "filter-sheet": "1200", // FilterSheet scrim + sheet
  "popover-sheet-scrim": "1200", // ui/Popover mobile sheet scrim
  "popover-sheet": "1210", // ui/Popover mobile bottom sheet
  toast: "2000", // Toaster stack, below both modal tiers
  modal: "9000", // ordinary modals
  "modal-interrupt": "9500", // interrupt modals, above an ordinary modal
  "install-prompt": "9997", // PWA install prompt
  tooltip: "9999", // tooltips
  chat: "9999", // ChatWidget panel + desktop launcher (inline style)
  "skip-link": "10000", // skip-to-content link, on focus
  cursor: "10001", // custom cursor dot, top of the scale (MEH-2300)
};

// `:root { --z-<name>: <value> }` for every token above. A plugin function
// (Tailwind v3) rather than hand-written CSS, so the value has one owner.
function zIndexVariables({ addBase }) {
  addBase({
    ":root": Object.fromEntries(
      Object.entries(Z_INDEX).map(([name, value]) => [`--z-${name}`, value]),
    ),
  });
}

module.exports = {
  // MEH-2418: `hover:` only applies where a real pointer can hover. On touch
  // (iOS keeps :hover on the last tapped element) a tapped card stayed in its
  // hover look — green border + underline — after the tap. This is Tailwind
  // 3's documented opt-in and the default behaviour in Tailwind 4.
  future: {
    hoverOnlyWhenSupported: true,
  },
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
      zIndex: Z_INDEX,
    },
  },
  plugins: [zIndexVariables],
};
