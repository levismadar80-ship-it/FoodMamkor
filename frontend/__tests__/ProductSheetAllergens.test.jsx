import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";

/**
 * MEH-2662 chunk 3 — ingredients + allergens on the public product sheet.
 * Cells: (no ingredients / ingredients) × (allergens 0 / 1 / many), plus an
 * unknown code and a blank ingredients string. Keys resolve from the real
 * he.json so a missing or renamed key renders the raw key and fails.
 */
const lookup = (full) => full.split(".").reduce((o, k) => (o == null ? undefined : o[k]), he);

vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key) => {
    const full = ns ? `${ns}.${key}` : key;
    const v = lookup(full);
    return typeof v === "string" ? v : full;
  },
}));

vi.mock("next/image", () => ({
  default: (props) => <img data-testid="sheet-image" src={props.src} alt={props.alt} />,
}));

vi.mock("@phosphor-icons/react", () => ({
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
}));

vi.mock("@/lib/contact-tracking", () => ({
  pingWhatsAppBeacon: vi.fn(),
  markWhatsAppClickedLocal: vi.fn(),
}));

import ProductSheet from "@/components/public/ProductSheet";

const producer = { id: 7, name: "מאפיית השדה", phone: "0501234567" };
const renderSheet = (extra) =>
  render(<ProductSheet product={{ id: 11, name: "לחם כוסמין", ...extra }} producer={producer} onClose={vi.fn()} />);

describe("ProductSheet — ingredients + allergens (MEH-2662)", () => {
  it("neither filled: no block, no declaration line", () => {
    renderSheet({});
    expect(screen.queryByTestId("product-sheet-facts")).toBeNull();
    expect(screen.queryByText("לפי הצהרת בית העסק")).toBeNull();
  });

  it("blank ingredients and an empty list count as not filled", () => {
    renderSheet({ ingredients: "   ", allergens: [] });
    expect(screen.queryByTestId("product-sheet-facts")).toBeNull();
  });

  it("ingredients only: heading + text + declaration, no allergens line", () => {
    renderSheet({ ingredients: "קמח כוסמין מלא, מים, מלח" });
    expect(screen.getByRole("heading", { name: "רכיבים" })).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-ingredients")).toHaveTextContent("קמח כוסמין מלא, מים, מלח");
    expect(screen.queryByTestId("product-sheet-allergens")).toBeNull();
    expect(screen.getByTestId("product-sheet-facts-declared")).toHaveTextContent("לפי הצהרת בית העסק");
  });

  it("one allergen, no ingredients: allergens line + declaration", () => {
    renderSheet({ allergens: ["gluten"] });
    expect(screen.getByRole("heading", { name: "אלרגנים" })).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^גלוטן$/);
    expect(screen.queryByTestId("product-sheet-ingredients")).toBeNull();
    expect(screen.getAllByTestId("product-sheet-facts-declared")).toHaveLength(1);
  });

  it("many allergens + ingredients: both blocks, one declaration line", () => {
    renderSheet({ ingredients: "קמח, שומשום", allergens: ["gluten", "sesame", "milk"] });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent("גלוטן, שומשום, חלב");
    expect(screen.getByTestId("product-sheet-ingredients")).toBeInTheDocument();
    expect(screen.getAllByTestId("product-sheet-facts-declared")).toHaveLength(1);
  });

  it("an unknown code is dropped, never shown as a raw key", () => {
    renderSheet({ allergens: ["gluten", "pineapple"] });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^גלוטן$/);
    expect(screen.queryByText(/pineapple/)).toBeNull();
  });
});
