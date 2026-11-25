import i18next from "eslint-plugin-i18next";
import htmlEntities from "eslint-plugin-i18next/lib/options/htmlEntities.js";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import security from "eslint-plugin-security";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import designSystem from "./eslint-rules/design-system.mjs";

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
    plugins: { "react-hooks": reactHooks },
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
        {
          selector:
            "Literal[value=/\\b(bg|text|border|ring|divide|from|via|to)-(red|orange|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|gray|slate|zinc|neutral|stone)-[0-9]/]",
          message:
            "Raw Tailwind palette shade is not a Mehamakor token. Use a semantic token (text-error, bg-surface, border-border, text-fg-muted, text-muted). green-* IS a token and is exempt. If a raw shade is genuinely required, add // token-ok and eslint-disable-next-line.",
        },
        {
          // MEH-1767: a hand-rolled address/city text field has already caused
          // two production bugs (MEH-1455 — a city typed by hand fell outside
          // the map's city filter; MEH-1766 — an address typed by hand saved
          // with no lat/lng, so the pin never appeared). Scoped to raw HTML
          // `input`/`textarea` elements only (lowercase tag name) — a JSX
          // component reference like `<CitySearch id="producer-city">` has an
          // uppercase element name and never matches, so every existing
          // canonical-component call site is naturally excluded, with nothing
          // to allowlist (verified against the live codebase: every current
          // id="…-city"/"…-address" literal in app/**+components/** sits on a
          // <CitySearch>/<AddressSearch> instance, not a raw <input> — 0
          // baseline violations, 2026-08-13). Matches a LITERAL
          // id/name/placeholder/aria-label only: a value built from a
          // variable or an i18n key (`placeholder={t("city")}`) is invisible
          // to this selector, same gap MEH-1618's no-literal-string already
          // has — stated here rather than implied. Hebrew keywords use plain
          // substring match, not \b: JS regex word-boundaries are ASCII-\w
          // based and do not fire around Hebrew letters, so \bעיר\b would
          // silently never match at all.
          selector:
            "JSXOpeningElement[name.name=/^(input|textarea)$/] > JSXAttribute[name.name=/^(id|name|placeholder|aria-label)$/] > Literal[value=/\\b(city|address)\\b|עיר|כתובת/i]",
          message:
            "Hand-rolled address/city field — use the canonical <AddressSearch> or <CitySearch> component (MEH-1455, MEH-1766: this exact pattern shipped two bugs — a city that silently fell out of the map filter, an address saved with no lat/lng). Legitimate exception (e.g. an admin raw-coordinates escape hatch)? Add // address-field-ok and eslint-disable-next-line.",
        },
        {
          // MEH-3858: browser storage never reaches the server, so a value read
          // from it and painted after the load moves the page under the
          // visitor's eyes (the saved city, MEH-3857; the favorites-strip hint,
          // CLS 0.14 on home). Born at today's count in the eslint ratchet:
          // the total only goes down, and a new read has to say why it is safe.
          selector:
            "CallExpression[callee.property.name='getItem'][callee.object.name=/^(localStorage|sessionStorage)$/], CallExpression[callee.property.name='getItem'][callee.object.property.name=/^(localStorage|sessionStorage)$/]",
          message:
            "A read of browser storage: the server cannot see it, so anything it changes on screen moves after the load (MEH-3857, MEH-3858). Show it only after a tap, reserve its space from the first paint, float it over the page, or keep the value in a cookie the server reads. Then cover the page in e2e/flows/50-returning-visitor-no-shift.spec.ts and add eslint-disable-next-line no-restricted-syntax -- <why it cannot move the page>. A tripwire, not a proof: an alias or a computed key gets past it.",
        },
        {
          // MEH-3861: the Israel day read during render. The server draws with
          // its day, the browser hydrates with the visitor's, and a page cached
          // across midnight disagrees (React 418, the page drawn again).
          // useIsraelToday() hydrates with the server's day (the render-time tag
          // in <head>) and moves to the visitor's right after. A default
          // parameter (`today = israelToday()`) is the helper's own fallback and
          // is not flagged; its callers are, when they leave `today` out.
          selector:
            "CallExpression[callee.name='israelToday'][arguments.length=0]:not(AssignmentPattern > CallExpression), CallExpression[callee.name='eventWhen'][arguments.length<2]:not(AssignmentPattern > CallExpression), CallExpression[callee.name='matchesWhen'][arguments.length<3]:not(AssignmentPattern > CallExpression)",
          message:
            "The Israel day, read where it can reach the screen: a page cached before midnight hydrates after it with another day (React 418, MEH-3861). In a component, use useIsraelToday() from lib/use-israel-today.js and pass it on (eventWhen(date, today), matchesWhen(date, when, today)). In a click handler or an effect it is safe: add eslint-disable-next-line no-restricted-syntax -- <where it runs>.",
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
    // MEH-3716: lib/ file names are kebab-case (14 camelCase files renamed).
    // An error, not a warning: a new camelCase name fails lint at once.
    files: ["lib/**/*.{js,jsx,mjs}"],
    ignores: ["lib/generated/**"],
    rules: {
      "unicorn/filename-case": ["error", { case: "kebabCase" }],
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

  // ── MEH-3829: design-system + accessibility rules (parent MEH-3826) ─────
  // Every rule is "warn"; scripts/checks/eslint-ratchet.mjs gates the
  // `design-system/` and `jsx-a11y/` totals, which may only go down.
  // jsx-a11y is already registered by eslint-config-next (a handful of its
  // rules); this turns on the whole recommended set. The design-system rules
  // are the local Atlassian-style `no-html-*` set: a raw basic element
  // outside components/ui/ should be the shared owner.
  {
    files: ["**/*.{js,jsx}"],
    plugins: { "design-system": designSystem },
    rules: {
      ...Object.fromEntries(
        Object.entries(jsxA11y.configs.recommended.rules).map(([k, v]) => {
          const opts = Array.isArray(v) ? v.slice(1) : [];
          const severity = Array.isArray(v) ? v[0] : v;
          if (severity === "off" || severity === 0) return [k, v];
          return [k, opts.length ? ["warn", ...opts] : "warn"];
        }),
      ),
      ...Object.fromEntries(Object.keys(designSystem.rules).map((r) => [`design-system/${r}`, "warn"])),
    },
  },
  // The owners themselves are where the raw elements belong. Only the
  // no-html-* rules are off here: an owner must still give its field a label
  // and must not ship a read-only one.
  {
    files: ["components/ui/**"],
    rules: Object.fromEntries(
      Object.keys(designSystem.rules)
        .filter((r) => r.startsWith("no-html-"))
        .map((r) => [`design-system/${r}`, "off"]),
    ),
  },

  // ── MEH-1618: i18n literal gate ──────────────────────────────────────
  // Catches the next hardcoded user-facing string mechanically, instead of
  // by sweep. Every option below is here because it was MEASURED to remove
  // a false-positive class — see docs/ci/i18n-lint.patch.md for the numbers.
  //
  // NOTE: the plugin REPLACES `callees.exclude` / `words.exclude` rather
  // than merging (lib/rules/no-literal-string.js:35), so the shipped
  // defaults are re-listed verbatim before the project additions.
  {
    files: ["app/**/*.{js,jsx}", "components/**/*.{js,jsx}"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "warn",
        {
          mode: "jsx-only",

          // Only attributes that carry COPY. Without this the rule reports
          // every enum prop (weight="light", aria-hidden="true", dir, role,
          // type) — 1365 findings vs 233.
          "jsx-attributes": {
            include: ["placeholder", "alt", "title", "aria-label"],
          },

          callees: {
            exclude: [
              // plugin defaults
              "i18n(ext)?", "t", "require", "addEventListener",
              "removeEventListener", "postMessage", "getElementById",
              "dispatch", "commit", "includes", "indexOf", "endsWith",
              "startsWith",
              // this repo's translator convention: t, ti, tCommon, tError,
              // tBadge, tValidation … (29 distinct names) + next-intl's
              // member forms. Without these every t(key) call inside JSX is
              // reported as a literal.
              "t\\w*", "t\\w*\\.rich", "t\\w*\\.raw", "t\\w*\\.markup",
              "intlT",
            ],
          },

          words: {
            exclude: [
              // plugin defaults
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              htmlEntities,
              /^\p{Emoji}+$/u,
              // decorative glyphs that are not copy — the chat typing
              // indicator (U+25CF) sits outside both the punctuation range
              // and the Emoji property, so it needs naming.
              "^[●•·–—…]+$",
            ],
          },
        },
      ],
    },
  },

  // Allowlist — one reason per entry. NOTE the escaped brackets on
  // [locale]: unescaped it is a glob character class and silently matches
  // nothing (see the doc).
  {
    files: [
      "data/**",                  // cities/regions — data, not copy
      "lib/holidays.js",          // date registry, not copy
      "lib/badges.js",            // MEH-1617 §2ג
      "lib/contact-method.js",    // MEH-1617 §2ג
      "lib/attribute-labels.js",  // MEH-1507 label registry (scope+evidence)
      "app/\\[locale\\]/dev/**",  // internal showcase, never user-facing
      "**/__tests__/**",          // fixtures, not shipped copy
      "**/*.test.{js,jsx}",
      "messages/**",              // the message files themselves
      // e2e/** is already covered by the config's global `ignores`.
    ],
    rules: { "i18next/no-literal-string": "off" },
  },

  // The MEH-1617 files are clean TODAY and must stay clean — error here so a
  // regression on them blocks, while the 139-finding backlog elsewhere stays
  // at warn. This is the "do not let the gate be born red" rollout
  // (MEH-1604: a gate that is born unreliable gets deleted).
  {
    files: [
      "components/ChatWidget.jsx",
      "components/AlertPrefsPanel.jsx",
      "components/ExperienceForm.jsx",
      "app/\\[locale\\]/settings/page.jsx",
      "app/\\[locale\\]/login/LoginClient.jsx",
    ],
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": {
            include: ["placeholder", "alt", "title", "aria-label"],
          },
          callees: {
            exclude: [
              "i18n(ext)?", "t", "require", "addEventListener",
              "removeEventListener", "postMessage", "getElementById",
              "dispatch", "commit", "includes", "indexOf", "endsWith",
              "startsWith",
              "t\\w*", "t\\w*\\.rich", "t\\w*\\.raw", "t\\w*\\.markup",
              "intlT",
            ],
          },
          words: {
            exclude: [
              "[0-9!-/:-@[-`{-~]+",
              "[A-Z_-]+",
              htmlEntities,
              /^\p{Emoji}+$/u,
              "^[●•·–—…]+$",
            ],
          },
        },
      ],
    },
  },
];
