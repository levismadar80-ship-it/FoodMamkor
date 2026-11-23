import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import en from "../messages/en.json";
import RecipeForm from "@/components/RecipeForm";
import { applyRecipeDraft } from "@/lib/recipe-draft";

// MEH-3740: «יש לכם מתכון כתוב?» on the recipe form and the «?» on its nine
// fields. The draft states are a matrix: box closed / open × a draft with no
// field / one field / many fields × 0 / 1 / many related products.

// Config shape, not behaviour: the field map is the backend's, and nothing
// in the frontend runs it, so its keys are read as data (testing.md MEH-3531).
const MAP = JSON.parse(
  readFileSync(resolve(__dirname, "../../backend/app/data/form_maps/recipe.json"), "utf8"),
);
const KEYS = MAP.fields.map((f) => f.key);
const F = he.recipes.form;
const PF = he.page_fill;
const TEXT = "עוגת שמרים של סבתא. 500 גרם קמח, 2 ביצים. אופים 35 דקות.";

const apiMock = vi.hoisted(() => {
  const state = { products: [], fill: null, fillError: null };
  return {
    state,
    get: vi.fn(() => Promise.resolve({ data: state.products })),
    post: vi.fn((url) => {
      if (url.startsWith("/producers/me/ai-fill/")) {
        return state.fillError ? Promise.reject(state.fillError) : Promise.resolve({ data: state.fill });
      }
      return Promise.resolve({ data: { id: "r-new" } });
    }),
    patch: vi.fn(() => Promise.resolve({ data: { id: "r1" } })),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/UnverifiedEmailNotice", () => ({ default: () => null }));

const EMPTY_DRAFT = {
  title: null, description: null, ingredients: null, instructions: null,
  prep_time_min: null, cook_time_min: null, servings: null, product_ids: [],
};
const PRODUCTS = {
  0: [],
  1: [{ id: "p1", name: "חמאה" }],
  many: [{ id: "p1", name: "חמאה" }, { id: "p2", name: "קמח" }, { id: "p3", name: "שמרים" }],
};

async function renderForm(props = {}) {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RecipeForm {...props} />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(screen.queryByText(F.products_loading)).not.toBeInTheDocument());
}

const box = () => screen.getByTestId("form-fill-recipe");
const toggle = () => screen.getByTestId("form-fill-recipe-toggle");

async function fillFrom(draft) {
  apiMock.state.fill = { form: "recipe", draft };
  fireEvent.click(toggle());
  fireEvent.change(screen.getByTestId("form-fill-recipe-text"), { target: { value: TEXT } });
  fireEvent.click(screen.getByTestId("form-fill-recipe-read"));
  await waitFor(() => expect(screen.getByTestId("form-fill-recipe-text")).not.toBeVisible());
}

beforeEach(() => {
  apiMock.state.products = [];
  apiMock.state.fill = null;
  apiMock.state.fillError = null;
  apiMock.post.mockClear();
});

describe("the «?» on every recipe field (MEH-3740)", () => {
  it("he.json and en.json hold one help text per field of the backend map, and no other", () => {
    expect(KEYS).toHaveLength(9);
    expect(Object.keys(F.help).sort()).toEqual([...KEYS].sort());
    expect(Object.keys(en.recipes.form.help).sort()).toEqual([...KEYS].sort());
  });

  it("each of the nine fields opens its approved text, with no server call", async () => {
    await renderForm();
    apiMock.post.mockClear();
    for (const key of KEYS) {
      const trigger = screen.getByTestId(`recipe-help-${key}`);
      const panel = document.getElementById(trigger.getAttribute("aria-controls"));
      expect(panel).not.toBeVisible();
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(panel).toBeVisible();
      expect(panel).toHaveTextContent(F.help[key]);
      fireEvent.click(trigger);
      expect(panel).not.toBeVisible();
    }
    expect(apiMock.post).not.toHaveBeenCalled();
  });
});

describe("«יש לכם מתכון כתוב?» — the fill box (MEH-3740)", () => {
  it("create mode shows the box closed, with the approved title and intro; edit mode has no box", async () => {
    await renderForm();
    expect(within(box()).getByText(F.fill.title)).toBeInTheDocument();
    expect(within(box()).getByText(F.fill.intro)).toBeInTheDocument();
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("form-fill-recipe-text")).not.toBeVisible();
  });

  it("edit mode has no box", async () => {
    await renderForm({ mode: "edit", initial: { id: "r1", title: "x", ingredients: "y", instructions: "z" } });
    expect(screen.queryByTestId("form-fill-recipe")).toBeNull();
  });

  it("open: the approved button stays off under 20 characters; cancel closes", async () => {
    await renderForm();
    fireEvent.click(toggle());
    const read = screen.getByTestId("form-fill-recipe-read");
    expect(read).toHaveTextContent(PF.read);
    expect(read).toBeDisabled();
    fireEvent.change(screen.getByTestId("form-fill-recipe-text"), { target: { value: TEXT } });
    expect(read).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: PF.cancel }));
    expect(toggle()).toHaveAttribute("aria-expanded", "false");
  });

  it("a draft with many fields fills them, and nothing is saved", async () => {
    await renderForm();
    await fillFrom({
      ...EMPTY_DRAFT,
      title: "עוגת שמרים", ingredients: "500 גרם קמח\n2 ביצים", instructions: "לאפות",
      cook_time_min: 35, servings: 12,
    });
    expect(screen.getByLabelText(/^שם המתכון/)).toHaveValue("עוגת שמרים");
    expect(screen.getByLabelText(/^רכיבים/)).toHaveValue("500 גרם קמח\n2 ביצים");
    expect(screen.getByLabelText(F.cook_time_label)).toHaveValue(35);
    expect(screen.getByLabelText(F.servings_label)).toHaveValue(12);
    expect(screen.getByLabelText(F.prep_time_label)).toHaveValue(null);
    expect(apiMock.post).toHaveBeenCalledTimes(1);
    expect(apiMock.post).toHaveBeenCalledWith("/producers/me/ai-fill/recipe", { text: TEXT });
    expect(apiMock.post.mock.calls.some(([u]) => u === "/producers/me/recipes")).toBe(false);
  });

  it("a draft with one field fills it and keeps what the owner already typed", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/^רכיבים/), { target: { value: "שלי" } });
    await fillFrom({ ...EMPTY_DRAFT, title: "רק שם" });
    expect(screen.getByLabelText(/^שם המתכון/)).toHaveValue("רק שם");
    expect(screen.getByLabelText(/^רכיבים/)).toHaveValue("שלי");
  });

  it("a draft with no field changes nothing", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/^שם המתכון/), { target: { value: "שלי" } });
    await fillFrom(EMPTY_DRAFT);
    expect(screen.getByLabelText(/^שם המתכון/)).toHaveValue("שלי");
  });

  it("no AI (503): the approved failure message, and the manual form still works", async () => {
    apiMock.state.fillError = { response: { status: 503, data: { detail: PF.failed } } };
    await renderForm();
    fireEvent.click(toggle());
    fireEvent.change(screen.getByTestId("form-fill-recipe-text"), { target: { value: TEXT } });
    fireEvent.click(screen.getByTestId("form-fill-recipe-read"));
    expect(await within(box()).findByText(PF.failed)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^שם המתכון/), { target: { value: "ידני" } });
    expect(screen.getByLabelText(/^שם המתכון/)).toHaveValue("ידני");
  });

  it.each([
    ["0 products: a picked id is ignored", PRODUCTS[0], ["p1"], []],
    ["1 product: it is ticked", PRODUCTS[1], ["p1"], ["p1"]],
    ["many products: the picked ones are ticked, an unlisted id is not", PRODUCTS.many, ["p3", "p1", "zz"], ["p1", "p3"]],
  ])("%s", async (_name, products, picked, ticked) => {
    apiMock.state.products = products;
    await renderForm();
    await fillFrom({ ...EMPTY_DRAFT, product_ids: picked });
    const checked = products.filter((p) => screen.getByLabelText(p.name).checked).map((p) => p.id);
    expect(checked.sort()).toEqual(ticked);
  });
});

describe("applyRecipeDraft", () => {
  it("takes only whole numbers and listed products", () => {
    const next = applyRecipeDraft(
      { title: "a", servings: "", product_ids: ["p2"] },
      { draft: { servings: 4.5, prep_time_min: 10, product_ids: ["nope"] }, products: PRODUCTS.many },
    );
    expect(next).toEqual({ title: "a", servings: "", prep_time_min: "10", product_ids: ["p2"] });
  });
});
