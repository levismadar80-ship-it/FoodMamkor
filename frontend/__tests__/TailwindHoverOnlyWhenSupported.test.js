import { describe, it, expect } from "vitest";
import postcss from "postcss";
import tailwind from "tailwindcss";
import config from "../tailwind.config.js";

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
