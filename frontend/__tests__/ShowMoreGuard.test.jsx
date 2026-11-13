/**
 * MEH-3052 — every "show more / show less" expander is the shared
 * components/ui/ShowMore.jsx, so the nine sites cannot drift back into five
 * looks.
 *
 * Part 1 renders the primitive: two sizes, and aria-expanded only when the
 * caller passes `expanded` (a one-way "load more" must not claim it toggles).
 * Part 2 walks app/ + components/ and fails on a raw <button> whose children
 * call t("…show_more…" | "…show_all…" | "…show_less…" | "…load_more…"): that
 * is a hand-rolled expander. A <Link> to "all X" is navigation, not this, and
 * is out of scope.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
import ShowMore from "@/components/ui/ShowMore";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");
const EXPANDER_KEY = /(^|\.)(show_more|show_all\w*|show_less|load_more)$/;
// Buttons that reuse an expander-shaped key for a different job. Each needs a reason.
const NOT_AN_EXPANDER = {
  // «הציגו הכל» resets the map legend's category filter; it grows no list.
  "app/[locale]/map/components/MapPane.jsx": ["map.pane.show_all"],
};

describe("ShowMore primitive (MEH-3052)", () => {
  it("block: outline pill, no aria-expanded when expanded is not given", () => {
    render(<ShowMore onClick={() => {}} label="הצגת עוד ביקורות" />);
    const b = screen.getByRole("button", { name: "הצגת עוד ביקורות" });
    expect(b.getAttribute("data-show-more")).toBe("block");
    expect(b.className).toContain("rounded-full");
    expect(b.className).toContain("border-primary");
    expect(b.hasAttribute("aria-expanded")).toBe(false);
  });

  it("inline: closed → aria-expanded=false, open → true", () => {
    const { rerender } = render(
      <ShowMore size="inline" onClick={() => {}} expanded={false} label="הצגת עוד 3 ערים" />,
    );
    const b = screen.getByRole("button", { name: "הצגת עוד 3 ערים" });
    expect(b.getAttribute("data-show-more")).toBe("inline");
    expect(b.className).toContain("min-h-touch");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    rerender(<ShowMore size="inline" onClick={() => {}} expanded label="הצגת פחות" />);
    expect(screen.getByRole("button", { name: "הצגת פחות" }).getAttribute("aria-expanded")).toBe("true");
  });
});

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(jsx|js)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

/** Raw <button> elements whose subtree calls t()/tX() with an expander key. */
export function handRolledExpanders(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx"] });
  const hits = [];
  traverse(ast, {
    JSXElement(p) {
      if (p.node.openingElement.name.name !== "button") return;
      p.traverse({
        CallExpression(c) {
          const callee = c.node.callee;
          const arg = c.node.arguments[0];
          if (callee.type === "Identifier" && /^t[A-Z]?\w*$/.test(callee.name)
              && arg?.type === "StringLiteral" && EXPANDER_KEY.test(arg.value)) {
            hits.push(`${arg.value}@${p.node.loc.start.line}`);
          }
        },
      });
    },
  });
  return hits;
}

describe("MEH-3052 guard — no hand-rolled show-more <button>", () => {
  it("self-test: flags the pre-MEH-3052 ProducerActivities shape, passes the new one", () => {
    const old = `const X = () => <button type="button" onClick={f} className="mt-4 underline">{t("group_buys.show_all")}</button>;`;
    const nu = `const X = () => <ShowMore onClick={f} label={t("group_buys.show_all_count", { count: 3 })} />;`;
    expect(handRolledExpanders(old)).toEqual(["group_buys.show_all@1"]);
    expect(handRolledExpanders(nu)).toEqual([]);
  });

  it("app/ + components/ carry no raw expander <button>", () => {
    const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));
    expect(files.length, "corpus control").toBeGreaterThan(200);
    let uses = 0;
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      const src = fs.readFileSync(f, "utf8");
      uses += (src.match(/<ShowMore\b/g) || []).length;
      // admin is phone-QA'd too, but its expanders are row disclosures, not lists.
      if (rel.includes("/admin/")) continue;
      const exempt = NOT_AN_EXPANDER[rel] || [];
      for (const h of handRolledExpanders(src)) {
        if (!exempt.includes(h.split("@")[0])) offenders.push(`${rel}: ${h}`);
      }
    }
    // Offenders first: a hand-rolled expander must name itself, not trip the control.
    expect(offenders).toEqual([]);
    expect(uses, "corpus control: the primitive must be in use").toBeGreaterThanOrEqual(6);
  }, 60_000);
});
