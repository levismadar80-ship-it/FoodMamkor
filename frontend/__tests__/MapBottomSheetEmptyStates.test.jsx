import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * MEH-2639 — the three things the sheet's peek row can say, and the one
 * notice that sits above the list.
 *
 * The peek row is the ONLY line a phone shows before the visitor drags the
 * sheet up, so which branch wins is the whole user-visible decision. Each
 * cell below pins one branch AND the absence of the others, because the bug
 * being fixed was a true-but-wrong row ("אין תוצאות לסינון הזה" for a town
 * with no businesses) rather than a missing one.
 */

// Keys through, with params appended, so an interpolation that silently
// drops its value is visible instead of looking like a plain key.
vi.mock("next-intl", () => ({
  useTranslations: () => (k, vals) => (vals ? `${k}|${JSON.stringify(vals)}` : k),
}));
vi.mock("@/components/SheetListSkeleton", () => ({
  default: () => <div data-testid="sheet-skeleton" />,
}));

import MapBottomSheet from "@/components/MapBottomSheet";

const base = { snap: 50, onSnapChange: () => {}, count: 0, children: <div data-testid="rows" /> };

afterEach(cleanup);

describe("MapBottomSheet peek row (MEH-2639)", () => {
  it("city with nothing in it → names the town, and offers NO way to clear", () => {
    render(<MapBottomSheet {...base} count={6} zeroCity="בנימינה" filtered onResetFilters={vi.fn()} />);
    expect(screen.getByTestId("sheet-city-zero")).toHaveTextContent("בנימינה");
    // The discriminating half. `filtered` and `onResetFilters` are BOTH set
    // here, so without the new branch the MEH-2425 filtered-zero row and its
    // reset button would render — which is the bug.
    expect(screen.queryByTestId("sheet-filtered-zero")).toBeNull();
    expect(screen.queryByTestId("sheet-reset-filters")).toBeNull();
    expect(screen.queryByTestId("sheet-count")).toBeNull();
  });

  it("zero because of chips → still the filtered row with its way out", () => {
    const onReset = vi.fn();
    render(<MapBottomSheet {...base} count={0} filtered onResetFilters={onReset} />);
    expect(screen.getByTestId("sheet-filtered-zero")).toBeInTheDocument();
    expect(screen.getByTestId("sheet-reset-filters")).toBeInTheDocument();
    expect(screen.queryByTestId("sheet-city-zero")).toBeNull();
  });

  it("count line claims an area ONLY when an origin is set", () => {
    render(<MapBottomSheet {...base} count={7} hasOrigin />);
    expect(screen.getByTestId("sheet-count")).toHaveTextContent("count_area");
    cleanup();
    render(<MapBottomSheet {...base} count={7} />);
    const plain = screen.getByTestId("sheet-count");
    expect(plain).toHaveTextContent("count|");
    // Not merely "contains count" — `count_area` contains it too.
    expect(plain.textContent).not.toContain("count_area");
  });

  it("near-me-empty renders a persistent notice above the rows", () => {
    render(<MapBottomSheet {...base} count={9} nearMeEmpty />);
    const notice = screen.getByTestId("sheet-near-me-empty");
    expect(notice).toHaveTextContent("near_me_empty");
    // It explains the list, so it must sit before it in the DOM.
    expect(notice.compareDocumentPosition(screen.getByTestId("rows")))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("no near-me notice when the flag is off, and none while loading", () => {
    render(<MapBottomSheet {...base} count={9} />);
    expect(screen.queryByTestId("sheet-near-me-empty")).toBeNull();
    cleanup();
    render(<MapBottomSheet {...base} count={9} nearMeEmpty loading />);
    expect(screen.queryByTestId("sheet-near-me-empty")).toBeNull();
  });
});
