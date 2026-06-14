import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// next/link renders a plain <a> under jsdom; mock it to the href/children
// passthrough used across the existing suite.
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import Link from "@/components/ui/Link";

describe("ui/Link", () => {
  it("renders an anchor with the href and children", () => {
    render(<Link href="/about">קראו עוד</Link>);
    const a = screen.getByRole("link", { name: "קראו עוד" });
    expect(a).toHaveAttribute("href", "/about");
  });

  it("applies the default variant classes", () => {
    render(<Link href="/x">x</Link>);
    expect(screen.getByRole("link").className).toContain("text-primary");
  });

  it("applies the muted variant classes", () => {
    render(
      <Link href="/x" variant="muted">
        x
      </Link>,
    );
    expect(screen.getByRole("link").className).toContain("text-fg-muted");
  });

  it("falls back to the default variant for an unknown variant", () => {
    render(
      <Link href="/x" variant="bogus">
        x
      </Link>,
    );
    expect(screen.getByRole("link").className).toContain("text-primary");
  });

  it("marks an active nav link with aria-current=page and the gold underline", () => {
    render(
      <Link href="/map" variant="nav" active>
        מפה
      </Link>,
    );
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("aria-current", "page");
    expect(a.className).toContain("after:bg-accent");
  });

  it("does not set aria-current on a non-active nav link", () => {
    render(
      <Link href="/map" variant="nav">
        מפה
      </Link>,
    );
    expect(screen.getByRole("link")).not.toHaveAttribute("aria-current");
  });

  it("merges a custom className", () => {
    render(
      <Link href="/x" className="extra">
        x
      </Link>,
    );
    expect(screen.getByRole("link").className).toContain("extra");
  });
});
