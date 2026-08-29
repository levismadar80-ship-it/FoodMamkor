// MEH-1098 B1 — CategorySelector food/home group-header behaviour (expanded-only,
// presentational; deterministic stand-in for the un-hydratable register wizard).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import CategorySelector from "@/components/CategorySelector";

const CATS = [
  { id: 1, name: "בשר", slug: "meat" },
  { id: 2, name: "חלב וגבינות", slug: "dairy" },
  { id: 3, name: "ביצים", slug: "eggs" },
  { id: 4, name: "לחמים ואפייה", slug: "bread" },
  { id: 5, name: "שמנים", slug: "oil" },
  { id: 6, name: "ירקות", slug: "veg" },
  { id: 7, name: "פירות", slug: "fruit" },
  { id: 8, name: "מותססים וכבושים", slug: "ferments" },
  { id: 9, name: "מוצרים מוכנים", slug: "prepared" },
  { id: 10, name: "צמחי מרפא ותוספים", slug: "herbs" },
  { id: 11, name: "סבונים טבעיים", slug: "care" },
  { id: 12, name: "קוסמטיקה טבעית", slug: "cosmetics" },
  { id: 13, name: "נרות וארומה", slug: "candles" },
  { id: 14, name: "יין, בירה ומשקאות", slug: "drinks" },
  { id: 15, name: "תבלינים וצמחי תיבול", slug: "spices" },
  { id: 16, name: "שוקולד וממתקים בוטיק", slug: "chocolate" },
  { id: 17, name: "דבש", slug: "honey" },
  { id: 18, name: "דגים", slug: "fish" },
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

// PRECEDES(a, b) === "a comes before b in DOM order".
const PRECEDES = (a, b) =>
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
    expect(PRECEDES(food, home)).toBe(true);
    // a food category (meat) sits before the home header; the renamed
    // "קוסמטיקה טבעית" sits under the home group after it
    expect(PRECEDES(screen.getByText("בשר"), home)).toBe(true);
    expect(PRECEDES(home, screen.getByText("קוסמטיקה טבעית"))).toBe(true);
  });
});

// MEH-2139: the ticket's actual subject. Renaming a category in the DB used to
// make it silently vanish from the popular grid / jump groups, because matching
// compared hardcoded Hebrew names. These rename the rows and assert nothing
// moves — which is only expressible now that the match is on a stable slug.
describe("CategorySelector — a DB rename no longer breaks the grid (MEH-2139)", () => {
  // Same 18 rows, but every display name replaced with something no hardcoded
  // list could ever contain. Slugs untouched — that is the whole point.
  const RENAMED = CATS.map((c) => ({ ...c, name: `שם חדש ${c.id}` }));

  it("CONTROL: the unrenamed fixture groups food before home-care", () => {
    // Anchors the assertion below: if grouping were broken for some unrelated
    // reason, the renamed case would 'pass' by failing the same way.
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <CategorySelector categories={CATS} selectedIds={[]} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText(/עוד קטגוריות/));
    expect(
      PRECEDES(screen.getByText(S.group_food), screen.getByText(S.group_home)),
    ).toBe(true);
  });

  it("a renamed home-care category STAYS in בית וטיפוח", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <CategorySelector categories={RENAMED} selectedIds={[]} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByText(/עוד קטגוריות/));

    const home = screen.getByText(S.group_home);
    // slug "cosmetics" — whatever it is now called.
    const renamedCosmetics = RENAMED.find((c) => c.slug === "cosmetics");
    expect(PRECEDES(home, screen.getByText(renamedCosmetics.name))).toBe(true);
  });

  it("a renamed POPULAR category is still popular — the chip does not vanish", () => {
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <CategorySelector categories={RENAMED} selectedIds={[]} onChange={() => {}} />
      </NextIntlClientProvider>,
    );
    // Collapsed state renders the popular-6 ONLY. Under name matching all six
    // would be missing here and the grid would be empty.
    const meat = RENAMED.find((c) => c.slug === "meat");
    expect(screen.getByText(meat.name)).toBeInTheDocument();
  });
});
