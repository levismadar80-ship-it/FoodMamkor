/**
 * MEH-1261 F1 — ProductsSection load failure is distinct from an empty catalog.
 *
 * Before the fix, a failed GET /producers/me/products fell into
 * `.catch(() => setProducts([]))`, so a network/500 error rendered the same
 * "no products yet" EmptyState as a genuinely empty catalog — inviting the
 * owner to re-add products she already has.
 *
 * Locked behavior under test:
 *   - fetch failure → role="alert" error card with Hebrew message + retry,
 *     and the EmptyState copy is NOT rendered
 *   - clicking retry re-fires the fetch; on success the products render and
 *     the error card clears
 *
 * REUSES: __tests__/EditTabProductsSection.test.jsx (render harness — real
 * NextIntlClientProvider + he.json, api mocked).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductsSection load error (MEH-1261 F1)", () => {
  it("renders the error card (not the EmptyState) when the catalog fetch fails", async () => {
    api.get.mockRejectedValue(new Error("network"));
    renderSection();

    const alert = await screen.findByTestId("products-load-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.getByText(P.errors.load_failed)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: P.load_retry_cta })).toBeInTheDocument();
    // The failure must NOT masquerade as an empty catalog.
    expect(screen.queryByText(P.empty.title)).not.toBeInTheDocument();
  });

  it("retry re-fetches; on success the products render and the error clears", async () => {
    api.get.mockRejectedValueOnce(new Error("network"));
    renderSection();
    await screen.findByTestId("products-load-error");

    api.get.mockResolvedValueOnce({
      data: [{ id: 3, name: "ריבת משמש", price_min: 25, price_max: null, image_url: null }],
    });
    fireEvent.click(screen.getByRole("button", { name: P.load_retry_cta }));

    expect(await screen.findByText("ריבת משמש")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("products-load-error")).not.toBeInTheDocument(),
    );
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
