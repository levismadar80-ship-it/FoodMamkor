import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2400: the breadcrumb "בית" link measured 20×20px on /events, /producers
// and the recipe pages — under WCAG 2.5.8's 24×24 minimum, with only the 8px
// `mx-2` separator beside it. jsdom applies no Tailwind, so the cell asserts
// the contract the CSS keys on: every linked crumb carries the min-height /
// min-width utilities. The current-page span is not a target and stays as is.
vi.mock("next-intl", () => ({ useTranslations: () => (key) => key }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

import Breadcrumb from "@/components/Breadcrumb";

const ITEMS = [
  { href: "/", label: "בית" },
  { href: "/events", label: "אירועים" },
  { label: "שוק איכרים" },
];

describe("Breadcrumb links meet the 24px target minimum (MEH-2400)", () => {
  it("every linked crumb carries min-h-[24px] and min-w-[24px]", () => {
    render(<Breadcrumb items={ITEMS} />);
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["בית", "אירועים"]);
    for (const a of links) {
      expect(a.classList.contains("min-h-[24px]")).toBe(true);
      expect(a.classList.contains("min-w-[24px]")).toBe(true);
      expect(a.classList.contains("inline-flex")).toBe(true);
    }
  });

  it("the current page stays a plain span with aria-current", () => {
    render(<Breadcrumb items={ITEMS} />);
    const current = screen.getByText("שוק איכרים");
    expect(current.tagName).toBe("SPAN");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("control: a single item renders no link at all", () => {
    render(<Breadcrumb items={[{ label: "בית" }]} />);
    expect(screen.queryAllByRole("link")).toEqual([]);
  });
});
