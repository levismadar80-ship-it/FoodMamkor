import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CategorySelector from "@/components/CategorySelector";

// MEH-2929 (pilot B5): «טבעוני» is a per-product flag, not a category. A search
// for it (or its siblings) must say where it is marked, not just «not found».

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = (props) => <span {...props} />;
  return { Check: Stub, Leaf: Stub, MagnifyingGlass: Stub, CaretDown: Stub, CaretUp: Stub };
});
vi.mock("@/lib/category-registry", () => {
  const G = (props) => <span {...props} />;
  return {
    CATEGORY_ICONS: {},
    CATEGORY_GLYPH_FALLBACK: G,
    categoryGlyphKey: (c) => (typeof c === "string" ? c : (c?.name ?? "")),
    resolveCategoryGlyph: () => ({ glyph: G, isFallback: true }),
  };
});

const CATS = [
  { id: 1, slug: "vegetables", name: "ירקות" },
  { id: 2, slug: "bakery", name: "לחמים ואפייה" },
];

function search(text) {
  render(<CategorySelector categories={CATS} selectedIds={[]} onChange={() => {}} onRequestCategory={() => {}} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: text } });
}

describe("CategorySelector dietary hint (MEH-2929)", () => {
  it.each(["טבעוני", "צמחונית", "ללא גלוטן", "Vegan"])("«%s» shows where dietary flags are marked", (text) => {
    search(text);
    expect(screen.getByTestId("category-dietary-hint").textContent).toBe("forms.category_selector.dietary_hint");
  });

  it("a non-dietary miss keeps the plain no-results line only", () => {
    search("קפה");
    expect(screen.queryByTestId("category-dietary-hint")).toBeNull();
    expect(screen.getByText(/forms\.category_selector\.no_results_prefix/)).toBeTruthy();
  });

  it("an empty query shows no hint", () => {
    render(<CategorySelector categories={CATS} selectedIds={[]} onChange={() => {}} onRequestCategory={() => {}} />);
    expect(screen.queryByTestId("category-dietary-hint")).toBeNull();
  });
});
