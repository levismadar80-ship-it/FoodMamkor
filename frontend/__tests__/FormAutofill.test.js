import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// MEH-3127 — the right phone keyboard and the browser's saved-details offer on
// the fields where it is the PERSON'S OWN name / email / phone / password.
// (The business phone on «המליצו» and the admin business form stay without
// autoComplete on purpose: autofill would put her own details there.)
//
// Contact / recommend (suggester) / report-info name+email got theirs in
// MEH-3112 (#4473), which also guards them.
//
// Each case names the element by an anchor unique to it (its id, testid or a
// line inside it) and reads the WHOLE JSX element around that anchor, from
// its opening `<` to its `/>`, so an attribute on a neighbouring field can't
// satisfy the check.

function element(file, anchor) {
  const src = readFileSync(path.join(__dirname, "..", file), "utf8");
  const at = src.indexOf(anchor);
  if (at < 0) throw new Error(`anchor not found in ${file}: ${anchor}`);
  if (src.indexOf(anchor, at + 1) >= 0) throw new Error(`anchor not unique in ${file}: ${anchor}`);
  const start = src.lastIndexOf("<", at);
  const end = src.indexOf("/>", at);
  return src.slice(start, end);
}

const CASES = [
  ["business signup phone", "app/[locale]/register/producer/RegisterProducerClient.jsx", 'id="producer-phone"', { type: "tel", autoComplete: "tel" }],
  ["user signup name", "app/[locale]/register/RegisterClient.jsx", 'data-testid="register-name"', { autoComplete: "name" }],
  ["user signup email", "app/[locale]/register/RegisterClient.jsx", 'data-testid="register-email"', { type: "email", autoComplete: "email" }],
  ["forgot-password email", "app/[locale]/forgot-password/ForgotPasswordClient.jsx", 'data-testid="forgot-email"', { type: "email", autoComplete: "email" }],
  ["reset-password confirm", "app/[locale]/reset-password/ResetPasswordClient.jsx", "value={confirm}", { autoComplete: "new-password" }],
  ["settings name", "app/[locale]/settings/page.jsx", 'id="profile-name"', { autoComplete: "name" }],
  ["settings phone", "app/[locale]/settings/page.jsx", 'id="profile-phone"', { type: "tel", autoComplete: "tel" }],
  ["alerts phone", "components/AlertPrefsPanel.jsx", "value={phoneInput}", { type: "tel", autoComplete: "tel" }],
  ["footer newsletter email", "components/Footer.jsx", 'id="footer-newsletter-email"', { type: "email", autoComplete: "email" }],
  ["admin lead phone", "app/[locale]/admin/outreach/page.jsx", 'outreach.modal_add.phone_placeholder', { type: "tel" }],
];

describe("form fields open the right keyboard and offer saved details (MEH-3127)", () => {
  it.each(CASES)("%s", (_name, file, anchor, want) => {
    const el = element(file, anchor);
    for (const [attr, value] of Object.entries(want)) {
      expect(el, `${attr}="${value}"`).toMatch(new RegExp(`\\s${attr}="${value}"`));
    }
  });

  it("the admin lead phone does NOT offer her own number (it's the business's)", () => {
    expect(element("app/[locale]/admin/outreach/page.jsx", "outreach.modal_add.phone_placeholder")).not.toContain("autoComplete");
  });
});
