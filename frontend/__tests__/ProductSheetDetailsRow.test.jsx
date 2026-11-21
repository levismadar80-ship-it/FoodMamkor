import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";

/**
 * MEH-3450 — one closed row «פרטים על המוצר» on the product sheet.
 * MEH-3439: «מכיל: …» / «עלול להכיל: …», and an «לא ציין» line when the
 * owner declared no allergens (contains 0 × may-contain 0).
 * Cells: (no ingredients / ingredients) × (allergens 0 / 1 / many), plus an
 * unknown code and a blank ingredients string. Keys resolve from the real
 * he.json so a missing or renamed key renders the raw key and fails.
 */
const lookup = (full) => full.split(".").reduce((o, k) => (o == null ? undefined : o[k]), he);

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key, vals) => {
    const full = ns ? `${ns}.${key}` : key;
    const v = lookup(full);
    if (typeof v !== "string") return full;
    return v.replace(/\{(\w+)\}/g, (m, k) => (vals && k in vals ? String(vals[k]) : m));
  },
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="sheet-image" src={props.src} alt={props.alt} />,
}));

vi.mock("@phosphor-icons/react", () => ({
  ShareNetwork: () => null, // MEH-3621: ProductSheet's share button
  Check: () => null, // MEH-3621: ProductSheet's share button
  WhatsappLogo: () => <span />,
  X: () => <span />,
  Phone: () => <span />,
  Globe: () => <span />,
  EnvelopeSimple: () => <span />,
  InstagramLogo: () => <span />,
  FacebookLogo: () => <span />,
  Receipt: () => <span />,
  CaretLeft: () => <span />,
  CaretRight: () => <span />,
  CaretDown: () => <span />,
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

import ProductSheet from "@/components/public/ProductSheet";

const producer = { id: 7, name: "מאפיית השדה", phone: "0501234567" };
const renderSheet = (extra) =>
  render(<ProductSheet product={{ id: 11, name: "לחם כוסמין", ...extra }} producer={producer} onClose={vi.fn()} />);

const UNDECLARED = "בית העסק לא ציין אלרגנים. אם יש לכם רגישות, שאלו לפני ההזמנה.";

const HEADING = "פרטים על המוצר";
const summaryOf = () => screen.getByTestId("product-sheet-details-summary");

// Cells: (nothing to fold / ingredients / storage / both) × (closed / open),
// with the allergen answer (contains · may-contain · none · undeclared) read
// from the SUMMARY, where it must be visible while the row is closed.
describe("ProductSheet — «פרטים על המוצר» row (MEH-3450)", () => {
  it("nothing to fold (allergens only): no row, the allergen line is shown plainly", () => {
    renderSheet({ allergens: ["milk"] });
    expect(screen.queryByTestId("product-sheet-details")).toBeNull();
    expect(screen.queryByText(HEADING)).toBeNull();
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent("מכיל: חלב");
  });

  it("nothing declared at all: no row, the «לא ציין» line still shows", () => {
    renderSheet({});
    expect(screen.queryByTestId("product-sheet-details")).toBeNull();
    expect(screen.getByTestId("product-sheet-allergens-undeclared")).toHaveTextContent(UNDECLARED);
  });

  it("ingredients only: closed by default, «מכיל» visible in the summary, ingredients folded", () => {
    renderSheet({ ingredients: "קמח כוסמין, מים", allergens: ["gluten", "milk"] });
    const details = screen.getByTestId("product-sheet-details");
    expect(details.open).toBe(false);
    expect(summaryOf()).toHaveTextContent(HEADING);
    expect(summaryOf()).toContainElement(screen.getByTestId("product-sheet-allergens"));
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent("מכיל: גלוטן, חלב");
    expect(summaryOf()).not.toContainElement(screen.getByTestId("product-sheet-ingredients"));
    expect(details).toContainElement(screen.getByTestId("product-sheet-ingredients"));
    expect(screen.queryByTestId("product-sheet-storage")).toBeNull();
  });

  it("storage only: the row exists, «עלול להכיל» in the summary, storage folded", () => {
    renderSheet({ storage_info: "במקרר עד 3 ימים", may_contain: ["tree_nuts"] });
    expect(screen.getByTestId("product-sheet-details").open).toBe(false);
    expect(summaryOf()).toContainElement(screen.getByTestId("product-sheet-may-contain"));
    expect(summaryOf()).not.toContainElement(screen.getByTestId("product-sheet-storage"));
    expect(screen.queryByTestId("product-sheet-ingredients")).toBeNull();
  });

  it("both, declared none: «אין» in the summary; opening shows ingredients, storage and the declared-by line", () => {
    renderSheet({ ingredients: "שמן זית", storage_info: "במקום יבש", no_allergens: true });
    const details = screen.getByTestId("product-sheet-details");
    expect(summaryOf()).toContainElement(screen.getByTestId("product-sheet-allergens-none"));
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.open).toBe(true);
    for (const id of ["product-sheet-ingredients", "product-sheet-storage", "product-sheet-facts-declared"]) {
      expect(details).toContainElement(screen.getByTestId(id));
      expect(summaryOf()).not.toContainElement(screen.getByTestId(id));
    }
    // One allergen answer, in the summary only — not repeated inside.
    expect(screen.getAllByTestId("product-sheet-allergens-none")).toHaveLength(1);
  });

  it("row with nothing declared about allergens: «לא ציין» stays visible in the summary", () => {
    renderSheet({ ingredients: "דבש" });
    expect(summaryOf()).toContainElement(screen.getByTestId("product-sheet-allergens-undeclared"));
  });

  it("paging to the next product: a row opened on one product starts closed on the next", () => {
    const { rerender } = renderSheet({ ingredients: "קמח", allergens: ["gluten"] });
    screen.getByTestId("product-sheet-details").open = true;
    rerender(
      <ProductSheet
        product={{ id: 12, name: "חלה", ingredients: "קמח, ביצים", allergens: ["eggs"] }}
        producer={producer}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId("product-sheet-ingredients")).toHaveTextContent("קמח, ביצים");
    expect(screen.getByTestId("product-sheet-details").open).toBe(false);
  });
});
