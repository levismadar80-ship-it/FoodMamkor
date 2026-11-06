import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// MEH-2747: one section order on phone and desktop, and it is the DOM order.
//
// Sapir noticed the homepage mini-map sat in a different place on her iPhone
// than on desktop. Cause: MEH-2635 moved it with a flex wrapper + `order-last`
// below `md`. CSS `order` (and `*-reverse`, explicit `row-start-*`) changes
// only what is painted — VoiceOver, the keyboard and the DOM still walk the
// source order, so the screen and the screen reader disagree (WCAG 1.3.2
// Meaningful Sequence, 2.4.3 Focus Order; W3C technique C27, failure F1), and
// every breakpoint-scoped reorder is a second page order to keep in sync.
//
// The rule this guard enforces: a page reaches a different order by moving
// the JSX, never with a visual-reorder utility. It reads every source file
// under app/ and components/ and fails on any reorder utility inside a class
// string that is not in ALLOWED below. Each allowance says why it is not a
// section reorder; a new one needs the same.

const ROOT = path.join(__dirname, "..");
const DIRS = ["app", "components"];

// Tailwind reorder utilities, with any variant prefix (`md:`, `max-md:`,
// `rtl:`…). `flex-row-reverse` is included: in RTL it is the usual way a
// direction bug gets "fixed" by hand, and it reorders focus the same way.
export const REORDER = /(?:^|[\s"'`{])((?:[a-z0-9-]+:)*(?:order-(?:first|last|none|\d+|\[[^\]]+\])|flex-(?:row|col|wrap)-reverse|row-start-(?:\d+|auto|\[[^\]]+\])))(?=[\s"'`}]|$)/g;

// file (relative to frontend/) → exact count of reorder tokens allowed, and why.
const ALLOWED = {
  // Toast stack: newest toast at the bottom edge. Not page sections; toasts
  // are a live region announced on insert, not read in sequence.
  "components/Toaster.jsx": { count: 1, why: "toast stack direction, live region" },
  // Inside ONE card: the desktop banner image is decorative (aria-hidden,
  // no focusable content) and the mobile thumbnail is a separate node.
  "components/EventEntryRow.jsx": { count: 1, why: "decorative image inside a card" },
  // Login / register split layout: the hero pane is `hidden` below lg and
  // decorative above it; the form is the only content on both viewports.
  "components/auth/AuthSplitLayout.jsx": { count: 2, why: "decorative hero pane beside the form" },
  "app/[locale]/login/LoginClient.jsx": { count: 2, why: "decorative hero pane beside the form" },
  "app/[locale]/register/RegisterClient.jsx": { count: 2, why: "decorative hero pane beside the form" },
  // Detail pages: the info card sits between header and body in the DOM, so
  // phones read header → card → body; at lg it is lifted into the side column
  // next to the header. Same reading order, sidebar pattern.
  "app/[locale]/events/[id]/EventDetailClient.jsx": { count: 1, why: "sidebar card, DOM order kept" },
  "app/[locale]/experiences/[id]/ExperienceDetailClient.jsx": { count: 1, why: "sidebar card, DOM order kept" },
  "app/[locale]/group-buys/[id]/GroupBuyDetailClient.jsx": { count: 1, why: "sidebar card, DOM order kept" },
};

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full);
    return /\.(js|jsx|ts|tsx)$/.test(e.name) ? [full] : [];
  });
}

// Only class strings count — comments that NAME a utility (like this file's
// header, or HomeClient's MEH-2747 note) must not trip the guard.
const CLASS_STRING = /className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})|\b(?:cn|clsx|twMerge)\([^)]*\)/g;

export function reorderTokens(src) {
  const out = [];
  for (const m of src.matchAll(CLASS_STRING)) {
    for (const t of m[0].matchAll(REORDER)) out.push(t[1]);
  }
  return out;
}

describe("guard self-test (MEH-1619 — the check must be able to fail)", () => {
  it("catches the MEH-2635 wrapper, verbatim", () => {
    const old = `<div className="flex flex-col md:block max-md:[&>*]:w-full max-md:[&>*]:min-w-0">
        <div className="order-last md:order-none" data-testid="home-minimap-slot">`;
    expect(reorderTokens(old)).toEqual(["order-last", "md:order-none"]);
  });

  it("catches reverse and row placement, in template literals too", () => {
    expect(reorderTokens('<ul className={`flex ${a} md:flex-row-reverse`}>')).toEqual(["md:flex-row-reverse"]);
    expect(reorderTokens('<aside className="lg:row-start-1 lg:col-start-2">')).toEqual(["lg:row-start-1"]);
  });

  it("ignores comments and look-alike classes", () => {
    expect(reorderTokens("// the map carries `order-last` on phones")).toEqual([]);
    expect(reorderTokens('<div className="border-order-x reorder-last orderly">')).toEqual([]);
  });

  it("anchors to a real file: HomeClient.jsx has no reorder left", () => {
    const real = fs.readFileSync(path.join(ROOT, "app", "[locale]", "home", "HomeClient.jsx"), "utf8");
    expect(real).toMatch(/order-last/); // named in a comment, so the file is the right one…
    expect(reorderTokens(real)).toEqual([]); // …and none of it is in a class string.
  });
});

describe("no section is reordered with CSS (MEH-2747)", () => {
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d))).map((f) => {
    const rel = path.relative(ROOT, f).split(path.sep).join("/");
    return { rel, tokens: reorderTokens(fs.readFileSync(f, "utf8")) };
  });

  it("scanned the real tree", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it("every reorder utility is in a reasoned allowance, at its exact count", () => {
    const bad = files
      .filter((f) => f.tokens.length !== (ALLOWED[f.rel]?.count ?? 0))
      .map((f) => `${f.rel}: ${f.tokens.length} (${f.tokens.join(", ") || "none"}), allowed ${ALLOWED[f.rel]?.count ?? 0}`);
    expect(
      bad,
      "Move the JSX instead of reordering with CSS, so phone, desktop and screen readers share one order. " +
        "If this is not a section reorder, add the file to ALLOWED with the reason.",
    ).toEqual([]);
  });
});
