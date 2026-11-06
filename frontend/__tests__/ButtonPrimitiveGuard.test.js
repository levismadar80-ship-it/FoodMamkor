/**
 * MEH-1687 phase 6 — a filled-primary, destructive or outlined action is the
 * shared <Button> (components/ui/Button.jsx), not a hand-styled <button>.
 *
 * The 06/11 sweep found 479 raw <button> elements and zero uses of the
 * primitive. The codemod moved the 97 whose static className was a pure
 * primary / danger / outlined recipe onto <Button variant=…>. This test keeps
 * the count from growing back: a raw <button> whose static className carries
 * one of those recipes is an offender, unless its file is in the ALLOWED
 * ratchet below (sites whose recipe had extra tokens — text-xs, font-bold,
 * inline-block … — that need a per-site look). The ratchet only shrinks.
 * Icon toggles, chips, tabs and unstyled buttons are out of scope.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

export function recipeOf(cls) {
  const t = cls.trim().split(/\s+/);
  if (t.includes("bg-primary") && t.includes("text-white")) return "primary";
  if (t.includes("bg-danger-600") && t.includes("text-white")) return "danger";
  if (t.includes("border-primary") && t.includes("text-primary") && !t.includes("bg-primary")) return "outlined";
  return null;
}

// file → number of recipe-styled raw <button>s still allowed (ratchet, 06/11).
const ALLOWED = {
  "app/[locale]/admin/content/page.js": 1,
  "app/[locale]/admin/experiences/page.js": 2,
  "app/[locale]/admin/kashrut/page.js": 1,
  "app/[locale]/admin/outreach/page.jsx": 1,
  "app/[locale]/admin/recipes/page.js": 2,
  "app/[locale]/admin/settings/page.js": 1,
  "app/[locale]/claim/ClaimClient.jsx": 1,
  "app/[locale]/home/HomeProducersGrid.jsx": 2,
  "app/[locale]/login/LoginClient.jsx": 1,
  "app/[locale]/map/components/MapPane.jsx": 1,
  "app/[locale]/producer/dashboard/edit/cards.jsx": 1,
  "app/[locale]/producer/dashboard/followers/page.js": 1,
  "app/[locale]/producer/dashboard/insights/page.js": 1,
  "app/[locale]/producer/dashboard/tools/page.js": 1,
  "app/[locale]/register/RegisterClient.jsx": 1,
  "components/ChatWidget.jsx": 1,
  "components/FilterSheet.jsx": 1,
  "components/InstallPrompt.jsx": 1,
  "components/ProducersClient.jsx": 2,
  "components/admin/ClaimLinkPanel.jsx": 1,
  "components/dashboard/RescueTab.jsx": 1
};

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (!full.endsWith(`${path.sep}ui`)) walk(full, out); }
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

function count(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  let raw = 0, prim = 0;
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name.name;
      if (n === "Button") prim += 1;
      if (n !== "button") return;
      const ca = p.node.attributes.find((a) => a.type === "JSXAttribute" && a.name.name === "className");
      if (ca?.value?.type === "StringLiteral" && recipeOf(ca.value.value)) raw += 1;
    },
  });
  return { raw, prim };
}

describe("MEH-1687 phase 6 — actions use the shared <Button>", () => {
  it("recipeOf recognises the three recipes and nothing else", () => {
    expect(recipeOf("px-4 py-2 bg-primary text-white rounded-full")).toBe("primary");
    expect(recipeOf("bg-danger-600 text-white")).toBe("danger");
    expect(recipeOf("border border-primary text-primary")).toBe("outlined");
    expect(recipeOf("border border-border hover:border-primary text-text")).toBe(null);
    expect(recipeOf("bg-primary/10 text-primary")).toBe(null);
  });

  it("no new hand-styled primary/danger/outlined <button> outside the ratchet", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    let primitives = 0;
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const { raw, prim } = count(fs.readFileSync(f, "utf8"));
      primitives += prim;
      const allowed = ALLOWED[rel] || 0;
      if (raw > allowed) offenders.push(`${rel}: ${raw} raw recipe buttons (allowed ${allowed})`);
      if (raw < allowed) offenders.push(`${rel}: ratchet is stale — lower ALLOWED to ${raw}`);
    }
    expect(primitives, "corpus control: the primitive must be in use").toBeGreaterThan(90);
    expect(offenders).toEqual([]);
  });
});
