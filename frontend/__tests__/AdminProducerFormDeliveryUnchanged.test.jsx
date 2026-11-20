/**
 * MEH-3475 — the admin edit page now has the owner's DeliveryCard beside
 * ProducerForm. An edit save that did not touch delivery must leave the whole
 * delivery group out, or it puts the page-open cities back over what the
 * delivery panel saved. A changed group travels whole.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ProducerForm from "@/components/admin/ProducerForm";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({}) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { role: "admin" }, loading: false }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ showToast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

const FORM = he.admin.producers.form;
const GROUP = ["has_physical_location", "offers_delivery", "delivery_nationwide", "delivery_area_cities", "delivery_excluded_cities"];
const INITIAL = {
  name: "סנדרה",
  city: "חיפה",
  phone: "0522518862",
  has_physical_location: true,
  offers_delivery: true,
  delivery_nationwide: false,
  delivery_areas: [{ city: "חיפה", delivery_day: "שלישי" }, { city: "עכו" }],
};
const save = () => fireEvent.submit(screen.getByRole("button", { name: FORM.submit_update }).closest("form"));
const putBody = () => api.put.mock.calls.find((c) => c[0] === "/admin/producers/p-9")[1];

function mount() {
  render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <ProducerForm producerId="p-9" initial={INITIAL} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  api.put.mockResolvedValue({ data: {} });
});

describe("Admin ProducerForm — delivery group only when changed (MEH-3475)", () => {
  it("an untouched save leaves every delivery field out", async () => {
    mount();
    await screen.findByText(FORM.sections.basic);
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    for (const k of GROUP) expect(putBody()).not.toHaveProperty(k);
    expect(putBody().name).toBe("סנדרה");
  });

  it("a changed delivery flag sends the whole group", async () => {
    mount();
    await screen.findByText(FORM.sections.basic);
    fireEvent.click(screen.getByRole("checkbox", { name: FORM.fields.has_physical_location }));
    save();
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(putBody().has_physical_location).toBe(false);
    expect(putBody().delivery_area_cities).toEqual(["חיפה", "עכו"]);
    expect(putBody().offers_delivery).toBe(true);
  });
});
