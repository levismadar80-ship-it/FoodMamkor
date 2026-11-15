/**
 * MEH-3055 — the dashboard's «סידור וקבוצות». 5-state: 0/1 products (no entry)
 * · many products × closed/open · 0 groups / groups.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductOrganizer from "@/components/ProductOrganizer";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const O = he.settings.products.organize;
const prods = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `מוצר ${i}`, position: null, group_id: null }));

function mount(products, onProductsChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductOrganizer products={products} onProductsChange={onProductsChange} />
    </NextIntlClientProvider>,
  );
  return onProductsChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
});

describe("ProductOrganizer", () => {
  it("0 or 1 product: nothing to organize, nothing rendered, nothing fetched", () => {
    mount(prods(1));
    expect(screen.queryByTestId("product-organizer")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("closed: one entry line, no fetch until opened", () => {
    mount(prods(3));
    expect(screen.getByTestId("product-organizer-open")).toHaveTextContent(O.open_cta);
    expect(screen.getByText(O.open_hint)).toBeInTheDocument();
    expect(screen.queryByTestId("product-order-list")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  it("open with 0 groups: empty-groups line, every product listed, no group selects; «סיום» closes", async () => {
    mount(prods(3));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me/product-groups"));
    expect(screen.getByTestId("product-groups-empty")).toBeInTheDocument();
    expect(screen.getAllByTestId("product-order-row")).toHaveLength(3);
    expect(screen.queryByTestId("product-group-select")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("product-organizer-done"));
    expect(screen.queryByTestId("product-order-list")).not.toBeInTheDocument();
  });

  it("an arrow moves a product and saves the whole order", async () => {
    api.put.mockResolvedValue({ data: [] });
    const onChange = mount(prods(3));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    const downs = await screen.findAllByTestId("product-move-down");
    expect(screen.getAllByTestId("product-move-up")[0]).toBeDisabled();
    expect(downs[2]).toBeDisabled();
    fireEvent.click(downs[0]);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-order", { product_ids: ["p1", "p0", "p2"] }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // Positions are merged into the CURRENT list (its own order), not a snapshot.
    expect(onChange.mock.calls[0][0].map((p) => [p.id, p.position])).toEqual([["p0", 1], ["p1", 0], ["p2", 2]]);
  });

  const rowNames = () => screen.getAllByTestId("product-order-row").map((r) => r.textContent);

  it("a refused order save puts the last saved order back on screen", async () => {
    api.put.mockRejectedValue({ response: { data: { detail: "x" } } });
    const onChange = mount(prods(3));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    fireEvent.click((await screen.findAllByTestId("product-move-down"))[0]);
    expect(rowNames()[0]).toContain("מוצר 1"); // optimistic
    await waitFor(() => expect(rowNames()[0]).toContain("מוצר 0"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fast clicks: one save in flight; the clicks made meanwhile go as ONE save of the latest order", async () => {
    /** @type {(v?: unknown) => void} */
    let release = () => {};
    api.put.mockImplementationOnce(() => new Promise((r) => { release = r; })).mockResolvedValue({ data: [] });
    mount(prods(3));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    await screen.findAllByTestId("product-move-down");
    fireEvent.click(screen.getAllByTestId("product-move-down")[0]); // p1 p0 p2
    fireEvent.click(screen.getAllByTestId("product-move-down")[1]); // p1 p2 p0
    fireEvent.click(screen.getAllByTestId("product-move-up")[1]); //   p2 p1 p0
    expect(api.put).toHaveBeenCalledTimes(1);
    release({ data: [] });
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    expect(api.put.mock.calls[1][1]).toEqual({ product_ids: ["p2", "p1", "p0"] });
  });

  it("a product deleted above while open leaves the order list too", async () => {
    const { rerender } = render(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductOrganizer products={prods(3)} onProductsChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    await screen.findAllByTestId("product-order-row");
    rerender(
      <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
        <ProductOrganizer products={prods(3).slice(1)} onProductsChange={vi.fn()} />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("product-order-row")).toHaveLength(2));
  });

  it("many groups × open: a refused rename shows the stored name again", async () => {
    api.get.mockResolvedValue({ data: [{ id: "g1", name: "לחמים" }, { id: "g2", name: "עוגות" }] });
    api.put.mockRejectedValue({ response: { data: { detail: "dup" } } });
    mount(prods(2));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    expect(await screen.findAllByTestId("product-group-row")).toHaveLength(2);
    const input = screen.getAllByTestId("product-group-name")[1];
    fireEvent.change(input, { target: { value: "לחמים" } });
    fireEvent.blur(input);
    await waitFor(() => expect(screen.getAllByTestId("product-group-name")[1]).toHaveValue("עוגות"));
  });

  it("adding a group sends the full list with the new name", async () => {
    api.put.mockResolvedValue({ data: [{ id: "g1", name: "לחמים" }] });
    mount(prods(2));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    fireEvent.change(await screen.findByTestId("product-group-new"), { target: { value: "  לחמים " } });
    fireEvent.click(screen.getByTestId("product-group-add"));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/product-groups", { groups: [{ name: "לחמים" }] }),
    );
    expect(await screen.findAllByTestId("product-group-row")).toHaveLength(1);
    expect(screen.getAllByTestId("product-group-select")).toHaveLength(2);
  });

  it("with groups: choosing a group saves it for that product", async () => {
    api.get.mockResolvedValue({ data: [{ id: "g1", name: "לחמים" }] });
    api.put.mockResolvedValue({ data: { id: "p1", group_id: "g1" } });
    const onChange = mount(prods(2));
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    const selects = await screen.findAllByTestId("product-group-select");
    fireEvent.change(selects[1], { target: { value: "g1" } });
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me/products/p1/group", { group_id: "g1" }),
    );
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0].find((p) => p.id === "p1").group_id).toBe("g1");
  });

  it("deleting a group keeps its products, now ungrouped", async () => {
    api.get.mockResolvedValue({ data: [{ id: "g1", name: "לחמים" }] });
    api.put.mockResolvedValue({ data: [] });
    const products = prods(2).map((p, i) => (i === 0 ? { ...p, group_id: "g1" } : p));
    const onChange = mount(products);
    fireEvent.click(screen.getByTestId("product-organizer-open"));
    fireEvent.click(await screen.findByTestId("product-group-delete"));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/producers/me/product-groups", { groups: [] }));
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const next = onChange.mock.calls[0][0];
    expect(next).toHaveLength(2);
    expect(next[0].group_id).toBeNull();
  });
});
