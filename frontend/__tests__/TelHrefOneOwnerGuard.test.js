// MEH-3461: one `tel:` builder (lib/contact-method.js telHref). Five files
// built their own — two kept the dashes, two stripped them, one added a `+` —
// so the same number dialled three ways. ContactChannelsOneOwner covers the
// entity pages only; this covers every file under app/ and components/.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { telHref } from "@/lib/contact-method";

const ROOT = path.resolve(__dirname, "..");
// A `tel:` href built from a value: a template literal, or string concatenation.
const HAND_BUILT_TEL = /`tel:\$\{|["']tel:["']\s*\+/;
// A fixed, literal site number is not a builder (accessibility statement).
const LITERAL_OK = new Set([path.join("app", "[locale]", "accessibility", "page.js")]);

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(js|jsx|ts|tsx)$/.test(e.name) ? [p] : [];
  });
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const OWNER = path.join("lib", "contact-method.js");
const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d))).map((f) => path.relative(ROOT, f));

describe("MEH-3461: telHref is the only tel: builder", () => {
  it("control: the pattern fires on the owner and on the shapes it replaced", () => {
    expect(HAND_BUILT_TEL.test(strip(fs.readFileSync(path.join(ROOT, OWNER), "utf8")))).toBe(true);
    expect(HAND_BUILT_TEL.test("href={`tel:${r.phone}`}")).toBe(true);
    expect(HAND_BUILT_TEL.test("const h = 'tel:' + phone;")).toBe(true);
    expect(HAND_BUILT_TEL.test('href="tel:+972552553744"')).toBe(false);
  });

  it("no file under app/ or components/ builds a tel: href itself", () => {
    const offenders = files
      .filter((f) => !LITERAL_OK.has(f))
      .filter((f) => HAND_BUILT_TEL.test(strip(fs.readFileSync(path.join(ROOT, f), "utf8"))));
    expect(offenders, "use telHref from lib/contact-method.js").toEqual([]);
  });

  it("telHref drops separators, keeps a leading +, and is null for nothing", () => {
    expect(telHref(" 052-123 4567 ")).toBe("tel:0521234567");
    expect(telHref("+972 (52) 123-4567")).toBe("tel:+972521234567");
    expect(telHref("")).toBeNull();
    expect(telHref(null)).toBeNull();
    expect(telHref(" - ")).toBeNull();
  });
});
