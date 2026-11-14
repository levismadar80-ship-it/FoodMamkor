/**
 * MEH-2832 PR 2 — every «כתבו לנו» / «צרו קשר» on the site leads to the one
 * contact form (/contact), with the right topic preselected. No link to the
 * retired /about form, no Instagram as a support channel (Instagram stays in
 * the site footer as social).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import he from "../messages/he.json";
import en from "../messages/en.json";
import { CONTACT_TOPICS } from "@/lib/contact-topics";

const ROOT = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
// Code only: JS/JSX comments are dropped so prose that names the old target
// (history notes) does not count as a link.
const code = (rel) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const SOURCES = [...walk("app"), ...walk("components")];

describe("one contact form — link targets", () => {
  it("no code links to the retired /about form (/about#contact or /about?topic=)", () => {
    expect(SOURCES.length).toBeGreaterThan(100);
    const hits = SOURCES.filter((f) => /["'`]\/about(#contact|\?topic=)/.test(code(f)));
    expect(hits).toEqual([]);
  });

  it("Instagram appears only in the site footer's social row, not as a support link", () => {
    const hits = SOURCES.filter((f) => code(f).includes("instagram.com/meha_makor"));
    expect(hits).toEqual(["components/Footer.jsx"]);
  });

  it.each([
    ["components/Footer.jsx", '{ href: "/contact", label: t("nav.footer.contact") }'],
    ["components/DashboardFooter.jsx", '{ href: "/contact", label: t("nav.footer.contact") }'],
    ["app/[locale]/about/for-businesses/page.js", 'href="/contact?topic=business"'],
    ["app/[locale]/producer/dashboard/edit/page.js", 'href="/contact?topic=business"'],
    ["app/[locale]/about/badges/BadgesExplainer.jsx", '"self-declared": "/contact?topic=correction"'],
    // MEH-3122: the dead-link screen builds this action once and shows it as
    // primary or secondary; the target is the same.
    ["app/[locale]/claim/ClaimClient.jsx", 'const contact = { href: "/contact?topic=business", label: t("invalid.contact") };'],
    ["app/[locale]/claim/ClaimClient.jsx", '{ href: "/contact?topic=business", label: t("claimed.contact") }'],
    ["app/[locale]/about/for-businesses/guides/page.js", '<Link href="/contact?topic=business"'],
    ["app/[locale]/error.js", 'href="/contact"'],
  ])("%s → %s", (file, needle) => {
    expect(code(file)).toContain(needle);
  });

  it("every ?topic= used in a link is a whitelisted topic", () => {
    const used = new Set();
    for (const f of SOURCES) for (const m of code(f).matchAll(/\/contact\?topic=([a-z_]+)/g)) used.add(m[1]);
    expect(used.size).toBeGreaterThan(0);
    for (const t of used) expect(CONTACT_TOPICS).toContain(t);
  });

  it("forgot-password: the help line links to /contact, not a mailto", () => {
    const src = code("app/[locale]/forgot-password/ForgotPasswordClient.jsx");
    expect(src).not.toMatch(/href=\{`mailto:/);
    expect(src).toMatch(/<Link\s+href="\/contact"/);
  });
});

describe("guides footer — copy row 1", () => {
  it("he: «יש שאלה שהמדריכים לא ענו עליה? כתבו לנו», the link on «כתבו לנו»; no Instagram", () => {
    expect(he.guides.index.footer_prefix).toBe("יש שאלה שהמדריכים לא ענו עליה? <link>כתבו לנו</link>");
    expect(he.guides.index.footer_suffix).toBeUndefined();
    expect(en.guides.index.footer_suffix).toBeUndefined();
    expect(en.guides.index.footer_prefix).toMatch(/<link>.+<\/link>/);
    expect(JSON.stringify(he.guides.index)).not.toContain("אינסטגרם");
  });
});
