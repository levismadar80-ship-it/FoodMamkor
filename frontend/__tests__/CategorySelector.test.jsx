import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import CategorySelector from "@/components/CategorySelector";

// MEH-830: characterization tests for the S7 CategorySelector (MEH-203 rebuild).
// It is part of the /register/producer critical flow (testing.md rule 5) and
// shipped without coverage. These tests pin CURRENT behavior: popular-6 rest
// state, select → onChange(id), dim-not-hide search filter, no-match CTA, and
// the show-more expansion. Data contract = props categories / selectedIds /
// onChange(id) / onRequestCategory (CategorySelector.jsx:42).

// next-intl: return the key path (fall-through) — assertions key off category
// NAMES (data), not i18n strings. t(key, params) ignores params.
vi.mock("next-intl", () => ({
  useTranslations: (scope) => {
    const t = (key) => (scope ? `${scope}.${key}` : key);
    return t;
  },
}));

vi.mock("@phosphor-icons/react", () => {
  const Stub = (props) => <span data-testid="icon" {...props} />;
  return { Check: Stub, Leaf: Stub, MagnifyingGlass: Stub };
});

// CATEGORY_ICONS keys the 6 popular glyphs to hand-drawn components.
vi.mock("@/components/CategoryIcons", () => {
  const Glyph = (props) => <span data-testid="glyph" {...props} />;
  return {
    CATEGORY_ICONS: { dairy: Glyph, bread: Glyph, meat: Glyph, oil: Glyph, veg: Glyph, care: Glyph },
  };
});

// Mirrors GET /categories → [{ id, name }]. First 6 names match POPULAR
// (CategorySelector.jsx:31-38); 7-8 are "rest" (Leaf fallback, search-only).
const CATEGORIES = [
  { id: 1, name: "חלב וגבינות" },
  { id: 2, name: "לחמים ואפייה" },
  { id: 3, name: "בשר" },
  { id: 4, name: "שמנים" },
  { id: 5, name: "ירקות" },
  { id: 6, name: "סבונים טבעיים" },
  { id: 7, name: "דבש" },
  { id: 8, name: "תבלינים" },
];

function setup(overrides = {}) {
  const onChange = vi.fn();
  const onRequestCategory = vi.fn();
  const utils = render(
    <CategorySelector
      categories={CATEGORIES}
      selectedIds={overrides.selectedIds ?? []}
      onChange={onChange}
      onRequestCategory={onRequestCategory}
    />,
  );
  const searchbox = () => screen.getByRole("searchbox");
  const cardFor = (name) => screen.getByText(name).closest("button");
  return { onChange, onRequestCategory, searchbox, cardFor, ...utils };
}

describe("CategorySelector (MEH-830 characterization)", () => {
  it("rest state shows the popular-6 only; rest categories hidden behind show-more", () => {
    setup();
    expect(screen.getByText("חלב וגבינות")).toBeInTheDocument();
    expect(screen.getByText("סבונים טבעיים")).toBeInTheDocument();
    // "דבש"/"תבלינים" are non-popular → not rendered until search/expand
    expect(screen.queryByText("דבש")).not.toBeInTheDocument();
    expect(screen.queryByText("תבלינים")).not.toBeInTheDocument();
  });

  it("clicking a card calls onChange(id) — the submit-payload contribution", () => {
    const { onChange, cardFor } = setup();
    fireEvent.click(cardFor("שמנים"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(4); // id of "שמנים"
  });

  it("selectedIds drives aria-pressed; empty selection presses nothing", () => {
    const { cardFor } = setup({ selectedIds: [2] });
    expect(cardFor("לחמים ואפייה")).toHaveAttribute("aria-pressed", "true");
    expect(cardFor("חלב וגבינות")).toHaveAttribute("aria-pressed", "false");
  });

  it("deselect-all (selectedIds=[]) → no card is pressed", () => {
    setup({ selectedIds: [] });
    screen.getAllByRole("button").forEach((b) => {
      if (b.hasAttribute("aria-pressed")) expect(b).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("search filters: matched category surfaces; non-matches stay rendered but dimmed", () => {
    const { searchbox, cardFor } = setup();
    fireEvent.change(searchbox(), { target: { value: "דבש" } });
    // "דבש" (a rest category) now matches and is shown, un-dimmed
    const honey = cardFor("דבש");
    expect(honey).toBeInTheDocument();
    expect(honey.className).not.toContain("opacity-[.32]");
    // a non-matching popular card is still rendered, but dimmed (not removed)
    expect(cardFor("שמנים").className).toContain("opacity-[.32]");
  });

  it("search with no match → no-results CTA; clicking it calls onRequestCategory", () => {
    const { searchbox, onRequestCategory } = setup();
    fireEvent.change(searchbox(), { target: { value: "zzzzzz" } });
    // grid is replaced by the no_results prompt + CTA button
    const cta = screen.getByRole("button", { name: /no_results_cta/ });
    fireEvent.click(cta);
    expect(onRequestCategory).toHaveBeenCalledTimes(1);
  });

  it("show-more expands the rest categories into the grid", () => {
    setup();
    const showMore = screen.getByRole("button", { name: /show_more/ });
    fireEvent.click(showMore);
    expect(screen.getByText("דבש")).toBeInTheDocument();
    expect(screen.getByText("תבלינים")).toBeInTheDocument();
  });
});
