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

  it("no class list combines a bare opacity-0 with group-hover:opacity-100", () => {
    const offenders = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        const tokens = m[1].split(/\s+/);
        if (tokens.includes("opacity-0") && tokens.includes("group-hover:opacity-100")) {
          offenders.push(path.relative(ROOT, f));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
