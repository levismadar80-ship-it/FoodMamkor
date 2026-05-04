import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import security from "eslint-plugin-security";

export default [
  {
    linterOptions: {
      // MEH-446: stale directives cleaned up — promoted to "error"
      // so any future regression is blocked at lint time.
      reportUnusedDisableDirectives: "error",
    },
  },
  ...nextCoreWebVitals,
  sonarjs.configs.recommended,
  unicorn.configs["flat/recommended"],
  security.configs.recommended,
  // MEH-443: downgrade plugin recommended rules from "error" to "warn".
  // Flat-config plugin .configs.recommended ships rules at "error" by default;
  // spec calls for all-warn until MEH-437 + MEH-439 ship + 30-day soak.
  // Preserves explicit "off" settings from the plugins' own recommended configs.
  {
    rules: Object.fromEntries(
      Object.entries({
        ...sonarjs.configs.recommended.rules,
        ...unicorn.configs["flat/recommended"].rules,
        ...security.configs.recommended.rules,
      }).map(([k, v]) => {
        if (v == null) return [k, v];
        const severity = Array.isArray(v) ? v[0] : v;
        if (severity === "off" || severity === 0) return [k, v];
        const opts = Array.isArray(v) ? v.slice(1) : [];
        return [k, opts.length ? ["warn", ...opts] : "warn"];
      }),
    ),
  },
  {
    ignores: [
      "public/sw.js",
      "public/workbox-*.js",
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "e2e/**",
    ],
  },
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
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
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
  {
    rules: {
      "max-lines": ["warn", { max: 250, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["warn", { max: 50, skipBlankLines: true, skipComments: true }],
      "max-params": ["warn", 2],
      "no-magic-numbers": ["warn", {
        detectObjects: false,
        enforceConst: true,
        ignore: [0, 1, -1, 2],
        ignoreArrayIndexes: true,
      }],
      "complexity": ["warn", 10],
      "max-depth": ["warn", 4],
      "max-statements": ["warn", 20],
      "id-length": ["warn", { min: 2, exceptions: ["i", "j", "x", "y", "_"] }],
      "eqeqeq": ["warn", "always"],
      "unicorn/prevent-abbreviations": "off",
      "unicorn/filename-case": "off",
      "unicorn/no-null": "off",
      "unicorn/no-array-reduce": "off",
    },
  },
  {
    files: ["app/**/page.js", "app/**/page.jsx"],
    rules: {
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["**/__tests__/**/*", "**/*.test.{js,jsx,ts,tsx}"],
    rules: {
      "max-lines-per-function": "off",
    },
  },
  {
    files: ["next.config.js"],
    rules: {
      "max-lines": "off",
    },
  },
];
