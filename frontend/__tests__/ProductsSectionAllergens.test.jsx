/**
 * MEH-2662 chunk 2 — ingredients + allergens fields in the owner's product form.
 * Cells: allergens 0 / 1 / many × add form / edit form, plus clearing on edit.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";
import { ALLERGEN_CODES, toggleAllergen } from "@/lib/allergens";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const F = P.form;

function renderSection() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

async function openAddForm() {
  api.get.mockResolvedValue({ data: [] });
  renderSection();
  fireEvent.click(await screen.findByText(P.empty.cta));
  fireEvent.change(document.getElementById("new-product-name"), { target: { value: "לחם" } });
  fireEvent.change(document.getElementById("new-product-price-min"), { target: { value: "32" } });
}

const chip = (label) => within(screen.getByTestId("product-allergens-group")).getByRole("button", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("allergen code list", () => {
  it("matches backend/app/allergens.py exactly, in order", () => {
    const py = readFileSync(resolve(__dirname, "../../backend/app/allergens.py"), "utf8");
    const block = py.slice(py.indexOf("ALLERGEN_CODES"), py.indexOf(")", py.indexOf("ALLERGEN_CODES")));
    const backend = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(backend).toHaveLength(14);
    expect(ALLERGEN_CODES).toEqual(backend);
  });

  it("every code has a Hebrew and an English label", () => {
    for (const c of ALLERGEN_CODES) {
      expect(he.settings.products.form[`allergen_${c}`], c).toBeTruthy();
      expect(en.settings.products.form[`allergen_${c}`], c).toBeTruthy();
    }
  });

  it("toggleAllergen keeps canonical order and removes on second toggle", () => {
    expect(toggleAllergen(["sesame"], "gluten")).toEqual(["gluten", "sesame"]);
    expect(toggleAllergen(["gluten", "sesame"], "gluten")).toEqual(["sesame"]);
  });
});

describe("add form", () => {
  it("shows the ingredients field with its example and the 14 allergen chips", async () => {
    await openAddForm();
    expect(screen.getByPlaceholderText(F.ingredients_placeholder)).toBeInTheDocument();
    expect(screen.getByText(F.allergens_helper)).toBeInTheDocument();
    expect(within(screen.getByTestId("product-allergens-group")).getAllByRole("button")).toHaveLength(14);
  });

  it("nothing filled → both sent as null", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ ingredients: null, allergens: null }),
    );
  });

  it("one allergen + ingredients are sent", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.change(screen.getByTestId("product-ingredients-input"), { target: { value: "קמח, מים, מלח" } });
    fireEvent.click(chip(F.allergen_gluten));
    expect(chip(F.allergen_gluten)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ ingredients: "קמח, מים, מלח", allergens: ["gluten"] }),
    );
  });

  it("many allergens are sent in canonical order, an un-toggled one is dropped", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(chip(F.allergen_sesame));
    fireEvent.click(chip(F.allergen_milk));
    fireEvent.click(chip(F.allergen_gluten));
    fireEvent.click(chip(F.allergen_milk));
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ allergens: ["gluten", "sesame"] }),
    );
  });
});

describe("edit form", () => {
  const product = {
    id: 7,
    name: "לחם מחמצת",
    price_min: 32,
    image_url: null,
    ingredients: "קמח כוסמין, מים",
    allergens: ["gluten", "sesame"],
  };

  async function openEdit() {
    api.get.mockResolvedValue({ data: [product] });
    renderSection();
    await screen.findByText("לחם מחמצת");
    fireEvent.click(screen.getByRole("button", { name: P.card.edit_aria_template.replace("{name}", "לחם מחמצת") }));
  }

  it("pre-fills the stored ingredients and pressed allergen chips", async () => {
    await openEdit();
    expect(screen.getByTestId("product-ingredients-input")).toHaveValue("קמח כוסמין, מים");
    expect(chip(F.allergen_gluten)).toHaveAttribute("aria-pressed", "true");
    expect(chip(F.allergen_sesame)).toHaveAttribute("aria-pressed", "true");
    expect(chip(F.allergen_milk)).toHaveAttribute("aria-pressed", "false");
  });

  it("clearing the box and every chip sends explicit nulls (clears the stored values)", async () => {
    await openEdit();
    api.put.mockResolvedValue({ data: { ...product, ingredients: null, allergens: null } });
    fireEvent.change(screen.getByTestId("product-ingredients-input"), { target: { value: "  " } });
    fireEvent.click(chip(F.allergen_gluten));
    fireEvent.click(chip(F.allergen_sesame));
    fireEvent.click(screen.getByText(P.save_edit_cta));
    expect(api.put).toHaveBeenCalledWith(
      "/producers/me/products/7",
      expect.objectContaining({ ingredients: null, allergens: null }),
    );
  });
});
