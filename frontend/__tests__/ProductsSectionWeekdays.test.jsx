// MEH-3618 — the days field inside the product form: an add with no day is
// refused before anything is sent, a picked day rides the POST, and an edit
// opens on the stored days and sends them back on save.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProductsSection from "@/components/ProductsSection";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const P = he.settings.products;
const NONE = he.product_weekdays.none_picked;
const FRI = 5;
const FRIDAY_ONLY = 1 << FRI;

function renderSection(products) {
  api.get.mockResolvedValue({ data: products });
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProductsSection />
    </NextIntlClientProvider>,
  );
}

async function openAddForm() {
  renderSection([]);
  fireEvent.click(await screen.findByText(P.empty.cta));
  fireEvent.change(document.getElementById("new-product-name"), { target: { value: "חלה" } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProductsSection — days the product is made (MEH-3618)", () => {
  it("an add with no day picked is refused and nothing is sent", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`));
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`)); // back to no day
    fireEvent.click(screen.getByText(P.add_submit_cta));
    // Once, beside the chips — not repeated in the form's banner.
    expect(screen.getAllByText(NONE).length).toBe(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it("an add with Friday sends the Friday mask", async () => {
    api.post.mockResolvedValue({ data: { id: "p1", name: "חלה", available_weekdays: FRIDAY_ONLY } });
    await openAddForm();
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`));
    fireEvent.click(screen.getByText(P.add_submit_cta));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/producers/me/products");
    expect(body.available_weekdays).toBe(FRIDAY_ONLY);
  });

  it("an add left on «כל הימים» sends null", async () => {
    api.post.mockResolvedValue({ data: { id: "p1", name: "חלה", available_weekdays: null } });
    await openAddForm();
    fireEvent.click(screen.getByText(P.add_submit_cta));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].available_weekdays).toBeNull();
  });

  it("an edit opens on the stored days and saves them back", async () => {
    api.put.mockResolvedValue({ data: { id: 7, name: "חלה", available_weekdays: FRIDAY_ONLY } });
    renderSection([{ id: 7, name: "חלה", price_min: 28, price_max: null, image_url: null, available_weekdays: FRIDAY_ONLY }]);
    fireEvent.click(await screen.findByRole("button", { name: P.card.edit_aria_template.replace("{name}", "חלה") }));
    expect(screen.getByTestId(`product-weekday-${FRI}`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("product-weekdays-every").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByText(P.save_edit_cta));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const [url, body] = api.put.mock.calls[0];
    expect(url).toBe("/producers/me/products/7");
    expect(body.available_weekdays).toBe(FRIDAY_ONLY);
  });

  it("an edit unticked down to no day is refused and nothing is sent", async () => {
    renderSection([{ id: 7, name: "חלה", price_min: 28, price_max: null, image_url: null, available_weekdays: FRIDAY_ONLY }]);
    fireEvent.click(await screen.findByRole("button", { name: P.card.edit_aria_template.replace("{name}", "חלה") }));
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`));
    fireEvent.click(screen.getByText(P.save_edit_cta));
    expect(screen.getAllByText(NONE).length).toBe(1);
    expect(api.put).not.toHaveBeenCalled();
  });
});
