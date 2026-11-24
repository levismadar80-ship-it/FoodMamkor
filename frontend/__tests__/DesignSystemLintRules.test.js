/**
 * MEH-3829 — the local `design-system` ESLint rules (eslint-rules/design-system.mjs).
 *
 * Runs each rule through ESLint (Linter) on JSX it must report and JSX it
 * must leave alone, then lints two real files through the repo's own config:
 * one owner in components/ui/ (exempt) and one page component (counted).
 */
import { describe, it, expect } from "vitest";
import { Linter, ESLint } from "eslint";
import path from "node:path";
import plugin from "../eslint-rules/design-system.mjs";

// RuleTester asserts with node:assert, which vitest's requireAssertions does
// not count; the same check is written here with expect.
const linter = new Linter();
const LANG = { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } };
const tester = {
  run(name, ruleDef, { valid, invalid }) {
    const ids = (code) =>
      linter
        .verify(code, [{ languageOptions: LANG, plugins: { ds: { rules: { r: ruleDef } } }, rules: { "ds/r": "error" } }])
        .map((m) => m.messageId || `fatal: ${m.message}`);
    describe(name, () => {
      for (const code of valid) it(`leaves alone: ${code}`, () => expect(ids(code)).toEqual([]));
      for (const c of invalid) it(`reports: ${c.code}`, () => expect(ids(c.code)).toEqual(c.errors.map((e) => e.messageId)));
    });
  },
};
const rule = (name) => plugin.rules[name];
const bad = (code, messageId = "raw") => ({ code, errors: [{ messageId }] });

tester.run("no-html-button", rule("no-html-button"), {
  valid: ["<Button>שמירה</Button>", "<ButtonSpinner />"],
  invalid: [bad("<button onClick={f}>שמירה</button>")],
});

tester.run("no-html-select / textarea", rule("no-html-select"), {
  valid: ["<Select label='עיר' />"],
  invalid: [bad("<select><option>א</option></select>")],
});
tester.run("no-html-textarea", rule("no-html-textarea"), {
  valid: ["<Textarea label='הערה' />"],
  invalid: [bad("<textarea />")],
});

tester.run("no-html-checkbox", rule("no-html-checkbox"), {
  valid: ["<input type='text' />", "<input type='radio' />", "<Switch checked />"],
  invalid: [bad("<input type='checkbox' />"), bad('<input type={"checkbox"} />')],
});
tester.run("no-html-radio", rule("no-html-radio"), {
  valid: ["<input type='checkbox' />"],
  invalid: [bad("<input type='radio' name='a' />")],
});

tester.run("no-html-heading", rule("no-html-heading"), {
  valid: ["<Heading level={2}>א</Heading>", "<h4>א</h4>"],
  invalid: [bad("<h1>א</h1>"), bad("<h2>א</h2>"), bad("<h3>א</h3>")],
});

tester.run("no-html-anchor", rule("no-html-anchor"), {
  valid: ["<Link href='/'>בית</Link>"],
  invalid: [bad("<a href='https://x.example'>x</a>")],
});

tester.run("no-placeholder-as-label", rule("no-placeholder-as-label"), {
  valid: [
    "<Input label='שם' placeholder='למשל: דנה' />",
    "<input aria-label='חיפוש' placeholder='חיפוש' />",
    "<label>שם <input placeholder='דנה' /></label>",
    "<><label htmlFor='n'>שם</label><input id='n' placeholder='דנה' /></>",
    "<input {...props} placeholder='דנה' />",
    "<input type='submit' placeholder='x' />",
    "<><input id='n' placeholder='דנה' /><label htmlFor='n'>שם</label></>",
    "<><label htmlFor={fid}>שם</label><input id={fid} placeholder='דנה' /></>",
  ],
  invalid: [
    bad("<input placeholder='חיפוש' />", "only"),
    bad("<Textarea placeholder='כתבו כאן' />", "only"),
    bad("<><label htmlFor='other'>x</label><input id='n' placeholder='דנה' /></>", "only"),
    bad("<>{/* htmlFor='n' */}<input id='n' placeholder='דנה' /></>", "only"),
  ],
});

tester.run("no-readonly-or-disabled-inputs", rule("no-readonly-or-disabled-inputs"), {
  valid: ["<input disabled={saving} />", "<Input disabled={busy} />", "<input readOnly={false} />", "<button disabled />"],
  invalid: [
    bad("<input readOnly value={v} />", "off"),
    bad("<Input disabled />", "off"),
    bad("<textarea disabled={true} />", "off"),
  ],
});

describe("wired through the repo's eslint.config.mjs", () => {
  const eslint = new ESLint({ cwd: path.resolve(__dirname, "..") });
  const rulesIn = async (rel) => {
    const [res] = await eslint.lintFiles([rel]);
    return res.messages.map((m) => m.ruleId).filter((r) => r?.startsWith("design-system/"));
  };

  it.each([
    ["components/ui/Button.jsx", "design-system/no-html-button"],
    ["components/ui/OfferCard.jsx", "design-system/no-html-heading"],
    ["components/ui/Select.jsx", "design-system/no-html-select"],
    ["components/ui/Textarea.jsx", "design-system/no-html-textarea"],
  ])("the owner %s is exempt from %s", async (file, ruleId) => {
    expect(await rulesIn(file)).not.toContain(ruleId);
  });

  // Footer.jsx is the real-file anchor: it holds raw buttons and headings on
  // 24/11. When the codemod moves them, point this case at another file that
  // still has both (the ratchet baseline lists them).
  it("a page component with raw buttons and headings is counted (Footer.jsx)", async () => {
    const found = await rulesIn("components/Footer.jsx");
    expect(found).toContain("design-system/no-html-button");
    expect(found).toContain("design-system/no-html-heading");
  });
}, 60_000);
