import { describe, it, expect } from "vitest";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config.js";
import fs from "node:fs";
import path from "node:path";

// MEH-2418: a `hover:` utility must compile behind `@media (hover: hover)` so
// touch screens (iOS keeps :hover on the last tapped element) never show a
// stuck hover state. Compiles the REAL config against one class and reads the
// emitted CSS — red if `future.hoverOnlyWhenSupported` is dropped.
describe("tailwind hover: is gated to hover-capable pointers (MEH-2418)", () => {
  it("wraps hover:border-primary in @media (hover: hover) and (pointer: fine)", async () => {
    const result = await postcss([
      tailwind({ ...config, content: [{ raw: '<a class="hover:border-primary"></a>' }], safelist: [] }),
    ]).process("@tailwind utilities;", { from: undefined });
    const css = result.css.replace(/\s+/g, " ");
    expect(css).toContain(".hover\\:border-primary:hover");
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{ \.hover\\:border-primary:hover/);
  });
});

// With hover gated to fine pointers, a control hidden at rest (`opacity-0`)
// and revealed only by `group-hover:` is never visible on a phone — the photo
// ✕ in the owner dashboard and the admin form were exactly that. A hidden-at-
// rest control must hide only where a pointer can hover:
// `opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100`.
describe("no control is revealed only by hover (MEH-2418)", () => {
  const ROOT = path.resolve(__dirname, "..");
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
      return /\.(jsx?|tsx?)$/.test(e.name) ? [p] : [];
    });
  const files = ["app", "components"].flatMap((d) => walk(path.join(ROOT, d)));

  it("scans a real corpus", () => {
    // Control: the sweep must actually see the files it guards.
    expect(files.some((f) => f.endsWith(path.join("producer", "dashboard", "edit", "cards.jsx")))).toBe(true);
    expect(files.some((f) => f.endsWith(path.join("admin", "ProducerForm.jsx")))).toBe(true);
  });

  // A class list hides a control at rest (`opacity-0`, under any responsive
  // prefix such as `md:`) and reveals it only through a group-hover variant.
  // With hoverOnlyWhenSupported that variant never fires on touch, so the
  // rest state must itself be gated to hover-capable pointers — any token
  // carrying `[@media(hover:hover)...]` is that gate and is exempt.
  const HIDE_AT_REST = /^(?:[a-z0-9]+:)*opacity-0$/;
  const REVEAL_ON_HOVER = /(?:^|:)group-hover:opacity-100$/;
  const offendersIn = (classList) => {
    const tokens = classList.split(/\s+/);
    return (
      tokens.some((t) => HIDE_AT_REST.test(t) && !t.includes("@media(hover")) &&
      tokens.some((t) => REVEAL_ON_HOVER.test(t))
    );
  };

  it("matcher: catches bare and md:-prefixed hide-at-rest, spares the hover-gated form (self-test)", () => {
    expect(offendersIn("opacity-0 group-hover:opacity-100")).toBe(true);
    expect(offendersIn("opacity-30 md:opacity-0 md:group-hover:opacity-100")).toBe(true);
    expect(offendersIn("opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100")).toBe(false);
    expect(offendersIn("opacity-30 md:[@media(hover:hover)_and_(pointer:fine)]:opacity-0 md:group-hover:opacity-100")).toBe(false);
    expect(offendersIn("opacity-0 transition")).toBe(false);
  });

  it("no class list hides a control at rest and reveals it only on group-hover", () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      // "..." literals and `...` template literals (className={`...`}).
      for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        if (offendersIn(m[1] ?? m[2])) offenders.push(path.relative(ROOT, f));
      }
    }
    expect(offenders).toEqual([]);
  });
});
