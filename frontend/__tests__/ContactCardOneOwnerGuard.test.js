// MEH-3459: one component per pattern for a page's contact channels.
//
// The organizer page drew its own «primary button + pills» copy of the
// business page's ContactCard for months (MEH-2475 → MEH-2988 → MEH-2991 each
// moved the copy closer instead of deleting it). ContactChannelsOneOwner guards
// the HREFS; nothing guarded the DRAWING. This test does: the primary-contact
// look (ContactCtaVariants) and its labels (`contact_cta.*`) may be read only by
// the components that own a contact surface. A new page that wants contact
// channels renders ContactCard (or PrimaryContactButton), it does not rebuild it.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const SCAN = ["app", "components"];
// The owners. Each one is a contact surface of its own, not a copy of another.
const ALLOW = new Set(
  [
    "components/PrimaryContactButton.jsx", // the big button (ContactCard's top)
    "app/[locale]/producer/[id]/components/StickyContactBar.jsx", // phone sticky bar
    "components/public/OrderBar.jsx", // takes the sticky bar's place once a product is picked
  ].map((p) => path.join(...p.split("/"))),
);
// Reading the variant map, or the contact_cta labels (as a namespace or a key).
const DRAWS_CONTACT = /ContactCtaVariants|namespace:\s*["']contact_cta["']|["'`]contact_cta\./;

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
    return /\.(js|jsx)$/.test(e.name) ? [p] : [];
  });
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
// The variant map itself is the thing being read, not a reader.
const SELF = path.join("components", "ContactCtaVariants.jsx");
const files = SCAN.flatMap((d) => walk(path.join(ROOT, d))).map((f) => path.relative(ROOT, f)).filter((f) => f !== SELF);
const hits = files.filter((f) => DRAWS_CONTACT.test(strip(fs.readFileSync(path.join(ROOT, f), "utf8"))));

describe("MEH-3459: contact channels are drawn by ContactCard's family only", () => {
  it("control: the pattern fires on the real owners (so a silent zero means nothing)", () => {
    for (const owner of ALLOW) expect(hits, owner).toContain(owner);
    // and on the shape the old organizer page used
    expect(DRAWS_CONTACT.test('getTranslations({ locale, namespace: "contact_cta" })')).toBe(true);
    expect(DRAWS_CONTACT.test('import { getCtaVariant } from "@/components/ContactCtaVariants";')).toBe(true);
    // RegisterNameCheck's own `contact_cta` key in another namespace is not contact drawing
    expect(DRAWS_CONTACT.test('{t("contact_cta")}')).toBe(false);
  });

  it("no other file rebuilds the primary contact button or its labels", () => {
    const offenders = hits.filter((f) => !ALLOW.has(f));
    expect(offenders, "render ContactCard / PrimaryContactButton instead").toEqual([]);
  });

  it("the organizer page uses the business page's ContactCard", () => {
    const src = fs.readFileSync(path.join(ROOT, "app", "[locale]", "organizers", "[slug]", "page.js"), "utf8");
    expect(src).toMatch(/import ContactCard from "@\/app\/\[locale\]\/producer\/\[id\]\/components\/ContactCard"/);
  });
});
