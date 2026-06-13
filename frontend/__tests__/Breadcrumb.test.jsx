import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key) => (key === "aria" ? "פירורי לחם" : key),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import Breadcrumb from "@/components/Breadcrumb";

const ITEMS = [
  { href: "/", label: "בית" },
  { href: "/events", label: "אירועים" },
  { label: "ערב טעימות" }, // current page — no href
];

describe("Breadcrumb", () => {
  it("renders nothing when items is empty", () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when items is omitted", () => {
    const { container } = render(<Breadcrumb />);
    expect(container.innerHTML).toBe("");
  });

  it("exposes a localized nav landmark", () => {
    render(<Breadcrumb items={ITEMS} />);
    expect(screen.getByRole("navigation", { name: "פירורי לחם" })).toBeInTheDocument();
  });

  it("renders non-last items with an href as links", () => {
    render(<Breadcrumb items={ITEMS} />);
    expect(screen.getByRole("link", { name: "בית" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "אירועים" })).toHaveAttribute(
      "href",
      "/events",
    );
  });

  it("renders the last item as plain text with aria-current=page (no link)", () => {
    render(<Breadcrumb items={ITEMS} />);
    expect(screen.queryByRole("link", { name: "ערב טעימות" })).not.toBeInTheDocument();
    const current = screen.getByText("ערב טעימות");
    expect(current).toHaveAttribute("aria-current", "page");
  });

  it("renders a separator between items but not after the last", () => {
    const { container } = render(<Breadcrumb items={ITEMS} />);
    const separators = container.querySelectorAll('[aria-hidden="true"]');
    expect(separators).toHaveLength(ITEMS.length - 1);
  });

  it("renders a non-last item without href as plain text", () => {
    render(
      <Breadcrumb
        items={[{ label: "ללא קישור" }, { label: "אחרון" }]}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("ללא קישור")).toBeInTheDocument();
  });
});
