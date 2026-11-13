/**
 * MEH-3062: on the phone shell the category chips join the «סינון» / service
 * rail — one chip row over the map instead of two. The desktop panel keeps
 * them on a row of their own. Order: «סינון», categories, service chips
 * (Sapir 13/11, option ב — on the map people look for a kind of food first).
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

  it("phone (singleRow): ONE rail — «סינון» first, then the categories, then the service chips", () => {
    render(<FilterChipsBar {...baseProps} singleRow />);
    const rail = screen.getByTestId("map-service-row");
    expect(rail).toContainElement(meatChip());
    expect(rail.className).not.toContain("mt-1");
    // Order inside the rail, in DOM (= reading) order.
    const order = [
      screen.getByTestId("map-filters-button"),
      meatChip(),
      within(rail).getByTestId("map-service-chip-has_delivery"),
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

describe("FilterChipsBar — a lit service chip is brought into view on the phone (MEH-3062)", () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });
  const props = (chipState, singleRow) => ({
    visibleCategoryChips: [{ key: "all", label: "כל" }],
    chipState,
    visibleToggleChips: [{ key: "has_delivery" }, { key: "pickup_points" }],
    onCategoryChipClick: () => {},
    onToggleChipClick: () => {},
    onSheetToggleChip: () => {},
    clearSheetFilters: () => {},
    resultCount: 0,
    activeFilterTags: [],
    resetAllFilters: () => {},
    cityFilter: "",
    singleRow,
  });

  it("משלוח on, phone: its chip is scrolled into view", () => {
    render(<FilterChipsBar {...props({ categoryKeys: [], has_delivery: true }, true)} />);
    const chip = screen.getByTestId("map-service-chip-has_delivery");
    const calls = Element.prototype.scrollIntoView.mock.contexts;
    expect(calls).toContain(chip);
  });

  it("nothing lit, phone: no service chip is scrolled into view", () => {
    render(<FilterChipsBar {...props({ categoryKeys: [] }, true)} />);
    const chip = screen.getByTestId("map-service-chip-has_delivery");
    expect(Element.prototype.scrollIntoView.mock.contexts).not.toContain(chip);
  });

  it("משלוח on, desktop: unchanged — no scroll (the chips are already in view)", () => {
    render(<FilterChipsBar {...props({ categoryKeys: [], has_delivery: true }, false)} />);
    const chip = screen.getByTestId("map-service-chip-has_delivery");
    expect(Element.prototype.scrollIntoView.mock.contexts).not.toContain(chip);
  });
});
