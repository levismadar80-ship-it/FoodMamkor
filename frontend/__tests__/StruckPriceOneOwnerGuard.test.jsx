/**
 * MEH-3465 — a crossed-out price is drawn by <StruckPrice>, and only by it.
 *
 * Until 21/11 seven screens each wrote their own: a <span> with `line-through`
 * here, an <s> there, hidden from screen readers in the rescue rows and read
 * aloud as a second bare price in the group-buy cards.
 *
 * 1. Behaviour: what <StruckPrice> renders (tag, direction, the strike, and
 *    whether a screen reader hears it).
 * 2. Guard: a struck element (an <s>, or a className with `line-through`)
 *    whose content is a price (formatPrice / shekels / a t("…price…") call)
 *    outside StruckPrice.jsx fails, unless its file is listed below with the
 *    reason. A file not in the list going red is the point.
 *
 * Blind spot, on purpose: a price reached through a variable
 * (`{priceText}`) is not seen; every site in the tree today calls the
 * formatter inline.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import traverseMod from "@babel/traverse";
import StruckPrice from "@/components/ui/StruckPrice";

const traverse = traverseMod.default || traverseMod;
const ROOT = path.resolve(__dirname, "..");

describe("StruckPrice renders", () => {
  it("an <s>, left-to-right, muted and struck, hidden from screen readers by default", () => {
    const { container } = render(<StruckPrice className="text-xs numeric">48₪</StruckPrice>);
    const el = container.firstElementChild;
    expect(el.tagName).toBe("S");
    expect(el.getAttribute("dir")).toBe("ltr");
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.className.split(" ")).toEqual(
      expect.arrayContaining(["text-fg-muted", "line-through", "text-xs", "numeric"]),
    );
    expect(el.textContent).toBe("48₪");
  });

  it("is announced when decorative is false (it has its own visible label)", () => {
    const { container } = render(<StruckPrice decorative={false}>60₪</StruckPrice>);
    expect(container.firstElementChild.hasAttribute("aria-hidden")).toBe(false);
  });

  it("carries a test id when one is given, and none otherwise", () => {
    const { getByTestId, container } = render(
      <>
        <StruckPrice testId="worth">50 ₪</StruckPrice>
        <StruckPrice>40 ₪</StruckPrice>
      </>,
    );
    expect(getByTestId("worth").textContent).toBe("50 ₪");
    expect(container.querySelectorAll("[data-testid]")).toHaveLength(1);
  });
});

// Files allowed to strike a price by hand, with the reason. Keep it short.
const HAND_STRUCK_ALLOWED = {
  // Open PR #5044 rewrites both (OfferCard); the follow-up moves them here.
  "app/[locale]/producer/[id]/components/ProducerActivities.jsx": "#5044 owns it",
  "components/rescue/RescueSection.jsx": "#5044 owns it",
  "components/ui/OfferCard.jsx": "added by #5044; moves to StruckPrice after it",
};

const SCAN_DIRS = ["app", "components"];
const SKIP = /__tests__|\.(test|spec)\.|node_modules|\.next/;
const PRICE_CALL = /^(formatPrice|shekels)$/;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.test(p)) continue;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(jsx?|tsx?)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Every string in the className, so `cond ? "line-through" : ""` and
// `cn("…", "line-through")` count as struck too.
function classText(opening) {
  const attr = opening.attributes.find((a) => a.type === "JSXAttribute" && a.name?.name === "className");
  if (!attr?.value) return "";
  if (attr.value.type === "StringLiteral") return attr.value.value;
  const parts = [];
  const visit = (n) => {
    if (!n || typeof n !== "object") return;
    if (n.type === "StringLiteral") parts.push(n.value);
    else if (n.type === "TemplateElement") parts.push(n.value.raw);
    for (const k of Object.keys(n)) {
      if (k === "loc" || k === "start" || k === "end") continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === "object" && v.type) visit(v);
    }
  };
  visit(attr.value.expression);
  return parts.join(" ");
}

/** Struck elements whose content calls a price formatter. */
export function handStruckPrices(src) {
  const ast = parse(src, { sourceType: "module", plugins: ["jsx", "typescript"], errorRecovery: true });
  const hits = [];
  traverse(ast, {
    JSXElement(p) {
      const op = p.node.openingElement;
      const name = op.name.type === "JSXIdentifier" ? op.name.name : "";
      const struck = name === "s" || /(^|\s)line-through(\s|$)/.test(classText(op));
      if (!struck) return;
      let price = false;
      p.traverse({
        CallExpression(c) {
          const callee = c.node.callee;
          if (callee.type === "Identifier" && PRICE_CALL.test(callee.name)) price = true;
          const a0 = c.node.arguments[0];
          if (callee.type === "Identifier" && callee.name === "t" && a0?.type === "StringLiteral" && /price/.test(a0.value))
            price = true;
        },
      });
      if (price) hits.push(op.loc?.start.line);
    },
  });
  return hits;
}

describe("handStruckPrices (self-test)", () => {
  it("sees a span with line-through around formatPrice, and an <s> around t('row.price')", () => {
    expect(handStruckPrices(`const a = <span className="text-fg-muted line-through">{formatPrice(4)}</span>;`)).toHaveLength(1);
    expect(handStruckPrices(`const a = <s dir="ltr">{t("row.price", { price })}</s>;`)).toHaveLength(1);
  });

  it("sees line-through inside a conditional or a cn() className", () => {
    expect(handStruckPrices(`const a = <span className={old ? "text-xs line-through" : ""}>{formatPrice(4)}</span>;`)).toHaveLength(1);
    expect(handStruckPrices(`const a = <span className={cn("text-xs", \`line-through \${x}\`)}>{formatPrice(4)}</span>;`)).toHaveLength(1);
  });

  it("ignores struck text that is not a price, and StruckPrice itself", () => {
    expect(handStruckPrices(`const a = <span className="line-through">{r.name}</span>;`)).toHaveLength(0);
    expect(handStruckPrices(`const a = <StruckPrice>{formatPrice(4)}</StruckPrice>;`)).toHaveLength(0);
  });

  it("leaves a real file whose struck text is a name, not a price", () => {
    const src = fs.readFileSync(path.join(ROOT, "components/RegistrationsList.jsx"), "utf8");
    expect(src).toMatch(/line-through/); // the anchor still has a strike to ignore
    expect(handStruckPrices(src)).toHaveLength(0);
  });
});

describe("one owner for a struck price", () => {
  it("no file outside the allowed list strikes a price by hand", () => {
    const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d), []));
    expect(files.length).toBeGreaterThan(100);
    const offenders = [];
    for (const f of files) {
      const rel = path.relative(ROOT, f).split(path.sep).join("/");
      if (rel === "components/ui/StruckPrice.jsx" || rel in HAND_STRUCK_ALLOWED) continue;
      const lines = handStruckPrices(fs.readFileSync(f, "utf8"));
      for (const l of lines) offenders.push(`${rel}:${l}`);
    }
    expect(offenders, "use <StruckPrice> from components/ui/StruckPrice.jsx").toEqual([]);
    // It parses every source file: ~2 s alone, past the 5 s default on a CI
    // shard that runs ts-check beside it (timed out on #5126). Same bound as DateFormatGuard.
  }, 60_000);
});
