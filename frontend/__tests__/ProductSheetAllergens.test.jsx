import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";

/**
 * MEH-2662 chunk 3 — ingredients + allergens on the public product sheet.
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

const UNDECLARED = "בית העסק לא ציין אלרגנים. אם יש לכם רגישות, שאלו לפני ההזמנה.";

describe("ProductSheet — ingredients + allergens (MEH-2662 · MEH-3439)", () => {
  it("nothing declared: the «לא ציין» line, no declaration line", () => {
    renderSheet({});
    expect(screen.getByTestId("product-sheet-allergens-undeclared")).toHaveTextContent(UNDECLARED);
    expect(screen.queryByTestId("product-sheet-allergens")).toBeNull();
    expect(screen.queryByTestId("product-sheet-may-contain")).toBeNull();
    expect(screen.queryByText("לפי הצהרת בית העסק")).toBeNull();
  });

  it("blank ingredients and empty lists count as not filled", () => {
    renderSheet({ ingredients: "   ", allergens: [], may_contain: [] });
    expect(screen.queryByTestId("product-sheet-ingredients")).toBeNull();
    expect(screen.getByTestId("product-sheet-allergens-undeclared")).toBeInTheDocument();
    expect(screen.queryByTestId("product-sheet-facts-declared")).toBeNull();
  });

  it("ingredients only: ingredients + «לא ציין» + declaration", () => {
    renderSheet({ ingredients: "קמח כוסמין מלא, מים, מלח" });
    expect(screen.getByRole("heading", { name: "רכיבים" })).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-ingredients")).toHaveTextContent("קמח כוסמין מלא, מים, מלח");
    expect(screen.getByTestId("product-sheet-allergens-undeclared")).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-facts-declared")).toHaveTextContent("לפי הצהרת בית העסק");
  });

  it("one allergen: «מכיל: גלוטן», no «לא ציין»", () => {
    renderSheet({ allergens: ["gluten"] });
    expect(screen.getByRole("heading", { name: "אלרגנים" })).toBeInTheDocument();
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^מכיל: גלוטן$/);
    expect(screen.queryByTestId("product-sheet-allergens-undeclared")).toBeNull();
    expect(screen.getAllByTestId("product-sheet-facts-declared")).toHaveLength(1);
  });

  it("many allergens + ingredients: both blocks, one declaration line", () => {
    renderSheet({ ingredients: "קמח, שומשום", allergens: ["gluten", "sesame", "milk"] });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent("מכיל: גלוטן, שומשום, חלב");
    expect(screen.getByTestId("product-sheet-ingredients")).toBeInTheDocument();
    expect(screen.getAllByTestId("product-sheet-facts-declared")).toHaveLength(1);
  });

  it("may-contain only (one): «עלול להכיל: אגוזים», no «מכיל», no «לא ציין»", () => {
    renderSheet({ may_contain: ["tree_nuts"] });
    expect(screen.getByTestId("product-sheet-may-contain")).toHaveTextContent(/^עלול להכיל: אגוזים$/);
    expect(screen.queryByTestId("product-sheet-allergens")).toBeNull();
    expect(screen.queryByTestId("product-sheet-allergens-undeclared")).toBeNull();
    expect(screen.getByTestId("product-sheet-facts-declared")).toBeInTheDocument();
  });

  it("both lists (many): two lines, an overlapping code shown only under «מכיל»", () => {
    renderSheet({ allergens: ["milk", "fava_beans"], may_contain: ["milk", "tree_nuts", "sesame"] });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent("מכיל: חלב, פול");
    expect(screen.getByTestId("product-sheet-may-contain")).toHaveTextContent(/^עלול להכיל: אגוזים, שומשום$/);
  });

  // MEH-3444: «אחסון ותוקף».
  it("storage text: its heading + text + the declaration line", () => {
    renderSheet({ storage_info: "בקירור, עד 10 ימים מיום הקנייה" });
    expect(screen.getByTestId("product-sheet-storage")).toHaveTextContent("בקירור, עד 10 ימים מיום הקנייה");
    expect(screen.getByText("אחסון ותוקף")).toBeInTheDocument();
    expect(screen.getByText("לפי הצהרת בית העסק")).toBeInTheDocument();
  });

  it("storage sits after the allergens and before the declaration line", () => {
    renderSheet({ allergens: ["milk"], storage_info: "בקירור" });
    const text = screen.getByTestId("product-sheet-facts").textContent;
    expect(text.indexOf("מכיל: חלב")).toBeGreaterThan(-1);
    expect(text.indexOf("אחסון ותוקף")).toBeGreaterThan(text.indexOf("מכיל: חלב"));
    expect(text.indexOf("לפי הצהרת בית העסק")).toBeGreaterThan(text.indexOf("בקירור"));
  });

  it("blank storage text is not shown", () => {
    renderSheet({ storage_info: "  " });
    expect(screen.queryByTestId("product-sheet-storage")).toBeNull();
    expect(screen.queryByText("אחסון ותוקף")).toBeNull();
  });

  // MEH-3442: the owner's detail in brackets after its allergen.
  it("details: «מכיל: גלוטן (כוסמין)» and «עלול להכיל: אגוזים (שקדים)»", () => {
    renderSheet({ allergens: ["gluten", "milk"], may_contain: ["tree_nuts"], gluten_detail: "כוסמין", nuts_detail: "שקדים" });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^מכיל: גלוטן \(כוסמין\), חלב$/);
    expect(screen.getByTestId("product-sheet-may-contain")).toHaveTextContent(/^עלול להכיל: אגוזים \(שקדים\)$/);
  });

  it("a blank detail adds no brackets", () => {
    renderSheet({ allergens: ["gluten"], gluten_detail: "  " });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^מכיל: גלוטן$/);
  });

  it("an unknown code is dropped, never shown as a raw key", () => {
    renderSheet({ allergens: ["gluten", "pineapple"], may_contain: ["pineapple"] });
    expect(screen.getByTestId("product-sheet-allergens")).toHaveTextContent(/^מכיל: גלוטן$/);
    expect(screen.queryByTestId("product-sheet-may-contain")).toBeNull();
    expect(screen.queryByText(/pineapple/)).toBeNull();
  });
});
