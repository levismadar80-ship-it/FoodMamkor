import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AvailabilityBadge from "@/components/AvailabilityBadge";

describe("AvailabilityBadge", () => {
  describe("card variant", () => {
    it("returns null for status=available (default, don't clutter cards)", () => {
      const { container } = render(
        <AvailabilityBadge status="available" variant="card" />,
      );
      expect(container.innerHTML).toBe("");
    });

    it("renders the 'full' badge with orange dot", () => {
      render(<AvailabilityBadge status="full" variant="card" />);
      expect(screen.getByText("עמוס כרגע")).toBeInTheDocument();
      const badge = screen.getByTestId("availability-badge");
      expect(badge).toHaveAttribute("data-status", "full");
      // Dot is the first child <span>
      const dot = badge.querySelector("span");
      expect(dot).toHaveStyle({ background: "#f97316" });
      expect(dot).toHaveStyle({ width: "8px", height: "8px" });
    });

    it("renders the 'vacation' badge with gray dot", () => {
      render(<AvailabilityBadge status="vacation" variant="card" />);
      expect(screen.getByText("בהפסקה")).toBeInTheDocument();
      const dot = screen
        .getByTestId("availability-badge")
        .querySelector("span");
      expect(dot).toHaveStyle({ background: "#9ca3af" });
    });
  });

  describe("detail variant", () => {
    it("renders 'available' badge with green dot (unlike card, shows default too)", () => {
      render(<AvailabilityBadge status="available" variant="detail" />);
      expect(screen.getByText("פתוח להזמנות")).toBeInTheDocument();
      const dot = screen
        .getByTestId("availability-badge")
        .querySelector("span");
      expect(dot).toHaveStyle({ background: "#22c55e" });
    });

    it("renders 'full' badge", () => {
      render(<AvailabilityBadge status="full" variant="detail" />);
      expect(screen.getByText("עמוס כרגע")).toBeInTheDocument();
    });

    it("renders 'vacation' badge", () => {
      render(<AvailabilityBadge status="vacation" variant="detail" />);
      expect(screen.getByText("בהפסקה")).toBeInTheDocument();
    });
  });

  describe("accessibility + robustness", () => {
    it("sets role=status + aria-label to the Hebrew text", () => {
      render(<AvailabilityBadge status="full" variant="detail" />);
      const badge = screen.getByRole("status");
      expect(badge).toHaveAttribute("aria-label", "עמוס כרגע");
    });

    it("dot is aria-hidden (not announced separately)", () => {
      render(<AvailabilityBadge status="full" variant="detail" />);
      const dot = screen
        .getByTestId("availability-badge")
        .querySelector("span");
      expect(dot).toHaveAttribute("aria-hidden", "true");
    });

    it("treats unknown status as 'available' (forward-compat)", () => {
      render(<AvailabilityBadge status="zzz-future-status" variant="detail" />);
      // Falls back to "available" → green dot + "פתוח להזמנות"
      expect(screen.getByText("פתוח להזמנות")).toBeInTheDocument();
      expect(screen.getByTestId("availability-badge")).toHaveAttribute(
        "data-status",
        "available",
      );
    });

    it("treats unknown status as 'available' on card variant → null", () => {
      const { container } = render(
        <AvailabilityBadge status="zzz-future-status" variant="card" />,
      );
      expect(container.innerHTML).toBe("");
    });
  });
});
