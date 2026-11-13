/**
 * MEH-3062: on the phone shell the category chips join the «סינון» / service
 * rail — one chip row over the map instead of two. The desktop panel keeps
 * them on a row of their own. The rail still LEADS with «סינון» and the
 * service chips, so its start matches home and /producers (MEH-2598).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";

import FilterChipsBar from "@/app/[locale]/map/components/FilterChipsBar";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

describe("FilterChipsBar — one chip row on the phone (MEH-3062)", () => {
  // REUSES: __tests__/FilterChipsBarOriginTag.test.jsx:16-19 — jsdom lacks the
  // scroll methods ChipScrollRow calls on mount.
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  const CATS = [
    { key: "all", label: "כל" },
    { key: "meat", label: "בשר ודגים" },
  ];
  const TOGGLES = [{ key: "has_delivery" }, { key: "pickup_points" }];
  const baseProps = {
    visibleCategoryChips: CATS,
    chipState: { categoryKeys: [] },
    visibleToggleChips: TOGGLES,
    onCategoryChipClick: () => {},
    onToggleChipClick: () => {},
    onSheetToggleChip: () => {},
    clearSheetFilters: () => {},
    resultCount: 0,
    activeFilterTags: [],
    resetAllFilters: () => {},
    cityFilter: "",
  };
  const meatChip = () => screen.getByRole("button", { name: /בשר ודגים/ });

  it("desktop (default): the category chips sit OUTSIDE the service rail", () => {
    render(<FilterChipsBar {...baseProps} />);
    const rail = screen.getByTestId("map-service-row");
    expect(rail).not.toContainElement(meatChip());
    expect(rail.className).toContain("mt-1");
  });

  it("phone (singleRow): ONE rail — «סינון» first, service chips, then the categories", () => {
    render(<FilterChipsBar {...baseProps} singleRow />);
    const rail = screen.getByTestId("map-service-row");
    expect(rail).toContainElement(meatChip());
    expect(rail.className).not.toContain("mt-1");
    // Order inside the rail, in DOM (= reading) order.
    const order = [
      screen.getByTestId("map-filters-button"),
      within(rail).getByTestId("map-service-chip-has_delivery"),
      meatChip(),
    ];
    for (let i = 1; i < order.length; i += 1) {
      // DOCUMENT_POSITION_FOLLOWING = 4: order[i] comes after order[i - 1].
      expect(order[i - 1].compareDocumentPosition(order[i]) & 4, `item ${i} after item ${i - 1}`).toBe(4);
    }
    // Exactly one copy of each category chip — not both placements at once.
    expect(screen.getAllByRole("button", { name: /בשר ודגים/ })).toHaveLength(1);
  });

  it("phone (singleRow): a category chip still calls its handler", () => {
    const onCategoryChipClick = vi.fn();
    render(<FilterChipsBar {...baseProps} singleRow onCategoryChipClick={onCategoryChipClick} />);
    fireEvent.click(meatChip());
    expect(onCategoryChipClick).toHaveBeenCalledTimes(1);
  });
});
