import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMapFilters } from "@/app/[locale]/map/state/useMapFilters";

// MEH-3076: the /map legend toggles GROUPS. Before, its rows were 8 category
// names, 2 of them stale, so a vegetable business matched no row: switching
// any row off hid it, and no row could show it alone.

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));

const VEG = { id: "c-veg", name: "ירקות", slug: "veg" };
const FRUIT = { id: "c-fruit", name: "פירות", slug: "fruit" };
const MEAT = { id: "c-meat", name: "בשר", slug: "meat" };
const biz = (id, category) => ({ id, categories: [category], locations: [] });
const ALL = [biz("veg", VEG), biz("fruit", FRUIT), biz("meat", MEAT), biz("none", { id: "x", name: "אחר" })];

function setup() {
  const { result } = renderHook(() =>
    useMapFilters({
      allProducers: ALL,
      categories: [VEG, FRUIT, MEAT],
      loadProducers: vi.fn(),
      userCity: null,
      setUserCity: vi.fn(),
      setShowCityPicker: vi.fn(),
    }),
  );
  return result;
}

const ids = (result) => result.current.visibleProducers.map((p) => p.id);

describe("useMapFilters — legend rows are groups (MEH-3076)", () => {
  it("counts businesses per group", () => {
    const result = setup();
    expect(result.current.viewportCategoryCounts).toEqual({ produce: 2, meat: 1 });
  });

  it("switching meat off keeps vegetables AND fruit", () => {
    const result = setup();
    act(() => result.current.toggleCategory("meat"));
    expect(ids(result)).toEqual(["veg", "fruit"]);
    expect(result.current.isCategoryActive("produce")).toBe(true);
    expect(result.current.isCategoryActive("meat")).toBe(false);
  });

  it("produce alone shows both of its categories and nothing else", () => {
    const result = setup();
    for (const g of ["meat", "dairy", "bread", "pantry", "care"]) {
      act(() => result.current.toggleCategory(g));
    }
    expect(ids(result)).toEqual(["veg", "fruit"]);
  });

  it("with every row on, nothing is filtered (an unknown category too)", () => {
    const result = setup();
    expect(ids(result)).toEqual(["veg", "fruit", "meat", "none"]);
  });
});
