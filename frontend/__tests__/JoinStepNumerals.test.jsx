import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * MEH-2564 — the /join step numbers stay (ordered process) but read as a small
 * green timeline badge in the Hebrew body font, not 5xl gold Latin "01–04".
 */

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async () => (key) => key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/components/BusinessCtaLink", () => ({ default: ({ children }) => <a>{children}</a> }));

import JoinPage from "@/app/[locale]/join/page";

describe("MEH-2564 · /join step numerals", () => {
  it("renders 1–4 as small brand-green badges in the body font", async () => {
    render(await JoinPage({ params: Promise.resolve({ locale: "he" }) }));
    const nums = screen.getAllByTestId("join-step-numeral");
    expect(nums.map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
    for (const n of nums) {
      const cls = n.className.split(/\s+/);
      expect(cls).toContain("text-primary");
      expect(cls).not.toContain("font-english");
      expect(cls).not.toContain("text-accent");
      expect(cls.some((c) => /^text-(3xl|4xl|5xl|6xl)$/.test(c))).toBe(false);
    }
  });
});
