/**
 * MEH-1297 — CategorySelector cap-3 + primary-first behavior.
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
  { id: 1, name: "חלב וגבינות" },
  { id: 2, name: "לחמים ואפייה" },
  { id: 3, name: "בשר" },
  { id: 4, name: "שמנים" },
  { id: 5, name: "ירקות" },
  { id: 6, name: "סבונים טבעיים" },
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

describe("CategorySelector cap-3 (MEH-1297)", () => {
  it("blocks a 4th pick once 3 are selected: non-selected card disabled + no onChange", () => {
    const { onChange, cardFor } = setup([1, 2, 3]);
    const fourth = cardFor("שמנים"); // id 4, not selected
    expect(fourth).toBeDisabled();
    fireEvent.click(fourth);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps already-selected cards togglable at cap (deselect path)", () => {
    const { onChange, cardFor } = setup([1, 2, 3]);
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

  it("renders a live N/3 counter", () => {
    setup([1, 2, 3]);
    expect(screen.getByTestId("category-counter")).toHaveTextContent("3/3");
  });

  it("counter starts at 0/3 with no selection", () => {
    setup([]);
    expect(screen.getByTestId("category-counter")).toHaveTextContent("0/3");
  });
});
