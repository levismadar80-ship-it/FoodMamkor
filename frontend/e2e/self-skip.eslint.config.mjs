// ESLint config used ONLY by scripts/checks/e2e-self-skip-ratchet.mjs.
//
// The main config (eslint.config.mjs) ignores e2e/** globally, and a flat
// config's global ignore cannot be undone by a later block. So the three
// Playwright rules that catch a test which neutralises itself are run from
// this separate config, on e2e/ only, with --no-config-lookup.
//
// The rules, and the bug each one is here for:
//   no-skipped-test         `if (count === 0) test.skip(...)` turns "the element
//                           is gone" into a green run (the language toggle was
//                           missing on desktop for five weeks this way).
//   no-restricted-syntax    `.fixme` — the plugin's no-skipped-test does not see
//                           it (measured on 2.12.2), and it skips just the same.
//   no-conditional-expect   an `expect` inside an `if` never runs when the
//                           branch is not taken.
//   no-conditional-in-test  `if (!el) return;` ends the test before it asserts.
import playwright from "eslint-plugin-playwright";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    files: ["e2e/**/*.spec.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    languageOptions: { parser: tsParser, ecmaVersion: "latest", sourceType: "module" },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    plugins: { playwright },
    rules: {
      "playwright/no-skipped-test": ["warn", { allowConditional: false }],
      "no-restricted-syntax": ["warn", {
        selector: "MemberExpression[property.name='fixme']",
        message: "test.fixme skips the test; a skipped test passes when the product breaks.",
      }],
      "playwright/no-conditional-expect": "warn",
      "playwright/no-conditional-in-test": "warn",
    },
  },
];
