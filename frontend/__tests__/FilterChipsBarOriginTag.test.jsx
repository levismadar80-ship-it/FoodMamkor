/**
 * MEH-2506: the mobile distance-origin tag shares the active-filter strip
 * (one row under the chips) instead of opening its own row. It is not a
 * filter, so «נקו הכל» stays tied to the filter tags alone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

import FilterChipsBar from "@/app/[locale]/map/components/FilterChipsBar";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

describe("FilterChipsBar — origin tag in the active-filter strip (MEH-2506)", () => {
  // REUSES: __tests__/DeliveryContextBanner.test.jsx:81-84 — jsdom lacks the
  // scroll methods ChipScrollRow calls on mount.
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const baseProps = {
    visibleCategoryChips: [],
    chipState: { categoryKeys: [] },
    onCategoryChipClick: () => {},
    onToggleChipClick: () => {},
    onSheetToggleChip: () => {},
    clearSheetFilters: () => {},
    resultCount: 0,
    activeFilterTags: [],
    resetAllFilters: () => {},
    cityFilter: "",
  };
  const KOSHER = [{ kind: "toggle", key: "kosher", label: "כשר" }];
  const origin = <span data-testid="sort-origin">מרחק מ: חיפה</span>;

  it("no origin, no filter tags: no strip", () => {
    render(<FilterChipsBar {...baseProps} />);
    expect(screen.queryByTestId("map-active-filter-tags")).toBeNull();
  });

  it("origin only: its row shows it, with no filter strip and no «clear all»", () => {
    render(<FilterChipsBar {...baseProps} originTag={origin} />);
    const row = screen.getByTestId("map-origin-row");
    expect(within(row).getByTestId("sort-origin")).toBeInTheDocument();
    expect(screen.queryByTestId("map-active-filter-tags")).toBeNull();
    expect(screen.queryByTestId("map-clear-all")).toBeNull();
  });

  it("origin + a filter tag: one row — origin first, then the strip (tag + «clear all»)", () => {
    render(<FilterChipsBar {...baseProps} activeFilterTags={KOSHER} originTag={origin} />);
    const row = screen.getByTestId("map-origin-row");
    const strip = within(row).getByTestId("map-active-filter-tags");
    expect(row.firstElementChild).toContainElement(screen.getByTestId("sort-origin"));
    expect(row.lastElementChild).toBe(strip);
    // The origin is not a filter: it stays out of the strip's live region.
    expect(strip).not.toContainElement(screen.getByTestId("sort-origin"));
    const kids = [...strip.children].map((el) => el.getAttribute("data-testid"));
    expect(kids).toEqual(["map-active-filter-tag", "map-clear-all"]);
  });

  it("filter tags without an origin: unchanged (no origin row; tag + «clear all», mt-2)", () => {
    render(<FilterChipsBar {...baseProps} activeFilterTags={KOSHER} />);
    expect(screen.queryByTestId("map-origin-row")).toBeNull();
    const strip = screen.getByTestId("map-active-filter-tags");
    expect(strip.className).toContain("mt-2");
    const kids = [...strip.children].map((el) => el.getAttribute("data-testid"));
    expect(kids).toEqual(["map-active-filter-tag", "map-clear-all"]);
  });
});
