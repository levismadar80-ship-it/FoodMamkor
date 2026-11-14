/**
 * MEH-3020 — a section's h2 on a public page takes its size from a
 * <SectionHeading> role (components/ui/SectionHeading.jsx), not from size
 * classes written at the call site.
 *
 * The 13/11 sweep moved every public SECTION heading onto the component
 * (page role on /about, /about/process, /join; content role on the business
 * page, events, recipes, legal pages …). What is left below are h2s that are
 * NOT section headings — card, sheet, dialog, empty-state and form-step
 * titles, small labels — which keep their own classes on purpose.
 *
 * This is a ratchet, like ButtonPrimitiveGuard: a public file may not gain a
 * hand-sized <h2> beyond its count in ALLOWED, and a file not in ALLOWED may
 * have none. A count that drops must be lowered here in the same PR (the
 * "stale" test), so the list only shrinks. Admin and the business dashboard
 * are out of scope (their own surfaces).
 *
 * Blind spot, on purpose: an h2 whose className is an expression (cn(...), a
 * variable, a conditional inside ${}) contributes only its static text; there
 * is none of those on a public page today (13/11).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

const OUT_OF_SCOPE = /(^|\/)(admin|dashboard|dev|ui)(\/|$)|__tests__|\.(test|spec)\./;

const SIZE = /^(?:[a-z0-9-]+:)*!?(?:text-(?:2xs|xs|sm|base|lg|xl|[2-9]xl|headline-[a-z]+|\[[^\]]+\])|font-(?:headline-[a-z]+|semibold|bold|extrabold|black))$/;

// file → hand-sized <h2> still allowed (none of them a section heading; 13/11).
const ALLOWED = {
  "app/[locale]/about/for-businesses/guides/page.js": 1, // guide card title
  "app/[locale]/about/for-businesses/page.js": 1, // category card title
  "app/[locale]/group-buys/GroupBuysClient.jsx": 1, // group-buy card title
  "app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx": 1, // cancel dialog title
  "app/[locale]/home/HomeStaticBlocks.jsx": 1, // the green «היכרות» band
  "app/[locale]/map/components/MapKey.jsx": 1, // map key panel title
  "app/[locale]/messages/page.js": 1, // small aside label
  "app/[locale]/producers/[category]/[region]/page.js": 2, // chip-row labels
  "app/[locale]/register/producer/RegisterPreflight.jsx": 1, // form step
  "app/[locale]/register/producer/RegisterProducerClient.jsx": 6, // form steps
  "app/[locale]/settings/page.jsx": 5, // account settings cards
  "components/CategoryRequestModal.jsx": 1, // dialog title
  "components/ClosingCtaBand.jsx": 1, // closing band
  "components/EditAccordionCard.jsx": 1, // accordion card title
  "components/FilterSheet.jsx": 1, // sheet title
  "components/FridayDeliveryStrip.jsx": 1, // banner strip
  "components/LocationModal.jsx": 1, // dialog title
  "components/LoginPromptModal.jsx": 1, // dialog title
  "components/ProfileCompletenessCard.jsx": 1, // owner card title
  "components/ReportInfoModal.jsx": 1, // dialog title
  "components/producer/BusinessQrCard.jsx": 1, // owner card title
  "components/producer/OwnerAttentionCard.jsx": 1, // owner card title (MEH-3108, dashboard home)
  "components/ProducersClient.jsx": 2, // empty-state titles
  "components/RecipeForm.jsx": 1, // form title
  "components/RegistrationOverlays.jsx": 1, // sign-up sheet title (MEH-3043)
  "components/producer/RequestReviewCard.jsx": 1, // card title
  "components/producer/ShareKitSection.jsx": 1, // card title
  "components/public/ProductSheet.jsx": 1, // sheet title
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (OUT_OF_SCOPE.test(rel)) continue;
    if (e.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(e.name)) out.push(full);
  }
  return out;
}

export function handSizedH2(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name;
      const tag = n.type === "JSXIdentifier" ? n.name : n.type === "JSXMemberExpression" ? n.property.name : "";
      if (tag !== "h2") return;
      const a = p.node.attributes.find((x) => x.type === "JSXAttribute" && x.name.name === "className");
      const v = a && a.value;
      const cls = !v ? "" : v.type === "StringLiteral" ? v.value
        : v.expression && v.expression.type === "TemplateLiteral" ? v.expression.quasis.map((q) => q.value.cooked).join(" ")
        : v.expression && v.expression.type === "StringLiteral" ? v.expression.value : "";
      if (cls.split(/\s+/).some((t) => SIZE.test(t))) hits.push(p.node.loc.start.line);
    },
  });
  return hits;
}

const counts = {};
for (const f of [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))]) {
  const hits = handSizedH2(fs.readFileSync(f, "utf8"));
  if (hits.length) counts[path.relative(ROOT, f)] = hits;
}

describe("MEH-3020 ratchet self-test", () => {
  it("counts a hand-sized h2 (the pre-fix organizer heading) and ignores an unsized one", () => {
    expect(handSizedH2(`export default () => <h2 id="x" className="text-xl font-bold text-text">a</h2>;`)).toEqual([1]);
    expect(handSizedH2(`export default () => <h2 className="sr-only">a</h2>;`)).toEqual([]);
    expect(handSizedH2(`export default () => <motion.h2 className="md:text-2xl">a</motion.h2>;`)).toEqual([1]);
  });
  it("sees the real tree (the band exception is found where it lives)", () => {
    expect(counts["app/[locale]/home/HomeStaticBlocks.jsx"]?.length).toBe(1);
  });
});

describe("MEH-3020 public section headings use SectionHeading", () => {
  it("no file gains a hand-sized h2", () => {
    const over = Object.entries(counts)
      .filter(([f, hits]) => hits.length > (ALLOWED[f] || 0))
      .map(([f, hits]) => `${f} lines ${hits.join(", ")} (allowed ${ALLOWED[f] || 0}) — a section heading is <SectionHeading>`);
    expect(over).toEqual([]);
  });
  it("the allowance is not stale (lower it when a count drops)", () => {
    const stale = Object.entries(ALLOWED)
      .filter(([f, n]) => (counts[f]?.length || 0) < n)
      .map(([f, n]) => `${f}: allowed ${n}, found ${counts[f]?.length || 0}`);
    expect(stale).toEqual([]);
  });
});
