import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react";

/**
 * MEH-2837 PR 1 — small fixes from the 08/11 Chrome scan. The filter-sheet
 * scroll lock is behavioural; the rest are class changes, read from source
 * (each component's own suite covers its rendering).
 */

vi.mock("@/lib/use-chip-copy", async () => (await import("./helpers/he-chip-copy")).chipCopyMock);
vi.mock("@/lib/use-badge-copy", async () => (await import("./helpers/he-badge-copy")).badgeCopyMock);
vi.mock("next-intl", () => ({
  useTranslations: () => (key, values) => (values && values.count !== undefined ? `${key}#${values.count}` : key),
}));

import FilterSheet from "@/components/FilterSheet";

const src = (rel) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
const CHIPS = { categoryKeys: [], has_delivery: false, pickup_points: false, verified: false, open_for_orders_now: false, kosher: false, grass_fed: false, vegan: false, vegetarian: false, gluten_free: false, lactose_free: false, no_added_sugar: false };
const mobile = (desktop) => {
  window.matchMedia = vi.fn().mockImplementation((q) => ({ matches: desktop, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
};
const sheet = (open) => <FilterSheet open={open} onClose={() => {}} chipState={CHIPS} onToggleChip={() => {}} resultCount={3} onClearAll={() => {}} />;

describe("FilterSheet — scrolling the sheet does not move the page", () => {
  it("mobile: <html> is locked while open and restored on close; the panel has overscroll-contain", () => {
    mobile(false);
    document.documentElement.style.overflow = "";
    const { rerender } = render(sheet(true));
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.querySelector(".overscroll-contain")).not.toBeNull();
    rerender(sheet(false));
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("desktop (lg+): the anchored panel leaves the page alone", () => {
    mobile(true);
    document.documentElement.style.overflow = "";
    render(sheet(true));
    expect(document.documentElement.style.overflow).toBe("");
  });
});

describe("class fixes (source)", () => {
  const card = src("components/ProducerCard.jsx");
  it("the no-photo name plate's top padding clears the heart (34px at 8px → 42; 44px at 12px → 56)", () => {
    expect(card).toMatch(/bg-background-alt p-4 pt-12 pb-12 sm:p-5 sm:pt-16 sm:pb-14/);
  });
  it("the heart has a border + small shadow; size and position unchanged", () => {
    expect(card).toMatch(/absolute top-2 end-2 sm:top-3 sm:end-3 z-10 w-\[34px\] h-\[34px\] sm:w-11 sm:h-11 bg-background\/90 hover:bg-background border border-border shadow-sm rounded-full/);
  });
  it("below sm the rating stacks under the name; sm+ side by side; the name keeps line-clamp-2", () => {
    expect(card).toMatch(/grid grid-cols-1 gap-y-0\.5 sm:grid-cols-\[1fr_auto\] sm:gap-3 items-baseline/);
    expect(card).toMatch(/justify-self-start sm:justify-self-auto/);
    expect(card).toMatch(/leading-snug line-clamp-2/);
  });
  it("event detail: the date and the time range each stay whole", () => {
    const ev = src("app/[locale]/events/[id]/EventDetailClient.jsx");
    expect(ev).toMatch(/<span className="whitespace-nowrap">\{formatEventDate\(event\.event_date, locale, DETAIL_DATE_OPTIONS\)\}<\/span>/);
    expect(ev).toMatch(/<span dir="ltr" className="whitespace-nowrap">\{formatTimeRange/);
  });
  it("/join shelf hides its scrollbar", () => {
    expect(src("components/join/JoinFeatures.jsx")).toMatch(/data-testid="join-shelf"\s+className="[^"]*overflow-x-auto scrollbar-hide/);
  });
});
