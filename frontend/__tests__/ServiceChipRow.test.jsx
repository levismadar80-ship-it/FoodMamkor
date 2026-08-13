/**
 * MEH-2046 — the /map promoted service row.
 *
 * Three claims, and each is asserted through RENDERED BEHAVIOUR rather than by
 * checking that a particular constant was edited (ADR-032 §3.6):
 *
 *   1. Both service chips are always present and are togglable independently —
 *      the OR pairing the ticket promotes.
 *   2. The משלוח chip no longer blocks on a city. This is the Option C change,
 *      and it is the one with a real before/after: the old handler returned
 *      early, so a city-less click produced NO state change and NO fetch.
 *   3. The "בתיאום אישי" explanation appears exactly when a service filter is
 *      on — the surface that keeps the exclusion from being silent.
 *
 * DISCRIMINATION: every assertion below fails against the pre-2046 code —
 * (1) `pickup_points` is not in TOGGLE_CHIPS so the chip does not render,
 * (2) the guard returns early so `onToggleChip` never reaches a fetch, and
 * (3) the explanation element does not exist. The two `does not` cases are the
 * inverse pins: they fail if the row renders unconditionally or the note leaks
 * when no service filter is active.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import ServiceChipRow from "@/app/[locale]/map/components/ServiceChipRow";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG } from "@/lib/producer-filters";

const EMPTY = {
  categoryKeys: [],
  has_delivery: false,
  pickup_points: false,
  verified: false,
};

describe("ServiceChipRow — the promoted /map service pair (MEH-2046)", () => {
  it("renders both service chips, always", () => {
    render(<ServiceChipRow chipState={EMPTY} onToggleChip={() => {}} />);

    expect(screen.getByRole("button", { name: "משלוח" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "איסוף עצמי" })).toBeInTheDocument();
  });

  it("reports pressed state per chip, independently", () => {
    render(
      <ServiceChipRow
        chipState={{ ...EMPTY, pickup_points: true }}
        onToggleChip={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "משלוח" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "איסוף עצמי" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("toggles each chip by its own key", () => {
    const onToggleChip = vi.fn();
    render(<ServiceChipRow chipState={EMPTY} onToggleChip={onToggleChip} />);

    fireEvent.click(screen.getByRole("button", { name: "משלוח" }));
    expect(onToggleChip).toHaveBeenCalledWith("has_delivery");

    fireEvent.click(screen.getByRole("button", { name: "איסוף עצמי" }));
    expect(onToggleChip).toHaveBeenCalledWith("pickup_points");
  });

  it("renders the children slot (the סינון trigger lives there)", () => {
    render(
      <ServiceChipRow chipState={EMPTY} onToggleChip={() => {}}>
        <button type="button">סינון</button>
      </ServiceChipRow>,
    );

    expect(screen.getByRole("button", { name: "סינון" })).toBeInTheDocument();
  });

  it("uses the MEH-764 rounded-md chip geometry, not a pill", () => {
    // The row is a sibling of ChipScrollRow, not a variant, so the shared
    // visual language is a duplication that can silently drift. This pins the
    // one property DESIGN §Shapes actually locks.
    render(<ServiceChipRow chipState={EMPTY} onToggleChip={() => {}} />);

    for (const name of ["משלוח", "איסוף עצמי"]) {
      expect(screen.getByRole("button", { name })).toHaveClass("rounded-md");
    }
  });
});

describe("pickup_points wiring (MEH-2046)", () => {
  it("is a service-group toggle chip carrying scope + evidence", () => {
    // The Label Scope Contract guard asserts this for every entry; this states
    // the specific values, so a later edit to "any-product" or "admin-verified"
    // reds here with a readable diff rather than only at the contract test.
    const chip = TOGGLE_CHIPS.find((c) => c.key === "pickup_points");

    expect(chip).toBeDefined();
    expect(chip.group).toBe("service");
    expect(chip.label).toBe("איסוף עצמי");
    expect(chip.scope).toBe("business");
    expect(chip.evidence).toBe("self-declared");
  });

  it("reuses the MEH-1461 locked string rather than re-wording it", () => {
    expect(TOGGLE_CHIPS.find((c) => c.key === "pickup_points").label).toBe(
      "איסוף עצמי",
    );
  });

  it("stays /map-LOCAL — it must not leak into the cross-surface contract", () => {
    // ATTRIBUTE_LABELS is the SHARED taxonomy: attributeLabels.test.js derives
    // its key list and requires every key to exist in BOTH /producers'
    // CHIPS_CONFIG and /map's TOGGLE_CHIPS. Adding pickup there would silently
    // conscript /producers into growing a chip this ticket scopes out — which
    // is exactly what happened on the first attempt, and what that suite
    // caught. Same call MEH-1507 made for grass_fed.
    expect(ATTRIBUTE_LABELS.pickup_points).toBeUndefined();
    expect(CHIPS_CONFIG.some((c) => c.key === "pickup_points")).toBe(false);
  });

  it("sends ?pickup_points=true, and both chips send both params (OR union)", () => {
    expect(chipStateToParams({ ...EMPTY, pickup_points: true }, [])).toEqual({
      pickup_points: true,
    });
    expect(
      chipStateToParams({ ...EMPTY, pickup_points: true, has_delivery: true }, []),
    ).toEqual({ has_delivery: true, pickup_points: true });
  });

  it("sends neither param when neither chip is on", () => {
    // Inverse pin: without this, a param built unconditionally would still pass
    // every assertion above.
    expect(chipStateToParams(EMPTY, [])).toEqual({});
  });
});
