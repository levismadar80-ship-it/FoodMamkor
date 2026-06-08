import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-475 PR-C4a chunk 4b: mock next-intl per established precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = { aria: "תגיות בית עסק" };
    return flat[key] ?? key;
  },
}));

import BadgeRow from "@/components/BadgeRow";

describe("BadgeRow", () => {
  it("renders nothing when the producer has no earned badges", () => {
    const { container } = render(
      <BadgeRow producer={{ verification_tier: null, products_count: 0 }} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders one pill per earned badge", () => {
    render(
      <BadgeRow
        producer={{
          verification_tier: "verified",
          is_recommended: true,
          days_since_created: 5,
        }}
      />,
    );
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.getByText("מומלץ")).toBeInTheDocument();
    expect(screen.getByText("חדש")).toBeInTheDocument();
  });

  it("respects the limit prop (priority order)", () => {
    render(
      <BadgeRow
        limit={2}
        producer={{
          verification_tier: "verified",
          is_recommended: true,
          days_since_created: 5,
          has_delivery: true,
          products_count: 10,
        }}
      />,
    );
    expect(screen.getByText("מאומת")).toBeInTheDocument();
    expect(screen.getByText("מומלץ")).toBeInTheDocument();
    expect(screen.queryByText("חדש")).not.toBeInTheDocument();
    expect(screen.queryByText("משלוח")).not.toBeInTheDocument();
  });

  describe("tooltip interaction", () => {
    beforeEach(() => {
      // Clean DOM between tests — React cleanup is automatic via RTL,
      // but being explicit saves a head-scratch if a portal lingers.
    });

    it("opens on click, closes on second click", () => {
      render(<BadgeRow producer={{ verification_tier: "verified" }} />);
      const btn = screen.getByText("מאומת");
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.click(btn);
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("closes on outside click (mousedown on document body)", () => {
      render(<BadgeRow producer={{ verification_tier: "verified" }} />);
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.mouseDown(document.body);
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
      render(<BadgeRow producer={{ verification_tier: "verified" }} />);
      fireEvent.click(screen.getByText("מאומת"));
      expect(screen.getByTestId("badge-tooltip-verified")).toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      expect(screen.queryByTestId("badge-tooltip-verified")).not.toBeInTheDocument();
    });

    it("badge button has accessible aria-label", () => {
      render(<BadgeRow producer={{ verification_tier: "verified" }} />);
      const btn = screen.getByRole("button", { name: /מאומת/ });
      expect(btn.getAttribute("aria-label")).toContain("מאומת");
      expect(btn.getAttribute("aria-label")).toMatch(/נבדק/);
    });
  });
});
