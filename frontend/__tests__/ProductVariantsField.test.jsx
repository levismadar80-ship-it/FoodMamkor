import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// MEH-3617 — the owner's «אפשרויות» block and the JSON-LD offers per variant.

vi.mock("next-intl", async (importOriginal) => ({ ...(await importOriginal()), useTranslations: () => (key) => key }));
vi.mock("@/lib/api", () => ({ default: { put: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn() } }));
vi.mock("@phosphor-icons/react", async (importOriginal) => ({ ...(await importOriginal()), ArrowUp: () => <span />, ArrowDown: () => <span />, Trash: () => <span /> }));

import api from "@/lib/api";
import ProductVariantsField, { MAX_VARIANTS, bodyFrom, rowsFrom } from "@/components/dashboard/ProductVariantsField";
import { buildJsonLd } from "@/lib/seo";

const S = "05000000-0000-4000-8000-000000000005";
const L = "06000000-0000-4000-8000-000000000006";
const P = "0a000000-0000-4000-8000-00000000000a";

beforeEach(() => api.put.mockReset());

describe("ProductVariantsField (MEH-3617)", () => {
  it("0 variants: only «הוספת אפשרות», no rows", () => {
    render(<ProductVariantsField productId={P} variants={[]} onSaved={() => {}} />);
    expect(screen.queryAllByTestId("product-variant-edit-row")).toHaveLength(0);
    expect(screen.getByTestId("product-variant-add")).toBeTruthy();
  });

  it("adds a row and saves the whole list in order, price in agorot", async () => {
    api.put.mockResolvedValue({ data: { variants: [{ id: S, name: "קטנה", price_agorot: 4500, in_stock: true }] } });
    const onSaved = vi.fn();
    render(<ProductVariantsField productId={P} variants={[]} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("product-variant-add"));
    const [name, price] = screen.getAllByRole("textbox");
    fireEvent.change(name, { target: { value: " קטנה " } });
    fireEvent.change(price, { target: { value: "45" } });
    fireEvent.click(screen.getByTestId("product-variant-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(api.put).toHaveBeenCalledWith(`/products/${P}/variants`, {
      variants: [{ name: "קטנה", price_agorot: 4500, in_stock: true }],
    });
  });

  it("many: moves a row down and keeps the ids", () => {
    const variants = [
      { id: S, name: "קטנה", price_agorot: null, in_stock: true },
      { id: L, name: "גדולה", price_agorot: 7000, in_stock: false },
    ];
    render(<ProductVariantsField productId={P} variants={variants} onSaved={() => {}} />);
    fireEvent.click(screen.getAllByLabelText("move_down")[0]);
    fireEvent.click(screen.getByTestId("product-variant-save"));
    expect(api.put.mock.calls[0][1].variants.map((v) => v.id)).toEqual([L, S]);
  });

  it("shows the server's Hebrew sentence on a refused save", async () => {
    api.put.mockRejectedValueOnce({ response: { status: 409, data: { detail: "אפשר להוסיף עד 10 אפשרויות למוצר אחד." } } });
    const onSaved = vi.fn();
    render(<ProductVariantsField productId={P} variants={[{ id: S, name: "x", in_stock: true }]} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("product-variant-save"));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(await screen.findByText("אפשר להוסיף עד 10 אפשרויות למוצר אחד.")).toBeTruthy();
  });

  it("at the cap, «הוספת אפשרות» gives way to the cap line", () => {
    const variants = Array.from({ length: MAX_VARIANTS }, (_, i) => ({ id: `v${i}`, name: `n${i}`, in_stock: true }));
    render(<ProductVariantsField productId={P} variants={variants} onSaved={() => {}} />);
    expect(screen.queryByTestId("product-variant-add")).toBeNull();
    expect(screen.getByTestId("product-variant-cap")).toBeTruthy();
  });

  it("bodyFrom drops a blank row; an empty price is null", () => {
    const rows = [...rowsFrom([{ id: S, name: "a", price_agorot: 1250, in_stock: true }]), { key: "n", id: null, name: "  ", price: "", in_stock: true }];
    expect(bodyFrom(rows)).toEqual({ variants: [{ id: S, name: "a", price_agorot: 1250, in_stock: true }] });
    expect(rowsFrom([{ id: S, name: "a", price_agorot: 1250, in_stock: true }])[0].price).toBe("12.5");
  });
});

describe("JSON-LD offers per variant (MEH-3617)", () => {
  const producer = (variants) => ({
    id: 42,
    slug: "s",
    name: "מאפייה",
    city: "חיפה",
    products: [{ id: P, name: "עוגה", price_min: 60, price_max: 60, variants }],
  });
  const offers = (p) => {
    const graph = buildJsonLd(p)["@graph"] ?? [buildJsonLd(p)];
    return graph.find((n) => n.hasOfferCatalog).hasOfferCatalog.itemListElement;
  };

  it("0 or 1 variant: one offer for the product, as before", () => {
    expect(offers(producer([]))).toHaveLength(1);
    expect(offers(producer([{ id: S, name: "x", price_agorot: 100, in_stock: true }]))).toHaveLength(1);
  });

  it("many: one offer per variant, at its own price or the product's", () => {
    const list = offers(producer([
      { id: S, name: "קטנה", price_agorot: 4000, in_stock: true },
      { id: L, name: "גדולה", price_agorot: null, in_stock: false },
    ]));
    expect(list.map((o) => o.itemOffered.name)).toEqual(["עוגה · קטנה", "עוגה · גדולה"]);
    expect(list.map((o) => o.priceSpecification.minPrice)).toEqual(["40", "60"]);
    expect(list[1].availability).toBe("https://schema.org/OutOfStock");
  });
});
