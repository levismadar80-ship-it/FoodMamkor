/**
 * MEH-3022 — when the per-business product cap answers 409, the owner sees the
 * server's Hebrew sentence, not the generic "save failed". Any other failure
 * keeps the generic copy.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const CAP = "אפשר להוסיף עד 100 מוצרים. כדי להוסיף מוצר חדש, צריך קודם למחוק אחד קיים.";

async function submitNewProduct() {
  api.get.mockResolvedValue({ data: [] });
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
  fireEvent.click(await screen.findByText(P.empty.cta));
  fireEvent.change(document.getElementById("new-product-name"), { target: { value: "לחם" } });
  fireEvent.change(document.getElementById("new-product-price-min"), { target: { value: "32" } });
  fireEvent.click(screen.getByText(P.add_submit_cta));
}

beforeEach(() => vi.clearAllMocks());

describe("product cap error", () => {
  it("409 shows the server's cap sentence", async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { detail: CAP } } });
    await submitNewProduct();
    expect(await screen.findByText(CAP)).toBeInTheDocument();
  });

  it("500 keeps the generic save-failed copy", async () => {
    api.post.mockRejectedValue({ response: { status: 500, data: { detail: "boom" } } });
    await submitNewProduct();
    expect(await screen.findByText(P.errors.save_failed)).toBeInTheDocument();
    expect(screen.queryByText("boom")).toBeNull();
  });
});

// MEH-3261: an approved business's product text refused by the AI check
// answers 422 with a Hebrew sentence — shown as-is on create and on edit.
const REJECTED = "הטקסט אינו עומד בהנחיות הקהילה שלנו. אפשר לנסח מחדש ולשמור שוב.";

describe("AI-rejected product text (MEH-3261)", () => {
  it("422 on create shows the server's sentence", async () => {
    api.post.mockRejectedValue({ response: { status: 422, data: { detail: REJECTED } } });
    await submitNewProduct();
    expect(await screen.findByText(REJECTED)).toBeInTheDocument();
  });

  it("422 on edit shows the server's sentence", async () => {
    api.get.mockResolvedValue({
      data: [{ id: "p1", name: "לחם", price_min: 32, price_max: null }],
    });
    api.put.mockRejectedValue({ response: { status: 422, data: { detail: REJECTED } } });
    render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductsSection />
      </NextIntlClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: P.card.edit_aria_template.replace("{name}", "לחם"),
      }),
    );
    fireEvent.click(await screen.findByText(P.save_edit_cta));
    expect(await screen.findByText(REJECTED)).toBeInTheDocument();
  });
});
