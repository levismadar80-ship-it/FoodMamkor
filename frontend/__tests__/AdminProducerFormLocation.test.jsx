/**
 * Admin ProducerForm — AddressSearch location wiring (MEH-1242 PR 2).
 *
 * The admin form's raw lat/lng number inputs were replaced by the same
 * AddressSearch (Nominatim) combobox the owner edit-tab LocationCard uses.
 * This asserts that picking a result populates form state: lat, lng and city.
 *
 * fetch (Nominatim) is mocked; the manual lat/lng inputs live inside a
 * collapsed <details> but remain in the DOM, so getByLabelText still finds
 * them and we can read the values the selection wrote.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const NOMINATIM = [
  {
    place_id: 42,
    display_name: "הזית 5, חיפה, ישראל",
    lat: "32.7940",
    lon: "34.9896",
    address: { road: "הזית", house_number: "5", city: "חיפה" },
  },
];

const F = he.admin.producers.form.fields;
const SEARCH_PLACEHOLDER = he.search.address_search.placeholder;

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] }); // GET /categories
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => NOMINATIM });
});

describe("Admin ProducerForm — AddressSearch (PR2)", () => {
  it("selecting an address populates lat/lng + city in form state", async () => {
    renderForm();

    const search = await screen.findByPlaceholderText(SEARCH_PLACEHOLDER);
    fireEvent.change(search, { target: { value: "הזית" } });

    // Debounced Nominatim lookup → dropdown option (street = road + number).
    const option = await screen.findByText("הזית 5", {}, { timeout: 2000 });
    fireEvent.mouseDown(option);

    const cityInput = screen.getByLabelText(F.city);
    await waitFor(() => expect(cityInput.value).toBe("חיפה"));

    // Raw coords (inside the collapsed "manual edit" disclosure) reflect the pick.
    expect(screen.getByLabelText(F.lat).value).toBe("32.794");
    expect(screen.getByLabelText(F.lng).value).toBe("34.9896");
  });
});
