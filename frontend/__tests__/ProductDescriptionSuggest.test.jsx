/**
 * MEH-3479 — «הצעת תיאור»: closed / loading / preview (edit, use, cancel) /
 * failed (503) / limit (429) / no name. Nothing reaches the form until
 * «שימוש בהצעה»; the component never saves a product.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductDescriptionSuggest from "@/components/ProductDescriptionSuggest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const D = he.settings.products.describe;

function mount(input = { name: "לחם מחמצת", description: "", price_min: "32", price_unit: "unit" }, basePath) {
  const onUse = vi.fn();
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductDescriptionSuggest idPrefix="t" input={input} onUse={onUse} basePath={basePath} />
    </NextIntlClientProvider>,
  );
  return onUse;
}
const press = () => fireEvent.click(screen.getByRole("button", { name: D.cta }));

beforeEach(() => vi.clearAllMocks());

describe("ProductDescriptionSuggest (MEH-3479)", () => {
  it("closed: the button and the hint, no request", () => {
    mount();
    expect(screen.getByRole("button", { name: D.cta })).toBeInTheDocument();
    expect(screen.getByText(D.hint)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("loading, then an editable preview; «שימוש בהצעה» hands the EDITED text to the form, once", async () => {
    const onUse = mount();
    let answer;
    api.post.mockReturnValueOnce(new Promise((r) => (answer = r)));
    press();
    expect(await screen.findByText(D.loading)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/producers/me/product-description/suggest", {
      name: "לחם מחמצת",
      price_min: "32",
      price_unit: "unit",
    });
    answer({ data: { description: "לחם בהתפחה ארוכה." } });
    const box = await screen.findByLabelText(D.preview_label);
    expect(box).toHaveValue("לחם בהתפחה ארוכה.");
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: "לחם בהתפחה של יומיים." } });
    fireEvent.click(screen.getByRole("button", { name: D.use }));
    expect(onUse).toHaveBeenCalledTimes(1);
    expect(onUse).toHaveBeenCalledWith("לחם בהתפחה של יומיים.");
    expect(screen.queryByTestId("description-suggestion")).toBeNull();
  });

  it("«ביטול» closes the preview and the form gets nothing", async () => {
    const onUse = mount();
    api.post.mockResolvedValueOnce({ data: { description: "x" } });
    press();
    await screen.findByTestId("description-suggestion");
    fireEvent.click(screen.getByRole("button", { name: D.cancel }));
    expect(screen.queryByTestId("description-suggestion")).toBeNull();
    expect(onUse).not.toHaveBeenCalled();
  });

  it("a 503 shows the fallback line; a 429 the daily-limit line", async () => {
    mount();
    api.post.mockRejectedValueOnce({ response: { status: 503 } });
    press();
    expect(await screen.findByText(D.failed)).toBeInTheDocument();
    api.post.mockRejectedValueOnce({ response: { status: 429 } });
    press();
    expect(await screen.findByText(D.limit)).toBeInTheDocument();
  });

  it("no name yet: asks for one and sends nothing", () => {
    mount({ name: "  ", description: "" });
    press();
    expect(screen.getByText(D.no_name)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("admin: posts under basePath and sends the current description to improve", async () => {
    mount({ name: "עוגה", description: "עוגת שמרים" }, "/admin/producers/b1");
    api.post.mockResolvedValueOnce({ data: { description: "y" } });
    press();
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/producers/b1/product-description/suggest", {
        name: "עוגה",
        description: "עוגת שמרים",
      }),
    );
  });
});
