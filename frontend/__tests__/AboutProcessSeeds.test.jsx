import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AboutProcessClient from "@/app/[locale]/about/process/AboutProcessClient";

// MEH-2069: this VerifiedTag renders inside the bg-background-alt section
// (#ede4d2, NOT the cream #f5f0e8 page default) — bg-accent/10 there computed
// 3.68:1, AA fail for the 12.5px chip text (worse than the 4.07:1 cream case
// MEH-2032/#2909 fixed in BadgeRow.jsx). Same usage-level fix: solid
// bg-surface-card gets text-accent to 5.19:1, independent of the page
// background since the chip is now fully opaque. Asserts the FIXED class is
// present and the FAILING one is gone — a presence-only check on
// bg-surface-card alone couldn't distinguish "fixed" from "never had the
// bug" (mirrors BadgeRow.test.jsx's MEH-2032 case).

vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (k) => (ns ? `${ns}.${k}` : k);
    t.rich = (k) => (ns ? `${ns}.${k}` : k);
    return t;
  },
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return Object.fromEntries(
    [
      "Path", "PaperPlaneTilt", "ChatsCircle", "MapPin", "Storefront",
      "SealCheck", "User", "BookOpen", "ChatCircleText", "Certificate",
      "Leaf", "Note", "HandHeart", "Cursor", "ArrowLeft",
    ].map((name) => [name, Stub]),
  );
});
vi.mock("@/components/BusinessCtaLink", () => ({
  default: ({ children }) => <a href="/register/producer">{children}</a>,
}));

import { SEEDS_LIGHT } from "@/lib/brand-seeds";

/**
 * MEH-2833 PR 4 (seed layer, board 3) — each /about/process step is a 40×60
 * seed in logo order (green, terracotta, gold, sage — no sand) with its
 * number on it: cream on the dark seeds, text-ink on gold; 20px bold (WCAG
 * large text). The numeral circle is gone.
 */
const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255);
const lum = (h) => { const [r, g, b] = hex(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("/about/process steps on seeds (MEH-2833)", () => {
  it("four seeds in logo order without sand, numbers 1–4 as real text", () => {
    const { container } = render(<AboutProcessClient />);
    const marks = [...container.querySelectorAll('[data-testid="process-step-seed"]')];
    expect(marks.map((m) => m.getAttribute("data-seed"))).toEqual(["green", "terracotta", "gold", "sage"]);
    expect(marks.map((m) => m.textContent.trim())).toEqual(["1", "2", "3", "4"]);
    for (const m of marks) {
      expect(m.getAttribute("aria-hidden")).toBeNull();
      const svg = m.querySelector("svg");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["40", "60"]);
      // the box is the seed's own size (no 4px of seed hanging out of it)
      expect(m.className).toMatch(/\bw-10 h-\[60px\]/);
      // no inner highlight under the number (it would drop cream below 3:1)
      expect(svg.querySelector("ellipse")).toBeNull();
    }
    // The old numeral circle is gone from the steps.
    expect(container.querySelector('[data-testid="process-steps"] .rounded-full.border-accent')).toBeNull();
  });

  it("number ink: cream on the dark seeds, text on gold — each ≥ 3:1 at 20px bold (large text)", () => {
    const { container } = render(<AboutProcessClient />);
    const INK = { "text-background": "#F5F0E8", "text-text": "#1C1A17" };
    const marks = container.querySelectorAll('[data-testid="process-step-seed"]');
    expect(marks).toHaveLength(4); // a loop over none would pass vacuously
    for (const m of marks) {
      const name = m.getAttribute("data-seed");
      const num = m.querySelector("span");
      const cls = num.className.split(/\s+/);
      expect(cls).toEqual(expect.arrayContaining(["text-xl", "font-bold"]));
      const ink = cls.find((c) => c in INK);
      expect(ink).toBe(name === "gold" ? "text-text" : "text-background");
      const fill = SEEDS_LIGHT.find((s) => s.name === name).fill;
      expect(contrast(INK[ink], fill)).toBeGreaterThanOrEqual(3);
    }
  });
});
