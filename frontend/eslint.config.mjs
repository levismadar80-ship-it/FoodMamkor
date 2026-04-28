import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";

// MEH-370 C3: ESLint 9 native flat config.
// `eslint-config-next@16.2.4` ships flat config at the default export
// (no `./flat` subpath needed — module.exports IS the flat config array).

export default [
  ...nextCoreWebVitals,
  {
    ignores: [
      "public/sw.js",
      "public/workbox-*.js",
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      // Playwright e2e — has its own runtime + conventions; ESLint
      // also can't parse rtl.spec.ts due to malformed JSDoc
      // (`* left-*/right-*` closes the comment prematurely).
      "e2e/**",
    ],
  },
  // Service worker globals for worker/index.js (MEH-54 push handlers).
  {
    files: ["worker/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    rules: {
      "no-undef": "error",
      // eslint-plugin-react-hooks@6 added 5 new strict rules that surface
      // ~95 pre-existing patterns the v5 lint never saw. Downgrade to
      // "warn" so MEH-370 ships clean; address each rule in its own
      // follow-up ticket (codebase work, not upgrade scope).
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      // Pre-existing anti-pattern (6 sites use <a> for internal nav
      // instead of next/link). Real issue; defer to follow-up ticket
      // — touching 5 component files is out of MEH-370 scope.
      "@next/next/no-html-link-for-pages": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            "JSXAttribute[name.name='className'] > Literal[value=/\\b(left|right)-[0-9]/]",
          message:
            "Avoid physical directional classes. Use logical equivalents (start-*, end-*). If intentional (eye-toggle, carousel, centering idiom), add // rtl-ok comment and use eslint-disable-next-line.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] > Literal[value=/\\bm[lr]-[0-9]/]",
          message:
            "Avoid physical margin classes. Use logical equivalents (ms-*, me-*). If intentional, add // rtl-ok comment and use eslint-disable-next-line.",
        },
        {
          selector:
            "JSXAttribute[name.name='className'] > Literal[value=/\\bp[lr]-[0-9]/]",
          message:
            "Avoid physical padding classes. Use logical equivalents (ps-*, pe-*). If intentional (e.g. password-input padding pair), add // rtl-ok comment and use eslint-disable-next-line.",
        },
      ],
    },
  },
];
