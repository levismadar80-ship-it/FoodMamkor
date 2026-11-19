/**
 * MEH-1297 — CategorySelector cap + primary-first behavior.
 * MEH-2925: the cap is 5 (was 3).
 *
 * Pins the three new behaviors on the register-flow picker:
 *   1. A 4th pick is blocked once 3 are selected (non-selected cards disabled,
 *      onChange not fired) — while already-selected cards stay togglable.
 *   2. The first-selected category (selectedIds[0]) carries the "ראשית" badge.
 *   3. The live N/3 counter reflects the selection count.
 *
 * Uses the real NextIntlClientProvider + he.json so the "{count}/{max}" counter
 * interpolates (the lightweight fall-through mock in CategorySelector.test.jsx
 * ignores params, so it can't assert the rendered count).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CategorySelector from "@/components/CategorySelector";

// First 6 names match POPULAR (CategorySelector.jsx) so they render in the
// rest state without needing search/expand.
const CATEGORIES = [
  { id: 1, name: "חלב וגבינות", slug: "dairy" },
  { id: 2, name: "לחמים ואפייה", slug: "bread" },
  { id: 3, name: "בשר", slug: "meat" },
  { id: 4, name: "שמנים", slug: "oil" },
  { id: 5, name: "ירקות", slug: "veg" },
  { id: 6, name: "סבונים טבעיים", slug: "care" },
];

function setup(selectedIds = []) {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CategorySelector
        categories={CATEGORIES}
        selectedIds={selectedIds}
        onChange={onChange}
        onRequestCategory={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  const cardFor = (name) => screen.getByText(name).closest("button");
  return { onChange, cardFor };
}

describe("CategorySelector cap-5 (MEH-1297, MEH-2925)", () => {
  it("blocks a 6th pick once 5 are selected: non-selected card disabled + no onChange", () => {
    const { onChange, cardFor } = setup([1, 2, 3, 4, 5]);
    const sixth = cardFor("סבונים טבעיים"); // id 6, not selected
    expect(sixth).toBeDisabled();
    fireEvent.click(sixth);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("lets a 4th and a 5th be picked (MEH-2925)", () => {
    const three = setup([1, 2, 3]);
    expect(three.cardFor("שמנים")).not.toBeDisabled();
    fireEvent.click(three.cardFor("שמנים"));
    expect(three.onChange).toHaveBeenCalledWith(4);
  });

  it("keeps already-selected cards togglable at cap (deselect path)", () => {
    const { onChange, cardFor } = setup([1, 2, 3, 4, 5]);
    const selected = cardFor("בשר"); // id 3, selected
    expect(selected).not.toBeDisabled();
    fireEvent.click(selected);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("below the cap, all cards stay enabled", () => {
    const { cardFor } = setup([1, 2]);
    expect(cardFor("שמנים")).not.toBeDisabled();
  });

  it("shows the 'ראשית' badge on the first-selected category only", () => {
    // selection order: בשר(3) first → primary, then חלב(1)
    const { cardFor } = setup([3, 1]);
    const primaryCard = cardFor("בשר");
    const otherCard = cardFor("חלב וגבינות");
    expect(within(primaryCard).getByTestId("primary-badge")).toHaveTextContent(
      "ראשית",
    );
    expect(within(otherCard).queryByTestId("primary-badge")).toBeNull();
  });

  it("renders a live N/5 counter", () => {
    setup([1, 2, 3]);
    expect(screen.getByTestId("category-counter")).toHaveTextContent("3/5");
  });

  it("counter starts at 0/5 with no selection", () => {
    setup([]);
    expect(screen.getByTestId("category-counter")).toHaveTextContent("0/5");
  });
});
