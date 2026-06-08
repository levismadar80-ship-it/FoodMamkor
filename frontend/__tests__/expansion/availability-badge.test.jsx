/**
 * Mutation-guided test expansion (2026-06, Refs MEH-214) — domain B7.
 *
 * AvailabilityBadge MEH-291 4-state coverage. The pre-existing
 * AvailabilityBadge.test.jsx covers ONLY the legacy 3 states (available /
 * full / vacation). The new availability_state values (accepting_orders,
 * available_today, full_this_week, on_vacation) had config in STATUS_CONFIG
 * but ZERO test coverage — this file closes that gap.
 *
 * Each test kills a specific mutant from the plan doc
 * (docs/testing/2026-06-mutation-test-plan.md, domain B7). All kills were
 * verified locally: apply mutant → vitest red → git checkout → vitest green.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mirror the next-intl mock from the sibling AvailabilityBadge.test.jsx so
// label keys resolve to the real Hebrew copy (messages/he.json card_label.*).
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      "status_label.open_orders": "פתוח להזמנות",
      "status_label.busy_week": "עמוס כרגע",
      "status_label.on_vacation": "בהפסקה",
      "card_label.open_orders": "פתוח להזמנות",
      "card_label.available_today": "זמינה היום 🟢",
      "card_label.busy_week": "עמוסה השבוע 🟠",
      "card_label.on_vacation": "בהפסקה ⏸",
    };
    return flat[key] ?? key;
  },
}));

import AvailabilityBadge from "@/components/AvailabilityBadge";

const dotOf = () =>
  screen.getByTestId("availability-badge").querySelector("span");

describe("AvailabilityBadge — MEH-291 new states (expansion B7)", () => {
  describe("available_today", () => {
    // Kills FB-1: color #2e6853 → #22c55e
    it("renders on card with the dark-green dot (#2e6853) and emoji label", () => {
      render(<AvailabilityBadge status="available_today" variant="card" />);
      expect(screen.getByText("זמינה היום 🟢")).toBeInTheDocument();
      expect(dotOf()).toHaveStyle({ background: "#2e6853" });
      expect(screen.getByTestId("availability-badge")).toHaveAttribute(
        "data-status",
        "available_today",
      );
    });

    // Kills FB-3: available_today added to CARD_HIDDEN_STATES would null it out.
    it("is NOT suppressed on the card variant (it's an exceptional state)", () => {
      const { container } = render(
        <AvailabilityBadge status="available_today" variant="card" />,
      );
      expect(container.innerHTML).not.toBe("");
    });
  });

  describe("full_this_week", () => {
    it("renders with the orange dot (#f97316) and emoji label on card", () => {
      render(<AvailabilityBadge status="full_this_week" variant="card" />);
      expect(screen.getByText("עמוסה השבוע 🟠")).toBeInTheDocument();
      expect(dotOf()).toHaveStyle({ background: "#f97316" });
    });
  });

  describe("on_vacation", () => {
    // Kills FB-2: color #9ca3af → #22c55e
    it("renders with the gray dot (#9ca3af) and pause-emoji label on card", () => {
      render(<AvailabilityBadge status="on_vacation" variant="card" />);
      expect(screen.getByText("בהפסקה ⏸")).toBeInTheDocument();
      expect(dotOf()).toHaveStyle({ background: "#9ca3af" });
    });

    // Kills FB-4: on_vacation added to CARD_HIDDEN_STATES would null it out.
    it("is NOT suppressed on the card variant (vacation must be visible)", () => {
      const { container } = render(
        <AvailabilityBadge status="on_vacation" variant="card" />,
      );
      expect(container.innerHTML).not.toBe("");
      expect(screen.getByTestId("availability-badge")).toHaveAttribute(
        "data-status",
        "on_vacation",
      );
    });
  });

  describe("accepting_orders (the new default-open state)", () => {
    // Kills FB-6 (one direction): card must SUPPRESS the default-open state.
    it("returns null on the card variant (don't clutter listings)", () => {
      const { container } = render(
        <AvailabilityBadge status="accepting_orders" variant="card" />,
      );
      expect(container.innerHTML).toBe("");
    });

    // Kills FB-5: labelKey card_label.open_orders → card_label.available_today
    // and FB-6 (other direction): detail must SHOW the default-open state.
    it("renders on the detail variant with green dot and open-orders label", () => {
      render(<AvailabilityBadge status="accepting_orders" variant="detail" />);
      expect(screen.getByText("פתוח להזמנות")).toBeInTheDocument();
      expect(dotOf()).toHaveStyle({ background: "#22c55e" });
    });
  });

  describe("card-suppression set is exactly the two default-open states", () => {
    // Kills FB-6: inverting CARD_HIDDEN_STATES.has() would hide the
    // exceptional states and show the default ones. This locks the contract:
    // exceptional states render on card, default-open states do not.
    it("full_this_week renders on card while accepting_orders is hidden", () => {
      const exceptional = render(
        <AvailabilityBadge status="full_this_week" variant="card" />,
      );
      expect(exceptional.container.innerHTML).not.toBe("");
      exceptional.unmount();

      const dflt = render(
        <AvailabilityBadge status="accepting_orders" variant="card" />,
      );
      expect(dflt.container.innerHTML).toBe("");
    });
  });
});
