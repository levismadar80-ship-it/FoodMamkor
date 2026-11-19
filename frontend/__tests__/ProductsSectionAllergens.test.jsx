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
// MEH-3439: the «עלול להכיל» group.
const mayChip = (label) => within(screen.getByTestId("product-may-contain-group")).getByRole("button", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("allergen code list", () => {
  it("matches backend/app/allergens.py exactly, in order", () => {
    const py = readFileSync(resolve(__dirname, "../../backend/app/allergens.py"), "utf8");
    const block = py.slice(py.indexOf("ALLERGEN_CODES"), py.indexOf(")", py.indexOf("ALLERGEN_CODES")));
    const backend = [...block.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(backend).toHaveLength(15); // MEH-3439: EU 14 + fava beans
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
  it("shows the ingredients field with its example and the 15 allergen chips", async () => {
    await openAddForm();
    expect(screen.getByPlaceholderText(F.ingredients_placeholder)).toBeInTheDocument();
    expect(screen.getByText(F.allergens_helper)).toBeInTheDocument();
    expect(within(screen.getByTestId("product-allergens-group")).getAllByRole("button")).toHaveLength(15);
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

describe("«עלול להכיל» (MEH-3439)", () => {
  it("shows its heading, helper and 15 chips; nothing ticked → sent as null", async () => {
    await openAddForm();
    expect(screen.getByText(F.may_contain_heading)).toBeInTheDocument();
    expect(screen.getByText(F.may_contain_helper)).toBeInTheDocument();
    expect(within(screen.getByTestId("product-may-contain-group")).getAllByRole("button")).toHaveLength(15);
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith("/producers/me/products", expect.objectContaining({ may_contain: null }));
  });

  it("many ticked are sent in canonical order", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(mayChip(F.allergen_sesame));
    fireEvent.click(mayChip(F.allergen_tree_nuts));
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ may_contain: ["tree_nuts", "sesame"] }),
    );
  });

  it("a code is in one group at a time: ticking «מכיל» un-ticks «עלול להכיל» and back", async () => {
    await openAddForm();
    fireEvent.click(mayChip(F.allergen_milk));
    expect(mayChip(F.allergen_milk)).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip(F.allergen_milk));
    expect(chip(F.allergen_milk)).toHaveAttribute("aria-pressed", "true");
    expect(mayChip(F.allergen_milk)).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(mayChip(F.allergen_milk));
    expect(chip(F.allergen_milk)).toHaveAttribute("aria-pressed", "false");
    expect(mayChip(F.allergen_milk)).toHaveAttribute("aria-pressed", "true");
  });
});


describe("«אחסון ותוקף» (MEH-3444)", () => {
  it("shows the label and example; empty → sent as null", async () => {
    await openAddForm();
    expect(screen.getByLabelText(F.storage_label)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(F.storage_placeholder)).toBeInTheDocument();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith("/producers/me/products", expect.objectContaining({ storage_info: null }));
  });

  it("typed text is sent trimmed", async () => {
    await openAddForm();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.change(screen.getByTestId("product-storage-input"), { target: { value: "  בקירור, עד 5 ימים " } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ storage_info: "בקירור, עד 5 ימים" }),
    );
  });

  it("edit pre-fills the stored text; clearing it sends null", async () => {
    const product = { id: 8, name: "גבינה", price_min: 40, image_url: null, storage_info: "בקירור" };
    api.get.mockResolvedValue({ data: [product] });
    renderSection();
    await screen.findByText("גבינה");
    fireEvent.click(screen.getByRole("button", { name: P.card.edit_aria_template.replace("{name}", "גבינה") }));
    expect(screen.getByTestId("product-storage-input")).toHaveValue("בקירור");
    api.put.mockResolvedValue({ data: { ...product, storage_info: null } });
    fireEvent.change(screen.getByTestId("product-storage-input"), { target: { value: "" } });
    fireEvent.click(screen.getByText(P.save_edit_cta));
    expect(api.put).toHaveBeenCalledWith("/producers/me/products/8", expect.objectContaining({ storage_info: null }));
  });
});

describe("«איזה דגן?» / «איזה אגוז?» (MEH-3442)", () => {
  it("hidden until «גלוטן» or «אגוזים» is ticked; nothing ticked → both null", async () => {
    await openAddForm();
    expect(screen.queryByTestId("product-gluten-detail-input")).toBeNull();
    expect(screen.queryByTestId("product-nuts-detail-input")).toBeNull();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ gluten_detail: null, nuts_detail: null }),
    );
  });

  it("gluten in «מכיל» and nuts in «עלול להכיל» each open their field, sent trimmed", async () => {
    await openAddForm();
    fireEvent.click(chip(F.allergen_gluten));
    fireEvent.click(mayChip(F.allergen_tree_nuts));
    expect(screen.getByLabelText(F.gluten_detail_label)).toHaveAttribute("placeholder", F.gluten_detail_placeholder);
    expect(screen.getByLabelText(F.nuts_detail_label)).toHaveAttribute("placeholder", F.nuts_detail_placeholder);
    fireEvent.change(screen.getByTestId("product-gluten-detail-input"), { target: { value: " כוסמין " } });
    fireEvent.change(screen.getByTestId("product-nuts-detail-input"), { target: { value: "שקדים" } });
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith(
      "/producers/me/products",
      expect.objectContaining({ gluten_detail: "כוסמין", nuts_detail: "שקדים" }),
    );
  });

  it("unticking the code hides the field and sends null for its text", async () => {
    await openAddForm();
    fireEvent.click(chip(F.allergen_gluten));
    fireEvent.change(screen.getByTestId("product-gluten-detail-input"), { target: { value: "כוסמין" } });
    fireEvent.click(chip(F.allergen_gluten));
    expect(screen.queryByTestId("product-gluten-detail-input")).toBeNull();
    api.post.mockResolvedValue({ data: { id: 1, name: "לחם", price_min: 32 } });
    fireEvent.click(screen.getByText(P.add_submit_cta));
    expect(api.post).toHaveBeenCalledWith("/producers/me/products", expect.objectContaining({ gluten_detail: null }));
  });
});
