import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import he from "../messages/he.json";

/**
 * MEH-2924 — a product with no price reads «מחיר משתנה לפי עונה» on the
 * public sheet, never «₪» or «0», and the JSON-LD emits no broken offer.
 * REUSES: __tests__/ProductSheetAllergens.test.jsx (mocks + real he.json).
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

describe("no fixed price (MEH-2924)", () => {
  it("the sheet says the price varies by season", () => {
    renderSheet({ price_min: null, price_max: null });
    expect(screen.getByText(he.product_price.varies)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/₪/);
  });

  it("a priced product is unchanged", () => {
    renderSheet({ price_min: 20, price_max: null });
    expect(screen.queryByText(he.product_price.varies)).toBeNull();
  });

  it("a legacy free-text price still wins over the seasonal line", () => {
    renderSheet({ price_min: null, price_range: "לפי משקל" });
    expect(screen.getByText("לפי משקל")).toBeInTheDocument();
    expect(screen.queryByText(he.product_price.varies)).toBeNull();
  });
});
