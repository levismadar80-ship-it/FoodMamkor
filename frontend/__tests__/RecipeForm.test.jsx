import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import RecipeForm from "@/components/RecipeForm";

// MEH-2281: unit coverage for the owner recipe form, measured at 0/64
// statements by the MEH-1980 gap report. Playwright probably walks the happy
// path; what the vitest number can see — and what this file owns — is the
// VALIDATION layer: the native constraint matrix red→green, the payload
// normalisation the submit handler performs, every server-side rejection
// branch with its exact he.json copy, the submit disabled/enabled matrix,
// and edit-mode prefill + PATCH routing. `lib/api` is mocked at the module
// boundary; no product code changes.
//
// Rendered under the real NextIntlClientProvider + he.json so each asserted
// string is the shipped copy, not a hand-copied map.

const PRODUCTS = [
  { id: "p1", name: "לחם מחמצת" },
  { id: "p2", name: "חמאה תוצרת בית" },
];

const apiMock = vi.hoisted(() => {
  const state = { products: [], productsError: null, postError: null, patchError: null };
  return {
    state,
    get: vi.fn(() =>
      state.productsError
        ? Promise.reject(state.productsError)
        : Promise.resolve({ data: state.products }),
    ),
    post: vi.fn((url) => {
      if (state.postError) return Promise.reject(state.postError);
      if (url === "/upload/image") return Promise.resolve({ data: { url: "https://img.test/r.jpg" } });
      return Promise.resolve({ data: { id: "r-new", title: "saved" } });
    }),
    patch: vi.fn(() =>
      state.patchError
        ? Promise.reject(state.patchError)
        : Promise.resolve({ data: { id: "r1", title: "updated" } }),
    ),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

// The notice owns its own resend flow (use-resend-verification); here only
// its presence is the assertion target.
vi.mock("@/components/UnverifiedEmailNotice", () => ({
  default: () => <div data-testid="unverified-notice" />,
}));

const F = he.recipes.form;

const titleInput = () => screen.getByLabelText(/^שם המתכון/);
const ingredientsInput = () => screen.getByLabelText(/^רכיבים/);
const instructionsInput = () => screen.getByLabelText(/^הוראות הכנה/);
const descriptionInput = () => screen.getByLabelText(F.description_label);
const prepInput = () => screen.getByLabelText(F.prep_time_label);
const cookInput = () => screen.getByLabelText(F.cook_time_label);
const servingsInput = () => screen.getByLabelText(F.servings_label);
const submitButton = () => screen.getByRole("button", { name: F.submit });
const formEl = () => submitButton().closest("form");

const type = (el, value) => fireEvent.change(el, { target: { value } });

function fillRequired() {
  type(titleInput(), "לחם מחמצת");
  type(ingredientsInput(), "500 גרם קמח, 10 גרם מלח");
  type(instructionsInput(), "ערבבי את הקמח עם המלח ואפי.");
}

async function renderForm(props = {}) {
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <RecipeForm {...props} />
    </NextIntlClientProvider>,
  );
  // The products fetch resolves on mount; gate on it so no assertion below is
  // taken while the picker is still in its loading frame.
  await waitFor(() => expect(screen.queryByText(F.products_loading)).not.toBeInTheDocument());
  return utils;
}

function resetMocks() {
  apiMock.state.products = [];
  apiMock.state.productsError = null;
  apiMock.state.postError = null;
  apiMock.state.patchError = null;
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  apiMock.patch.mockClear();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
}

describe("RecipeForm — native constraint matrix, red → green (MEH-2281)", () => {
  beforeEach(resetMocks);

  it("declares the constraints the backend schema expects: title 3–200 required, ingredients/instructions ≥10 required, times 0–1440, servings 1–100", async () => {
    await renderForm();
    expect(titleInput()).toBeRequired();
    expect(titleInput()).toHaveAttribute("minlength", "3");
    expect(titleInput()).toHaveAttribute("maxlength", "200");
    expect(ingredientsInput()).toBeRequired();
    expect(ingredientsInput()).toHaveAttribute("minlength", "10");
    expect(instructionsInput()).toBeRequired();
    expect(instructionsInput()).toHaveAttribute("minlength", "10");
    expect(descriptionInput()).not.toBeRequired();
    for (const el of [prepInput(), cookInput()]) {
      expect(el).toHaveAttribute("type", "number");
      expect(el).toHaveAttribute("min", "0");
      expect(el).toHaveAttribute("max", "1440");
    }
    expect(servingsInput()).toHaveAttribute("min", "1");
    expect(servingsInput()).toHaveAttribute("max", "100");
  });

  it("an empty form is invalid on every required field; filling each one flips exactly that field, and the form is valid only once all three are filled", async () => {
    await renderForm();
    expect(formEl().checkValidity()).toBe(false);
    expect(titleInput().validity.valueMissing).toBe(true);
    expect(ingredientsInput().validity.valueMissing).toBe(true);
    expect(instructionsInput().validity.valueMissing).toBe(true);

    type(titleInput(), "לחם מחמצת");
    expect(titleInput().validity.valueMissing).toBe(false);
    expect(ingredientsInput().validity.valueMissing).toBe(true);
    expect(formEl().checkValidity()).toBe(false);

    type(ingredientsInput(), "500 גרם קמח, 10 גרם מלח");
    expect(formEl().checkValidity()).toBe(false);

    type(instructionsInput(), "ערבבי את הקמח עם המלח ואפי.");
    expect(formEl().checkValidity()).toBe(true);
  });

  it("a number outside its range is rangeOverflow / rangeUnderflow and reds the form", async () => {
    await renderForm();
    fillRequired();
    expect(formEl().checkValidity()).toBe(true);
    type(prepInput(), "1441");
    expect(prepInput().validity.rangeOverflow).toBe(true);
    expect(formEl().checkValidity()).toBe(false);
    type(prepInput(), "30");
    expect(formEl().checkValidity()).toBe(true);
    type(servingsInput(), "0");
    expect(servingsInput().validity.rangeUnderflow).toBe(true);
    expect(formEl().checkValidity()).toBe(false);
    type(servingsInput(), "4");
    expect(formEl().checkValidity()).toBe(true);
  });
});

describe("RecipeForm — payload normalisation on submit", () => {
  beforeEach(resetMocks);

  it("create: trims text, nulls the empty description / image / numbers, truncates numeric strings, POSTs /producers/me/recipes, toasts and calls onSaved", async () => {
    const onSaved = vi.fn();
    await renderForm({ onSaved });
    type(titleInput(), "  לחם מחמצת  ");
    type(ingredientsInput(), " 500 גרם קמח, 10 גרם מלח ");
    type(instructionsInput(), " ערבבי את הקמח עם המלח ואפי. ");
    type(prepInput(), "12.7");
    type(servingsInput(), "4");
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith("/producers/me/recipes", {
      title: "לחם מחמצת",
      description: null,
      ingredients: "500 גרם קמח, 10 גרם מלח",
      instructions: "ערבבי את הקמח עם המלח ואפי.",
      prep_time_min: 12,
      cook_time_min: null,
      servings: 4,
      image_url: null,
      product_ids: [],
    });
    expect(apiMock.patch).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "r-new", title: "saved" }));
    expect(toastMock.success.mock.calls[0][0]).toBe(F.toast_created);
    expect(toastMock.success.mock.calls[0][1]).toHaveProperty("icon");
  });

  it("a non-numeric time becomes null rather than NaN", async () => {
    await renderForm();
    fillRequired();
    // jsdom's number-input sanitiser turns "abc" into "" (a browser does the
    // same); either way toInt() must yield null here, never NaN.
    type(cookInput(), "abc");
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post.mock.calls[0][1].cook_time_min).toBeNull();
  });

  it("related products: loading → list → toggling a checkbox adds and removes its id from product_ids", async () => {
    apiMock.state.products = PRODUCTS;
    await renderForm();
    expect(apiMock.get).toHaveBeenCalledWith("/producers/me/products");
    const first = screen.getByLabelText("לחם מחמצת");
    const second = screen.getByLabelText("חמאה תוצרת בית");
    fireEvent.click(first);
    fireEvent.click(second);
    fireEvent.click(first);
    expect(first).not.toBeChecked();
    expect(second).toBeChecked();
    fillRequired();
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post.mock.calls[0][1].product_ids).toEqual(["p2"]);
  });

  it("no products → the no-products copy; a products fetch failure degrades to the same empty state", async () => {
    const { unmount } = await renderForm();
    expect(screen.getByText(F.no_products)).toBeInTheDocument();
    unmount();
    apiMock.state.productsError = new Error("boom");
    await renderForm();
    expect(screen.getByText(F.no_products)).toBeInTheDocument();
  });
});

