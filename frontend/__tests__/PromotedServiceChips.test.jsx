/**
 * MEH-2598 — the shared promoted service chips (home, /producers, /map).
 * Pins the component's own contract in one place: it renders nothing for an
 * empty list, only what the caller's (already-gated) list carries, and always
 * in SERVICE_CHIP_KEYS order regardless of the input order.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@phosphor-icons/react", async (importOriginal) => ({
  ...(await importOriginal()),
  Check: () => <span data-testid="check" />,
}));

import PromotedServiceChips from "@/components/PromotedServiceChips";
import { SERVICE_CHIP_KEYS } from "@/lib/map-chips";

const CHIP = (key) => ({ key, label: `L-${key}` });
const ids = () => screen.queryAllByRole("button").map((b) => b.getAttribute("data-testid"));

describe("PromotedServiceChips (MEH-2598)", () => {
  it("renders nothing when the gated list is empty", () => {
    render(<PromotedServiceChips chips={[]} onToggle={() => {}} testIdPrefix="t" />);
    expect(ids()).toEqual([]);
  });

  it("renders one chip when the list holds one service axis", () => {
    render(<PromotedServiceChips chips={[CHIP("pickup_points")]} onToggle={() => {}} testIdPrefix="t" />);
    expect(ids()).toEqual(["t-pickup_points"]);
  });

  it("orders by SERVICE_CHIP_KEYS, not by input order, and skips non-service axes", () => {
    const input = [CHIP("on_site"), CHIP("verified"), CHIP("pickup_points"), CHIP("has_delivery")];
    render(<PromotedServiceChips chips={input} onToggle={() => {}} testIdPrefix="t" />);
    expect(ids()).toEqual(SERVICE_CHIP_KEYS.map((k) => `t-${k}`));
  });

  it("leaves out a gated-out axis (on_site absent from the list)", () => {
    render(
      <PromotedServiceChips
        chips={[CHIP("has_delivery"), CHIP("pickup_points")]}
        onToggle={() => {}}
        testIdPrefix="t"
      />,
    );
    expect(ids()).toEqual(["t-has_delivery", "t-pickup_points"]);
  });

  it("marks the active chip pressed with ✓ and reports the key on tap", () => {
    const onToggle = vi.fn();
    render(
      <PromotedServiceChips
        chips={[CHIP("has_delivery"), CHIP("on_site")]}
        chipState={{ on_site: true }}
        onToggle={onToggle}
        testIdPrefix="t"
      />,
    );
    expect(screen.getByTestId("t-on_site")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("t-has_delivery")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByTestId("check")).toHaveLength(1);
    fireEvent.click(screen.getByTestId("t-has_delivery"));
    expect(onToggle).toHaveBeenCalledWith("has_delivery");
  });
});
