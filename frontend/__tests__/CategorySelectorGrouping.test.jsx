/**
 * MEH-1098 (B1) — CategorySelector food / home-care group headers.
 *
 * Renders the selector under the REAL NextIntlClientProvider + he.json
 * (mirrors the EditTabCategoriesCard harness). Asserts the expanded grid
 * gains presentational "מזון" / "בית וטיפוח" subheaders, that food
 * categories render before the home-and-care ones, and that the collapsed
 * popular view has NO headers — grouping is presentational and expanded-only.
 * The register wizard can't be driven headless in the CC sandbox (Suspense
 * preflight doesn't hydrate), so this is the deterministic B1 check.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CategorySelector from "@/components/CategorySelector";

const CATS = [
  { id: 1, name: "בשר" },
  { id: 2, name: "חלב וגבינות" },
  { id: 3, name: "ביצים" },
  { id: 4, name: "לחמים ואפייה" },
  { id: 5, name: "שמנים" },
  { id: 6, name: "ירקות" },
  { id: 7, name: "פירות" },
  { id: 8, name: "מותססים וכבושים" },
  { id: 9, name: "מוצרים מוכנים" },
  { id: 10, name: "צמחי מרפא ותוספים" },
  { id: 11, name: "סבונים טבעיים" },
  { id: 12, name: "קוסמטיקה טבעית" },
  { id: 13, name: "נרות וארומה" },
  { id: 14, name: "יין, בירה ומשקאות" },
  { id: 15, name: "תבלינים וצמחי תיבול" },
  { id: 16, name: "שוקולד וממתקים בוטיק" },
  { id: 17, name: "דבש" },
  { id: 18, name: "דגים" },
];
const S = he.forms.category_selector;

function renderSelector() {
  const onChange = vi.fn();
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <CategorySelector
        categories={CATS}
        selectedIds={[]}
        onChange={onChange}
        onRequestCategory={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return { onChange, ...utils };
}

const FOLLOWS = (a, b) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("CategorySelector food/home grouping (MEH-1098 B1)", () => {
  it("collapsed popular view has no group headers", () => {
    renderSelector();
    expect(screen.queryByText(S.group_food)).not.toBeInTheDocument();
    expect(screen.queryByText(S.group_home)).not.toBeInTheDocument();
  });

  it("expanded view shows מזון/בית-וטיפוח headers with food before home-care", () => {
    renderSelector();
    fireEvent.click(screen.getByText(/עוד קטגוריות/)); // expand to all 18

    const food = screen.getByText(S.group_food); // "מזון"
    const home = screen.getByText(S.group_home); // "בית וטיפוח"
    expect(food).toBeInTheDocument();
    expect(home).toBeInTheDocument();
    // presentational — do not alter selection semantics
    expect(food).toHaveAttribute("role", "presentation");
    expect(home).toHaveAttribute("role", "presentation");

    // food header precedes the home header
    expect(FOLLOWS(food, home)).toBe(true);
    // a food category (meat) sits before the home header; the renamed
    // "קוסמטיקה טבעית" sits under the home group after it
    expect(FOLLOWS(screen.getByText("בשר"), home)).toBe(true);
    expect(FOLLOWS(home, screen.getByText("קוסמטיקה טבעית"))).toBe(true);
  });
});
