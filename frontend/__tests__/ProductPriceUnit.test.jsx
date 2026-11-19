/**
 * MEH-2936 — what a product's price is per (unit / kg / 100g / bottle / box).
 * Cells: the owner picks it (add form, edit form pre-filled, edit form
 * changed), the public price shows it (unit = nothing, bottle, range + kg,
 * unknown value = nothing, no numeric price = nothing), and every unit has a
 * Hebrew and an English label.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";
import ProductPrice from "@/components/ProductPrice";
import { PRICE_UNITS } from "@/lib/product-price";
import { rootClientMessages } from "@/lib/client-messages";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const U = he.price_unit;

const withIntl = (ui) => (
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    {ui}
  </NextIntlClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("labels", () => {
  it("every unit has a Hebrew and an English label", () => {
    expect(PRICE_UNITS).toEqual(["unit", "kg", "100g", "bottle", "box"]);
    for (const u of PRICE_UNITS) {
      expect(he.price_unit[u], u).toBeTruthy();
      expect(en.price_unit[u], u).toBeTruthy();
    }
    expect(U.bottle).toBe("לבקבוק");
    expect(U.box).toBe("לארגז");
  });
});

describe("public price", () => {
  const renderPrice = (product) => render(withIntl(<p data-testid="price"><ProductPrice product={product} /></p>));

  it("per unit shows the price alone, as before", () => {
    renderPrice({ price_min: 40, price_max: null, price_unit: "unit" });
    expect(screen.getByTestId("price").textContent).toBe("40₪");
    expect(screen.queryByTestId("product-price-unit")).toBeNull();
  });

  it("per bottle adds «לבקבוק» outside the ltr price span", () => {
    renderPrice({ price_min: 80, price_max: null, price_unit: "bottle" });
    const unit = screen.getByTestId("product-price-unit");
    expect(unit.textContent.trim()).toBe("לבקבוק");
    expect(unit.closest("[dir='ltr']")).toBeNull();
    expect(screen.getByTestId("price").querySelector("[dir='ltr']").textContent).toBe("80₪");
  });

  it("a range per kg keeps the range and adds «לק״ג»", () => {
    renderPrice({ price_min: 35, price_max: 60, price_unit: "kg" });
    expect(screen.getByTestId("price").querySelector("[dir='ltr']").textContent).toContain("35");
    expect(screen.getByTestId("product-price-unit").textContent.trim()).toBe(U.kg);
  });

  it("an unknown or missing unit prints no label", () => {
    renderPrice({ price_min: 40, price_unit: "crate" });
    expect(screen.queryByTestId("product-price-unit")).toBeNull();
  });

  it("the label reaches a public page: the root provider ships it (review 19/11)", () => {
    // The business page, product sheet and recipe page sit under the ROOT
    // provider, which leaves route-scoped namespaces out. Rendering with the
    // full catalog would hide a label read from one of those.
    render(
      <NextIntlClientProvider locale="he" messages={rootClientMessages(he)} onError={() => {}}>
        <p data-testid="price"><ProductPrice product={{ price_min: 80, price_unit: "bottle" }} /></p>
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("product-price-unit").textContent.trim()).toBe("לבקבוק");
  });

  it("no numeric price renders nothing", () => {
    renderPrice({ price_min: null, price_unit: "bottle" });
    expect(screen.getByTestId("price").textContent).toBe("");
  });
});

describe("owner form", () => {
  it("add form: defaults to per unit, sends the picked unit", async () => {
    api.get.mockResolvedValue({ data: [] });
    render(withIntl(<ProductsSection />));
    fireEvent.click(await screen.findByText(P.empty.cta));
    const select = document.getElementById("new-product-price-unit");
    expect(select).toHaveValue("unit");
    expect(screen.getByText(P.form.price_unit_label)).toBeInTheDocument();
    expect(screen.getByText(P.form.price_unit_hint)).toBeInTheDocument();
    expect([...select.options].map((o) => o.value)).toEqual(PRICE_UNITS);
    fireEvent.change(document.getElementById("new-product-name"), { target: { value: "יין" } });
    fireEvent.change(document.getElementById("new-product-price-min"), { target: { value: "80" } });
    fireEvent.change(select, { target: { value: "bottle" } });
    api.post.mockResolvedValue({ data: { id: 1, name: "יין", price_min: 80, price_unit: "bottle" } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ price_unit: "bottle" }),
    );
  });

  it("edit form: pre-fills the stored unit and saves a change", async () => {
    const product = { id: 7, name: "גבינה", price_min: 12, image_url: null, price_unit: "100g" };
    api.get.mockResolvedValue({ data: [product] });
    render(withIntl(<ProductsSection />));
    await screen.findByText("גבינה");
    fireEvent.click(screen.getByRole("button", { name: P.card.edit_aria_template.replace("{name}", "גבינה") }));
    const select = document.getElementById("edit-product-7-price-unit");
    expect(select).toHaveValue("100g");
    fireEvent.change(select, { target: { value: "kg" } });
    api.put.mockResolvedValue({ data: { ...product, price_unit: "kg" } });
    fireEvent.click(screen.getByText(P.save_edit_cta));
    expect(api.put).toHaveBeenCalledWith(
      "/producers/me/products/7",
      expect.objectContaining({ price_unit: "kg" }),
    );
  });

  it("the owner's own list shows the unit next to the price", async () => {
    api.get.mockResolvedValue({ data: [{ id: 3, name: "שמן זית", price_min: 90, image_url: null, price_unit: "bottle" }] });
    render(withIntl(<ProductsSection />));
    await screen.findByText("שמן זית");
    expect(screen.getByTestId("product-price-unit").textContent.trim()).toBe("לבקבוק");
  });
});
