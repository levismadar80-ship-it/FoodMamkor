/**
 * MEH-3092 — every bordered form field has the field radius and a focus ring.
 *
 * 13/11: half the hand-written fields were rounded-md, half rounded-sm (plus lg
 * and plain `rounded`), and 80 had no focus ring of their own, so each browser
 * drew its own outline. DESIGN.md § Shapes: fields are rounded-sm. Focus is
 * `focus-ring` (or an explicit focus-visible ring).
 *
 * Reads input / textarea / select (not checkbox, radio, hidden, file, range,
 * color, submit) with a `border` class, across every string piece of its
 * className (literal, template, cn(...) args). Fields without a border (chat
 * composer, inline search) are out of scope. A wrapper that owns the field's
 * border (`focus-within:` + border, CitySearch's shape) counts as the field.
 * Blind spot, stated: a className passed as a bare variable has no string to
 * read and is skipped.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const SKIP_TYPES = new Set(["checkbox", "radio", "hidden", "file", "range", "color", "submit"]);
const BORDERED = /(^|\s)border(-2)?(?=\s|$)/;
const FIELD_RADIUS = /(^|\s)rounded-(sm|full|none)(?=\s|$)/;
const OTHER_RADIUS = /(^|\s)rounded(-md|-lg|-xl|-2xl|-3xl)?(?=\s|$)/;
const FOCUS = /focus-ring|focus-visible:ring-|focus:ring-/;

export function fieldIssues(src, seen = { fields: 0 }) {
  if (!/<(input|textarea|select)\b/.test(src)) return [];
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXOpeningElement(p) {
      const n = p.node.name.name;
      const isWrapper = n === "div" && /focus-within:/.test(src.slice(p.node.start, p.node.end));
      if (!["input", "textarea", "select"].includes(n) && !isWrapper) return;
      const attrs = p.node.attributes.filter((a) => a.type === "JSXAttribute");
      const ty = attrs.find((a) => a.name.name === "type");
      if (n === "input" && ty?.value?.type === "StringLiteral" && SKIP_TYPES.has(ty.value.value)) return;
      const ca = attrs.find((a) => a.name.name === "className");
      if (!ca?.value) return;
      const parts = [];
      if (ca.value.type === "StringLiteral") parts.push(ca.value.value);
      else {
        p.traverse({
          StringLiteral(q) { if (q.findParent((x) => x.node === ca)) parts.push(q.node.value); },
          TemplateElement(q) { if (q.findParent((x) => x.node === ca)) parts.push(q.node.value.raw); },
        });
      }
      const all = parts.join(" ");
      if (!BORDERED.test(all)) return;
      seen.fields++;
      const line = p.node.loc.start.line;
      if (!FIELD_RADIUS.test(all)) hits.push(`${n} radius@${line}`);
      else if (OTHER_RADIUS.test(all.replace(/(^|\s)rounded-(sm|full|none)(?=\s|$)/g, " "))) hits.push(`${n} radius@${line}`);
      if (!isWrapper && !FOCUS.test(all)) hits.push(`${n} focus@${line}`);
    },
  });
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

describe("MEH-3092 — form field look", () => {
  it("self-test", () => {
    // anchored to the pre-MEH-3092 RegisterProducerClient.jsx phone field
    expect(fieldIssues('const a = <input className={`w-full border rounded-md px-3 ${e ? "border-danger-400" : ""}`} />;'))
      .toEqual(["input radius@1", "input focus@1"]);
    expect(fieldIssues('const a = <textarea className="w-full border rounded-sm p-3" />;')).toEqual(["textarea focus@1"]);
    expect(fieldIssues('const a = <select className="border rounded-sm px-2 focus-ring" />;')).toEqual([]);
    expect(fieldIssues('const a = <input type="checkbox" className="border rounded" />;')).toEqual([]);
    expect(fieldIssues('const a = <input className="flex-1 bg-transparent outline-none" />;')).toEqual([]);
    // reviewer finding (13/11): the pre-fix CitySearch.jsx:276 wrapper carried the border
    expect(fieldIssues('const a = <div className="flex border rounded-md focus-within:border-primary"><input className="flex-1" /></div>;'))
      .toEqual(["div radius@1"]);
  });

  it("every bordered field in app/ and components/ is rounded-sm with a focus ring", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    const seen = { fields: 0 };
    const offenders = [];
    for (const f of files) {
      const hits = fieldIssues(fs.readFileSync(f, "utf8"), seen);
      if (hits.length) offenders.push(`${path.relative(ROOT, f).split(path.sep).join("/")}: ${hits.join(", ")}`);
    }
    // Proves the walker sees bordered fields at all. Not a floor on how many
    // exist: hand-written fields move into ui/Input as MEH-3102 proceeds (62
    // were left after MEH-3146), and the look then has one owner to check.
    expect(seen.fields, "corpus control: the walker sees bordered fields").toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  }, 60_000); // walks every file in app/ + components/; timed out at 5 s on a loaded CI shard
});