describe("RecipeForm — server rejection branches (exact copy)", () => {
  beforeEach(resetMocks);

  async function submitValid() {
    fillRequired();
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
  }

  it("recipe_rejected WITH a reason → the reason inline as role=alert; no toast; submit re-enabled", async () => {
    apiMock.state.postError = {
      response: { status: 400, data: { detail: { error: "recipe_rejected", reason: "התוכן לא קשור לאוכל" } } },
    };
    await renderForm();
    await submitValid();
    expect(await screen.findByRole("alert")).toHaveTextContent("התוכן לא קשור לאוכל");
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("recipe_rejected WITHOUT a reason → the rejected_default copy", async () => {
    apiMock.state.postError = { response: { status: 400, data: { detail: { error: "recipe_rejected" } } } };
    await renderForm();
    await submitValid();
    expect(await screen.findByRole("alert")).toHaveTextContent(F.errors.rejected_default);
  });

  it("a string detail → shown verbatim", async () => {
    apiMock.state.postError = { response: { status: 422, data: { detail: "שם המתכון קצר מדי" } } };
    await renderForm();
    await submitValid();
    expect(await screen.findByRole("alert")).toHaveTextContent("שם המתכון קצר מדי");
  });

  it("an unrecognised failure → error.generic", async () => {
    apiMock.state.postError = new Error("network");
    await renderForm();
    await submitValid();
    expect(await screen.findByRole("alert")).toHaveTextContent(he.error.generic);
  });

  it("a 403 email_unverified → the resend notice instead of an error line, and nothing is saved", async () => {
    const onSaved = vi.fn();
    apiMock.state.postError = { response: { status: 403, data: { detail: { code: "email_unverified" } } } };
    await renderForm({ onSaved });
    await submitValid();
    expect(await screen.findByTestId("unverified-notice")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("a later successful submit clears a previous inline error", async () => {
    apiMock.state.postError = { response: { status: 422, data: { detail: "שגיאה זמנית" } } };
    await renderForm();
    await submitValid();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    apiMock.state.postError = null;
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

describe("RecipeForm — submit disabled / enabled matrix", () => {
  beforeEach(resetMocks);

  it("idle → enabled; in flight → disabled with the saving label; settled → enabled again", async () => {
    let release;
    apiMock.post.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ data: { id: "r-new" } }); }),
    );
    await renderForm();
    expect(submitButton()).toBeEnabled();
    fillRequired();
    fireEvent.submit(formEl());
    const saving = await screen.findByRole("button", { name: F.submit_saving });
    expect(saving).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole("button", { name: F.submit })).toBeEnabled());
  });

  it("while an image uploads, submit is disabled; after upload the preview + remove button replace the picker and the url rides the payload", async () => {
    let release;
    apiMock.post.mockImplementationOnce(
      () => new Promise((resolve) => { release = () => resolve({ data: { url: "https://img.test/r.jpg" } }); }),
    );
    await renderForm();
    const fileInput = screen.getByLabelText(F.image_upload);
    const file = new File(["x"], "r.jpg", { type: "image/jpeg" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(await screen.findByText(F.image_uploading)).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(apiMock.post.mock.calls[0][0]).toBe("/upload/image");
    expect(apiMock.post.mock.calls[0][1]).toBeInstanceOf(FormData);
    release();
    expect(await screen.findByRole("img", { name: F.image_label })).toHaveAttribute("src", "https://img.test/r.jpg");
    expect(submitButton()).toBeEnabled();

    fillRequired();
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(2));
    expect(apiMock.post.mock.calls[1][1].image_url).toBe("https://img.test/r.jpg");

    fireEvent.click(screen.getByRole("button", { name: F.image_remove }));
    expect(screen.queryByRole("img", { name: F.image_label })).toBeNull();
    expect(screen.getByText(F.image_upload)).toBeInTheDocument();
  });

  it("an upload failure toasts the backend detail and restores the picker", async () => {
    apiMock.post.mockImplementationOnce(() =>
      Promise.reject({ response: { data: { detail: "קובץ גדול מדי" } } }),
    );
    await renderForm();
    const file = new File(["x"], "r.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(F.image_upload), { target: { files: [file] } });
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("קובץ גדול מדי"));
    expect(screen.getByText(F.image_upload)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: F.image_label })).toBeNull();
  });

  it("the cancel button renders only when onCancel is passed, and calls it", async () => {
    const { unmount } = await renderForm();
    expect(screen.queryByRole("button", { name: F.cancel })).toBeNull();
    unmount();
    const onCancel = vi.fn();
    await renderForm({ onCancel });
    fireEvent.click(screen.getByRole("button", { name: F.cancel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("RecipeForm — edit mode", () => {
  beforeEach(resetMocks);

  const INITIAL = {
    id: "r1",
    title: "ריבת תאנים",
    description: "ריבה עונתית",
    ingredients: "תאנים, סוכר, לימון",
    instructions: "לבשל על אש נמוכה שעה.",
    prep_time_min: 15,
    cook_time_min: 60,
    servings: 6,
    image_url: "https://img.test/figs.jpg",
    product_ids: ["p2"],
  };

  it("prefills every field from `initial`, shows the edit heading, and PATCHes /producers/me/recipes/{id} with the updated toast (no icon)", async () => {
    apiMock.state.products = PRODUCTS;
    const onSaved = vi.fn();
    await renderForm({ mode: "edit", initial: INITIAL, onSaved });
    expect(screen.getByRole("heading", { name: F.heading_edit })).toBeInTheDocument();
    expect(titleInput()).toHaveValue("ריבת תאנים");
    expect(descriptionInput()).toHaveValue("ריבה עונתית");
    expect(ingredientsInput()).toHaveValue("תאנים, סוכר, לימון");
    expect(instructionsInput()).toHaveValue("לבשל על אש נמוכה שעה.");
    expect(prepInput()).toHaveValue(15);
    expect(cookInput()).toHaveValue(60);
    expect(servingsInput()).toHaveValue(6);
    expect(screen.getByRole("img", { name: F.image_label })).toHaveAttribute("src", "https://img.test/figs.jpg");
    expect(screen.getByLabelText("חמאה תוצרת בית")).toBeChecked();
    expect(screen.getByLabelText("לחם מחמצת")).not.toBeChecked();

    type(titleInput(), "ריבת תאנים משופרת");
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.patch).toHaveBeenCalledTimes(1));
    expect(apiMock.patch).toHaveBeenCalledWith("/producers/me/recipes/r1", {
      title: "ריבת תאנים משופרת",
      description: "ריבה עונתית",
      ingredients: "תאנים, סוכר, לימון",
      instructions: "לבשל על אש נמוכה שעה.",
      prep_time_min: 15,
      cook_time_min: 60,
      servings: 6,
      image_url: "https://img.test/figs.jpg",
      product_ids: ["p2"],
    });
    expect(apiMock.post).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: "r1", title: "updated" }));
    expect(toastMock.success).toHaveBeenCalledWith(F.toast_updated, undefined);
  });

  it("create mode shows the create heading", async () => {
    await renderForm();
    expect(screen.getByRole("heading", { name: F.heading_create })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: F.heading_edit })).toBeNull();
  });

  it("edit mode without an `initial.id` falls back to POST (the guard at the routing line)", async () => {
    await renderForm({ mode: "edit", initial: { title: "בלי מזהה" } });
    type(ingredientsInput(), "תאנים, סוכר, לימון");
    type(instructionsInput(), "לבשל על אש נמוכה שעה.");
    fireEvent.submit(formEl());
    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.patch).not.toHaveBeenCalled();
  });
});
