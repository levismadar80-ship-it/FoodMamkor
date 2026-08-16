/**
 * Module:   ProductsSectionTopProduct.test
 * Purpose:  MEH-2094 — the signature-product choice moved from a free-text
 *           field (edit/cards.jsx PricingCard) into the product row. Covers
 *           mark, re-mark (radio), unmark, failed-PUT revert, the zero-products
 *           empty state, and the legacy unmatched-name non-regression.
 * Touches:  mocked PUT /producers/me + GET /producers/me/products only.
 * Does NOT: cover the public page's matcher — that file is untouched by this
 *           ticket (app/[locale]/producer/[id]/components/ProducerSections.jsx).
 * Related:  components/ProductsSection.jsx (the toggle),
 *           __tests__/EditTabPricingCard.test.jsx (the other half of the split).
 * History:  MEH-2094 (creation).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({
  showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const C = he.settings.products.card;
const S = he.settings.products;

const PRODUCTS = [
  { id: 1, name: "לחם מחמצת", price_min: 30, price_max: null, image_url: null },
  { id: 2, name: "חלה", price_min: 25, price_max: null, image_url: null },
];

/**
 * Renders with a controlled `topProductName` so the prop→patch→prop round trip
 * the real mount site performs (edit/page.js setProfile) is actually exercised
 * — a test that passed a static prop could not see a revert.
 */
function renderSection({ initialTop = null, products = PRODUCTS } = {}) {
  api.get.mockResolvedValue({ data: products });
  const onTopProductChange = vi.fn();
  let current = initialTop;

  const view = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection
        topProductName={current}
        onTopProductChange={onTopProductChange}
      />
    </NextIntlClientProvider>,
  );

  // Re-render with whatever the component last patched upward.
  const rerenderWithPatches = () => {
    const calls = onTopProductChange.mock.calls;
    current = calls.length ? calls[calls.length - 1][0].top_product_name : current;
    view.rerender(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductsSection
          topProductName={current}
          onTopProductChange={onTopProductChange}
        />
      </NextIntlClientProvider>,
    );
  };

  return { onTopProductChange, rerenderWithPatches, ...view };
}

const markBtn = (name) => screen.getByLabelText(C.top_product_mark_aria_template.replace("{name}", name));
const unmarkBtn = (name) => screen.getByLabelText(C.top_product_unmark_aria_template.replace("{name}", name));

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("ProductsSection — top-product toggle (MEH-2094)", () => {
  it("marks a product: PUTs its exact name to /producers/me", async () => {
    const { onTopProductChange } = renderSection();
    await screen.findByText("לחם מחמצת");

    fireEvent.click(markBtn("לחם מחמצת"));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        top_product_name: "לחם מחמצת",
      }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({ top_product_name: "לחם מחמצת" });
  });

  it("radio semantics: marking B replaces A rather than adding a second", async () => {
    const { onTopProductChange, rerenderWithPatches } = renderSection({
      initialTop: "לחם מחמצת",
    });
    await screen.findByText("חלה");
    // Precondition: exactly one row is marked, and it is A.
    expect(screen.getAllByTestId("product-row-top")).toHaveLength(1);

    fireEvent.click(markBtn("חלה"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { top_product_name: "חלה" }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({ top_product_name: "חלה" });

    rerenderWithPatches();
    // Still exactly one marked row, and it is now B — A was replaced, not joined.
    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("חלה");
  });

  it("re-marking the marked product clears it (sends null)", async () => {
    const { onTopProductChange, rerenderWithPatches } = renderSection({
      initialTop: "לחם מחמצת",
    });
    await screen.findByText("לחם מחמצת");

    fireEvent.click(unmarkBtn("לחם מחמצת"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { top_product_name: null }),
    );
    expect(onTopProductChange).toHaveBeenCalledWith({ top_product_name: null });

    rerenderWithPatches();
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
  });

  it("a failed PUT reverts the toggle AND surfaces an error — never silent", async () => {
    api.put.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    const { onTopProductChange, rerenderWithPatches } = renderSection();
    await screen.findByText("לחם מחמצת");

    fireEvent.click(markBtn("לחם מחמצת"));

    // Optimistic patch first, then the revert to the previous value (null).
    await waitFor(() => expect(onTopProductChange).toHaveBeenCalledTimes(2));
    expect(onTopProductChange.mock.calls[0][0]).toEqual({ top_product_name: "לחם מחמצת" });
    expect(onTopProductChange.mock.calls[1][0]).toEqual({ top_product_name: null });

    expect(await screen.findByText(S.errors.top_product_failed)).toBeInTheDocument();

    rerenderWithPatches();
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
  });

  it("zero products: the affordance explains what to do instead of rendering a dead control", async () => {
    renderSection({ products: [] });

    const hint = await screen.findByTestId("top-product-hint");
    expect(hint.textContent).toBe(S.top_product_empty_hint);
    // No toggle exists to click, and no request was made on render.
    expect(screen.queryAllByTestId("product-row")).toHaveLength(0);
    expect(api.put).not.toHaveBeenCalled();
  });

  // THE single most important non-regression in MEH-2094.
  it("legacy: a stored name matching no product marks nothing and repairs nothing", async () => {
    renderSection({ initialTop: "מוצר שנמחק מזמן" });
    await screen.findByText("לחם מחמצת");

    // Not marked, not cleared, not migrated — and crucially no write of any kind.
    expect(screen.queryAllByTestId("product-row-top")).toHaveLength(0);
    expect(screen.getAllByTestId("product-row")).toHaveLength(2);
    expect(api.put).not.toHaveBeenCalled();

    // Every row still offers "mark" (none is in the unmark state).
    expect(markBtn("לחם מחמצת")).toBeInTheDocument();
    expect(markBtn("חלה")).toBeInTheDocument();
  });

  it("matches on trimmed name, mirroring the public page's exact-string join", async () => {
    renderSection({ initialTop: "  לחם מחמצת  " });
    await screen.findByText("לחם מחמצת");

    const marked = screen.getAllByTestId("product-row-top");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("לחם מחמצת");
  });
});
