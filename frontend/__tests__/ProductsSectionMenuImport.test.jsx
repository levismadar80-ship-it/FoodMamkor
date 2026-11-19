/**
 * MEH-3430 — «העלו תפריט» as mounted in the products card: the strip at 0
 * products, the button at 3, and it steps aside while the add-product form is
 * open (review 18/11: the placement was only tested on MenuImport alone).
 *
 * REUSES: __tests__/ProductsSectionEmptyState.test.jsx (render harness).
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
const product = (id) => ({ id, name: `מוצר ${id}`, price_min: 10 });

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ProductsSection × MenuImport (MEH-3430)", () => {
  it("0 products: the strip, and it steps aside while the add form is open", async () => {
    api.get.mockResolvedValue({ data: [] });
    renderSection();
    expect(await screen.findByTestId("menu-strip")).toBeInTheDocument();
    fireEvent.click(screen.getByText(P.empty.cta));
    expect(screen.queryByTestId("menu-strip")).toBeNull();
  });

  it("3 products: the button, not the strip", async () => {
    api.get.mockResolvedValue({ data: [product(1), product(2), product(3)] });
    renderSection();
    expect(await screen.findByTestId("menu-button")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-strip")).toBeNull();
  });

  it("a failed product load: no menu entry point either", async () => {
    api.get.mockRejectedValue(new Error("down"));
    renderSection();
    expect(await screen.findByTestId("products-load-error")).toBeInTheDocument();
    expect(screen.queryByTestId("menu-strip")).toBeNull();
    expect(screen.queryByTestId("menu-button")).toBeNull();
  });
});
