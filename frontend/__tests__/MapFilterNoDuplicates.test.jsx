/**
 * MEH-2425 — /map shows each active filter in ONE place, and an empty result
 * caused by filters says so.
 *
 * Sapir's iPhone screenshot (27/10): משלוח + איסוף עצמי were lit on their own
 * chips AND repeated as "× משלוח" "× איסוף עצמי" tags under them, with a
 * "בתיאום אישי" line between the two that nobody could parse; 5 filters → 0
 * results read "אין בתי עסק מקומיים באזור", as if the area were empty.
 *
 * Behaviour, not constants (ADR-032 §3.6): the hook's tag list, the rendered
 * bar, and the sheet's zero line are each driven and read back.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, renderHook, fireEvent, act } from "@testing-library/react";

import FilterChipsBar from "@/app/[locale]/map/components/FilterChipsBar";
import MapBottomSheet from "@/components/MapBottomSheet";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";
import { CATEGORY_CHIPS, SERVICE_CHIP_KEYS, TOGGLE_CHIPS } from "@/lib/map-chips";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

// jsdom has no scrollTo; ChipScrollRow calls it on mount.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const hook = () =>
  renderHook(() =>
    useMapFilters({
      allProducers: [],
      categories: [],
      loadProducers: vi.fn(),
      userCity: null,
      setUserCity: vi.fn(),
      setShowCityPicker: vi.fn(),
    }),
  ).result;

const ALL_ON = Object.fromEntries(TOGGLE_CHIPS.map((c) => [c.key, true]));

// MEH-2598: useMapFilters now mirrors its chips into the URL and reads them
// back on mount, so a test that switches every chip on would otherwise hand
// its URL to the next renderHook in this file.
beforeEach(() => window.history.replaceState(null, "", "/"));

describe("active-filter tags never repeat a chip that is already on screen", () => {
  it("the service keys are real toggle chips (control: the filter below has something to drop)", () => {
    expect(SERVICE_CHIP_KEYS.length).toBeGreaterThan(0);
    for (const key of SERVICE_CHIP_KEYS) {
      expect(TOGGLE_CHIPS.map((c) => c.key)).toContain(key);
    }
  });

  it("useMapFilters: every toggle on → tags hold every key EXCEPT the service chips", () => {
    const result = hook();
    act(() => result.current.setChipState({ categoryKeys: [], ...ALL_ON }));
    const tagKeys = result.current.activeFilterTags.map((t) => t.key);
    for (const key of SERVICE_CHIP_KEYS) expect(tagKeys).not.toContain(key);
    expect(tagKeys.length).toBe(TOGGLE_CHIPS.length - SERVICE_CHIP_KEYS.length);
    // the "סינון · N" count still counts everything the sheet shows as on
    expect(result.current.activeAttributeCount).toBe(TOGGLE_CHIPS.length);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("useMapFilters: nothing on → hasActiveFilters false; a category alone → true", () => {
    const result = hook();
    expect(result.current.hasActiveFilters).toBe(false);
    act(() => result.current.setChipState((s) => ({ ...s, categoryKeys: [CATEGORY_CHIPS.find((c) => c.key !== "all").key] })));
    expect(result.current.hasActiveFilters).toBe(true);
  });

  it("useMapFilters: a city alone counts — a city-only empty list still offers the reset", () => {
    const result = hook();
    act(() => result.current.setCityFilter("   "));
    expect(result.current.hasActiveFilters).toBe(false);
    act(() => result.current.setCityFilter("חדרה"));
    expect(result.current.hasActiveFilters).toBe(true);
  });
});

describe("FilterChipsBar — service filter on", () => {
  const props = {
    visibleCategoryChips: [],
    chipState: { categoryKeys: [], has_delivery: true, pickup_points: true },
    onCategoryChipClick: vi.fn(),
    onToggleChipClick: vi.fn(),
    onSheetToggleChip: vi.fn(),
    clearSheetFilters: vi.fn(),
    resultCount: 0,
    activeFilterTags: [],
    resetAllFilters: vi.fn(),
    cityFilter: null,
  };

  it("no 'בתיאום אישי' line", () => {
    render(<FilterChipsBar {...props} />);
    expect(screen.queryByTestId("service-filter-note")).toBeNull();
  });

  // MEH-2500: both service chips lit used to read «סינון · 2» — two filters
  // that looked hidden in the sheet but were the two chips beside the button.
  it("both service chips on, nothing else → «סינון» carries no count", () => {
    render(<FilterChipsBar {...props} />);
    expect(screen.getByTestId("map-filters-button").textContent).not.toMatch(/\d/);
  });

  it("a sheet-only filter on → the count is that filter alone, services not added", () => {
    render(
      <FilterChipsBar
        {...props}
        chipState={{ ...props.chipState, vegan: true }}
        activeFilterTags={[{ kind: "toggle", key: "vegan", label: "טבעוני" }]}
      />,
    );
    expect(screen.getByTestId("map-filters-button").textContent).toMatch(/· 1$/);
  });
});

describe("MapBottomSheet — zero results", () => {
  const noop = () => {};

  it("zero + filters on → says the filters did it and offers to clear them", () => {
    const onReset = vi.fn();
    render(
      <MapBottomSheet snap={14} onSnapChange={noop} count={0} filtered onResetFilters={onReset}>
        <div />
      </MapBottomSheet>,
    );
    expect(screen.getByText("count_filtered_zero")).toBeInTheDocument();
    expect(screen.queryByText(/^count:/)).toBeNull();
    fireEvent.click(screen.getByTestId("sheet-reset-filters"));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it("zero + no filters → the plain count line, no reset button", () => {
    render(
      <MapBottomSheet snap={14} onSnapChange={noop} count={0}>
        <div />
      </MapBottomSheet>,
    );
    expect(screen.getByText('count:{"count":0}')).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-reset-filters")).toBeNull();
  });

  it("results + filters on → the plain count line, no reset button", () => {
    render(
      <MapBottomSheet snap={14} onSnapChange={noop} count={3} filtered onResetFilters={noop}>
        <div />
      </MapBottomSheet>,
    );
    expect(screen.getByText('count:{"count":3}')).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-reset-filters")).toBeNull();
  });
});
