import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2439 — /about and /about/process "calm pass".
 *
 * 1. Decorative 01/02/03 numerals are gone. The only numerals left on either
 *    page are the four real process steps (they order something a reader
 *    follows), so the check is "every 0N on the page sits inside
 *    process-steps, and there are exactly four" — the old markup had 0N in
 *    the Chapter marks, BENEFITS, VALUES, the Markers and the EVERYONE cards.
 * 2. The founder quote is upright: Frank Ruhl Libre ships no italic, so the
 *    `italic` class was a browser-faked slant.
 * 3. Both closing CTA bands sit on the full brand green (was mint green-50),
 *    the button inverted to cream, with a focus ring that shows on green
 *    (ring-primary/40 on bg-primary is invisible).
 * 4. The process CTA is one column (was md:grid-cols-2).
 * 5. Tip questions are start-aligned when they wrap.
 *
 * Mocks mirror AboutTipsClosed.test.jsx / AboutProcessVerifiedTagContrast.test.jsx.
 */
vi.mock("next-intl", () => ({
  useTranslations: (ns) => {
    const t = (k) => (ns ? `${ns}.${k}` : k);
    t.rich = (k) => (ns ? `${ns}.${k}` : k);
    return t;
  },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));
vi.mock("next/image", () => ({
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
// className passes through, unlike the VerifiedTag test's stub — the CTA's
// own classes are what this file asserts on.
vi.mock("@/components/BusinessCtaLink", () => ({
  default: ({ children, href, className }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  global.IntersectionObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

import AboutClient from "@/app/[locale]/about/AboutClient";
import AboutProcessClient from "@/app/[locale]/about/process/AboutProcessClient";

// Leaf elements whose own text starts with a two-digit ordinal ("01", "03 · ").
const numeralLeaves = (root) =>
  [...root.querySelectorAll("*")].filter((el) => {
    const own = [...el.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.textContent)
      .join("")
      .trim();
    return /^0\d\b/.test(own);
  });

const classes = (el) => el.className.split(/\s+/);

describe("MEH-2439 — /about", () => {
  it("renders no decorative 0N numerals", () => {
    const { container } = render(<AboutClient />);
    expect(numeralLeaves(container).map((el) => el.textContent)).toEqual([]);
  });

  it("the close band is the full brand green with a cream button and a ring that shows on green", () => {
    render(<AboutClient />);
    const band = screen.getByTestId("about-close-process-link").closest("section");
    expect(classes(band)).toContain("bg-primary");
    expect(classes(band)).not.toContain("bg-green-50");
    const cta = band.querySelector('a[href="/map"]');
    expect(classes(cta)).toEqual(expect.arrayContaining(["bg-background", "text-primary"]));
    expect(classes(cta)).toEqual(
      expect.arrayContaining(["focus-visible:ring-gold-on-dark", "focus-visible:ring-offset-primary"]),
    );
    for (const a of band.querySelectorAll("a")) {
      expect(classes(a), a.getAttribute("href")).not.toContain("focus-visible:ring-primary/40");
    }
  });

  it("tip questions are start-aligned", () => {
    render(<AboutClient />);
    const btns = screen
      .getAllByRole("button")
      .filter((b) => (b.getAttribute("aria-controls") || "").startsWith("tip-panel-"));
    expect(btns).toHaveLength(3);
    for (const b of btns) {
      const q = [...b.querySelectorAll("span")].find((s) => s.textContent.includes(".question"));
      expect(classes(q)).toContain("text-start");
    }
  });
});

describe("MEH-2439 — /about/process", () => {
  it("keeps exactly the four step numerals, all inside process-steps, and nothing else", () => {
    const { container } = render(<AboutProcessClient />);
    const steps = screen.getByTestId("process-steps");
    const all = numeralLeaves(container);
    const outside = all.filter((el) => !steps.contains(el));
    expect(outside.map((el) => el.textContent)).toEqual([]);
    expect(all.map((el) => el.textContent.trim())).toEqual(["01", "02", "03", "04"]);
  });

  it("the founder quote is upright", () => {
    render(<AboutProcessClient />);
    const quote = screen.getByTestId("process-closing").querySelector("blockquote");
    expect(quote).not.toBeNull();
    expect(classes(quote)).not.toContain("italic");
  });

  it("the CTA band is the full brand green, one column, cream button with a ring that shows on green", () => {
    render(<AboutProcessClient />);
    const band = screen.getByTestId("process-cta");
    expect(classes(band)).toContain("bg-primary");
    expect(classes(band)).not.toContain("bg-green-50");
    expect(band.querySelector(".md\\:grid-cols-2")).toBeNull();
    const cta = band.querySelector('a[href="/register/producer"]');
    expect(classes(cta)).toEqual(expect.arrayContaining(["bg-background", "text-primary"]));
    expect(classes(cta)).toEqual(
      expect.arrayContaining(["focus-visible:ring-gold-on-dark", "focus-visible:ring-offset-primary"]),
    );
  });
});
