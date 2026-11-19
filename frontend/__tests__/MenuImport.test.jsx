/**
 * MEH-3430 — «העלו תפריט». The matrix (5-state rule): products 0 / 2 / 3 →
 * strip, strip, button; review open with 1 row and with many; a row without a
 * price; the cap; a failed read; publish → the list reloads. Rendered with the
 * real he.json so the approved strings are read, not keys.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import MenuImport from "@/components/MenuImport";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn() } }));
// jsdom has no canvas: the helper returns the file untouched, as on a browser
// that cannot decode it.
vi.mock("@/lib/menu-image", () => ({ shrinkMenuImage: async (f) => f }));

const M = he.settings.products.menu_import;
// Prices arrive as strings: the API serialises Decimal ("32.00").
const row = (name, price = "30.00", extra = {}) => ({ name, description: null, section: null, price_min: price,
  price_max: null, price_unit: "unit", uncertain: [], ...extra });

const P = he.settings.products;

function mount(productCount = 0, hidden = false) {
  const onPublished = vi.fn();
  const ui = (h) => (
    <NextIntlClientProvider locale="he" messages={he}>
      <MenuImport productCount={productCount} onPublished={onPublished} hidden={h} />
    </NextIntlClientProvider>
  );
  const { rerender } = render(ui(hidden));
  onPublished.setHidden = (h) => rerender(ui(h));
  return onPublished;
}

async function upload(rows) {
  api.post.mockResolvedValueOnce({ data: { rows } });
  const file = new File(["x"], "menu.jpg", { type: "image/jpeg" });
  fireEvent.change(screen.getByTestId("menu-file-input"), { target: { files: [file] } });
  if (rows.length) await screen.findByTestId("menu-review");
}

beforeEach(() => vi.clearAllMocks());

describe("MenuImport — where it shows (MEH-3430)", () => {
  it("0 products: the strip with its title, explanation and button", () => {
    mount(0);
    const strip = screen.getByTestId("menu-strip");
    expect(strip).toHaveTextContent(M.strip_title);
    expect(strip).toHaveTextContent(M.strip_body);
    expect(within(strip).getByRole("button", { name: M.button })).toBeInTheDocument();
  });

  it("2 products: still the strip", () => {
    mount(2);
    expect(screen.getByTestId("menu-strip")).toBeInTheDocument();
  });

  it("3 products: one button, no explanation", () => {
    mount(3);
    expect(screen.queryByTestId("menu-strip")).toBeNull();
    expect(screen.getByTestId("menu-button")).toHaveTextContent(M.button);
    expect(screen.queryByText(M.strip_body)).toBeNull();
  });
});

describe("MenuImport — review", () => {
  it("1 row found: the count line, one editable row, publish names the count", async () => {
    mount(0);
    await upload([row("לחם מחמצת", "32.00")]);
    expect(screen.getByText(M.found.replace("{count}", "1"))).toBeInTheDocument();
    expect(screen.getAllByTestId("menu-row")).toHaveLength(1);
    expect(screen.getByDisplayValue("לחם מחמצת")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: M.publish.replace("{count}", "1") })).toBeEnabled();
  });

  it("many rows: each is a row, a removed one leaves the count", async () => {
    mount(0);
    await upload([row("א"), row("ב"), row("ג")]);
    expect(screen.getAllByTestId("menu-row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "מחקו ב" }));
    expect(screen.getAllByTestId("menu-row")).toHaveLength(2);
    expect(screen.getByRole("button", { name: M.publish.replace("{count}", "2") })).toBeInTheDocument();
  });

  it("a row the model was unsure of says «כדאי לבדוק»", async () => {
    mount(0);
    await upload([row("קציצות", "40.00", { uncertain: ["name"] })]);
    expect(within(screen.getByTestId("menu-row")).getByText(M.check)).toBeInTheDocument();
  });

  it("no price: the row says so and publish waits until one is typed", async () => {
    mount(0);
    await upload([row("תות שדה", null, { uncertain: ["price"] })]);
    expect(screen.getByTestId("menu-row-no-price")).toHaveTextContent(M.no_price);
    const publish = screen.getByRole("button", { name: M.publish.replace("{count}", "1") });
    expect(publish).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/מחיר מ-/, { selector: "input" }), { target: { value: "25" } });
    expect(publish).toBeEnabled();
    expect(screen.queryByTestId("menu-row-no-price")).toBeNull();
  });

  it("over 100 with what she has: the cap line, publish off until rows are removed", async () => {
    mount(99);
    await upload([row("א"), row("ב")]);
    expect(screen.getByTestId("menu-cap")).toHaveTextContent(M.cap);
    expect(screen.getByRole("button", { name: M.publish.replace("{count}", "2") })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "מחקו ב" }));
    expect(screen.queryByTestId("menu-cap")).toBeNull();
  });

  it("publish sends the edited rows and reloads the list", async () => {
    const onPublished = mount(0);
    await upload([row("פטה", "18.00", { price_unit: "100g" })]);
    api.post.mockResolvedValueOnce({ data: { created: 1, skipped_duplicates: [] } });
    fireEvent.click(screen.getByRole("button", { name: M.publish.replace("{count}", "1") }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    expect(api.post).toHaveBeenLastCalledWith("/producers/me/menu-import/publish", {
      products: [{ name: "פטה", description: null, price_min: 18, price_max: null, price_unit: "100g" }],
    });
    expect(screen.queryByTestId("menu-review")).toBeNull();
  });

  it("cancel closes the review and saves nothing", async () => {
    mount(0);
    await upload([row("א")]);
    fireEvent.click(screen.getByRole("button", { name: he.settings.products.cancel_edit_cta }));
    expect(screen.queryByTestId("menu-review")).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1); // the read only
  });
});

describe("MenuImport — a read that fails", () => {
  it("503 (no AI, or the model failed): the approved fallback line", async () => {
    mount(0);
    api.post.mockRejectedValueOnce({ response: { status: 503, data: { detail: "x" } } });
    fireEvent.change(screen.getByTestId("menu-file-input"), {
      target: { files: [new File(["x"], "m.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText(M.failed)).toBeInTheDocument();
  });

  it("nothing found: the same fallback, no empty review", async () => {
    mount(0);
    await upload([]);
    expect(await screen.findByText(M.failed)).toBeInTheDocument();
    expect(screen.queryByTestId("menu-review")).toBeNull();
  });

  it("an answer of an unknown shape: the fallback, not a crash", async () => {
    mount(0);
    api.post.mockResolvedValueOnce({ data: { rows: [{ price_min: 5 }] } });
    fireEvent.change(screen.getByTestId("menu-file-input"), {
      target: { files: [new File(["x"], "m.jpg", { type: "image/jpeg" })] },
    });
    expect(await screen.findByText(M.failed)).toBeInTheDocument();
  });

  it("a wrong file type: the server's own Hebrew line", async () => {
    mount(3);
    const detail = "אפשר להעלות תמונות JPG/PNG/WebP או קובץ PDF";
    api.post.mockRejectedValueOnce({ response: { status: 415, data: { detail } } });
    fireEvent.change(screen.getByTestId("menu-file-input"), {
      target: { files: [new File(["x"], "m.heic", { type: "image/heic" })] },
    });
    expect(await screen.findByText(detail)).toBeInTheDocument();
  });
});

describe("MenuImport — review findings (18/11)", () => {
  it("while the read runs: the button says «קוראים את התפריט…» and is off", async () => {
    mount(0);
    let finish;
    api.post.mockReturnValueOnce(new Promise((r) => { finish = r; }));
    fireEvent.change(screen.getByTestId("menu-file-input"), {
      target: { files: [new File(["x"], "m.jpg", { type: "image/jpeg" })] },
    });
    const busy = await screen.findByRole("button", { name: new RegExp(M.reading) });
    expect(busy).toBeDisabled();
    finish({ data: { rows: [row("א")] } });
    await screen.findByTestId("menu-review");
  });

  it("a failed publish keeps the rows and says the save failed, not the read", async () => {
    mount(0);
    await upload([row("א")]);
    api.post.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    fireEvent.click(screen.getByRole("button", { name: M.publish.replace("{count}", "1") }));
    expect(await screen.findByText(P.errors.save_failed)).toBeInTheDocument();
    expect(screen.queryByText(M.failed)).toBeNull();
    expect(screen.getAllByTestId("menu-row")).toHaveLength(1);
  });

  it("the cap 409 on publish shows the server's line", async () => {
    mount(0);
    await upload([row("א")]);
    const detail = "אפשר להוסיף עד 100 מוצרים.";
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { detail } } });
    fireEvent.click(screen.getByRole("button", { name: M.publish.replace("{count}", "1") }));
    expect(await screen.findByText(detail)).toBeInTheDocument();
  });

  it("a price under 1 or a range that goes down blocks publish with the form's own line", async () => {
    mount(0);
    await upload([row("א", "0.50"), row("ב", "40.00", { price_max: "20.00" })]);
    const problems = screen.getAllByTestId("menu-row-problem").map((p) => p.textContent);
    expect(problems).toEqual([P.errors.price_min_too_low, P.errors.price_max_below_min]);
    expect(screen.getByRole("button", { name: M.publish.replace("{count}", "2") })).toBeDisabled();
  });

  it("a unit the model was unsure of is flagged", async () => {
    mount(0);
    await upload([row("גבינה", "80.00", { price_unit: "kg", uncertain: ["unit"] })]);
    expect(within(screen.getByTestId("menu-row")).getByText(M.check)).toBeInTheDocument();
  });

  it("a product form open: the strip steps aside, a review in progress stays", async () => {
    const ctl = mount(0, true);
    expect(screen.queryByTestId("menu-strip")).toBeNull();
    ctl.setHidden(false);
    await upload([row("א")]);
    ctl.setHidden(true);
    expect(screen.getByTestId("menu-review")).toBeInTheDocument();
  });
});
