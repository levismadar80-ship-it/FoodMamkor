/**
 * MEH-2046 — the /map promoted service row.
 *
 * Two claims, asserted through BEHAVIOUR rather than by checking that a
 * particular constant was edited (ADR-032 §3.6):
 *
 *   1. Both service chips are always present and are togglable independently —
 *      the OR pairing the ticket promotes.
 *   2. The משלוח chip no longer blocks on a city (Option C), driven through the
 *      real useMapFilters hook in the last block. The old handler returned
 *      early, so a city-less click produced NO state change and NO fetch.
 *
 * NOT covered here: the "בתיאום אישי" explanation line. It renders in
 * FilterChipsBar, not this component, and naming it in this docblock would be
 * the same overclaim the DISCRIMINATION note below records.
 *
 * DISCRIMINATION — stated for what this file actually exercises, which is
 * narrower than an earlier version of this docblock claimed. The cases below
 * fail against pre-2046 code for ONE reason: `pickup_points` is absent from
 * TOGGLE_CHIPS, so the chip does not render and the config assertions have
 * nothing to find.
 *
 * They do NOT discriminate the Option C fetch behaviour: `onToggleChip` is a
 * `vi.fn()` here, so this file cannot observe whether a fetch fired or whether
 * the old guard returned early. That claim was made and was wrong — the CI
 * reviewer caught it on PR #2880. The behaviour is now guarded for real by the
 * `useMapFilters` block at the bottom of this file, which drives the actual
 * hook. Nor does this file cover the "בתיאום אישי" note: that element lives in
 * FilterChipsBar, not here.
 *
 * The two `does not` / `must not` cases are inverse pins — they fail if the row
 * renders unconditionally or if pickup leaks into the cross-surface taxonomy.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";

import ServiceChipRow from "@/app/[locale]/map/components/ServiceChipRow";
import { TOGGLE_CHIPS, chipStateToParams } from "@/lib/map-chips";
import { ATTRIBUTE_LABELS } from "@/lib/attribute-labels";
import { CHIPS_CONFIG } from "@/lib/producer-filters";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";

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

describe("Option C — the משלוח chip must not block on a city (MEH-2046)", () => {
  // This is the block the CI reviewer asked for on PR #2880, and it is the only
  // DURABLE guard for Option C. The behaviour was otherwise covered solely by
  // qa-meh2046-shot.mjs, which is a disposable one-off probe — it is not run by
  // CI and cannot stop a regression.
  //
  // It drives the real hook rather than a mock, so it discriminates against the
  // exact pre-2046 shape: that handler returned EARLY when `userCity` was
  // falsy, leaving chipState untouched and firing no fetch. Both assertions
  // below fail against it.
  const setup = (overrides = {}) => {
    const loadProducers = vi.fn();
    const setShowCityPicker = vi.fn();
    const { result } = renderHook(() =>
      useMapFilters({
        allProducers: [],
        categories: [],
        loadProducers,
        userCity: null,
        setUserCity: vi.fn(),
        setShowCityPicker,
        ...overrides,
      }),
    );
    return { result, loadProducers, setShowCityPicker };
  };

  it("turns the chip ON and fetches even with no city set", () => {
    const { result, loadProducers, setShowCityPicker } = setup();

    act(() => result.current.onToggleChipClick("has_delivery"));

    // The two things the old early-return prevented outright.
    expect(result.current.chipState.has_delivery).toBe(true);
    expect(loadProducers).toHaveBeenCalledWith(
      expect.objectContaining({ has_delivery: true }),
    );
    // ...and the modal is still offered, as a refinement rather than a gate.
    expect(setShowCityPicker).toHaveBeenCalledWith(true);
  });

  it("does not re-offer the city modal when a city is already known", () => {
    // Inverse pin: without it, a handler that opened the modal unconditionally
    // would pass the case above.
    const { result, setShowCityPicker } = setup({ userCity: "חיפה" });

    act(() => result.current.onToggleChipClick("has_delivery"));

    expect(result.current.chipState.has_delivery).toBe(true);
    expect(setShowCityPicker).not.toHaveBeenCalled();
  });

  it("never offers the city modal for the pickup chip", () => {
    // The refinement is delivery-specific; pickup has no city axis of its own
    // on this surface.
    const { result, loadProducers, setShowCityPicker } = setup();

    act(() => result.current.onToggleChipClick("pickup_points"));

    expect(result.current.chipState.pickup_points).toBe(true);
    expect(loadProducers).toHaveBeenCalledWith(
      expect.objectContaining({ pickup_points: true }),
    );
    expect(setShowCityPicker).not.toHaveBeenCalled();
  });

  it("turning the chip OFF does not re-open the modal", () => {
    // Guard on the `next.has_delivery` condition: keying the modal off the
    // event rather than the RESULTING state would pop it on every click.
    const { result, setShowCityPicker } = setup();

    act(() => result.current.onToggleChipClick("has_delivery"));
    setShowCityPicker.mockClear();
    act(() => result.current.onToggleChipClick("has_delivery"));

    expect(result.current.chipState.has_delivery).toBe(false);
    expect(setShowCityPicker).not.toHaveBeenCalled();
  });
});
