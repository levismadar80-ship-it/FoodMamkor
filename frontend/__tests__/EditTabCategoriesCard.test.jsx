/**
 * Edit-tab chunk A — CategoriesCard component tests.
 *
 * Renders the whole ProducerDashboardEditPage (the cards are internal to it,
 * mirroring the GroupBuyCommit422 whole-component convention) and drives the
 * categories card. has_physical_location:false keeps the LocationCard (and its
 * AddressSearch) unmounted so these tests don't touch the geocode path.
 *
 * useTranslations is mocked to return `${namespace}.${key}` so each card's
 * strings are distinguishable (a plain key-identity mock collides across the
 * six cards that all use "save_cta"/"heading").
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerDashboardEditPage from "@/app/[locale]/producer/dashboard/edit/page";
import api from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key) => `${ns}.${key}`,
}));

const PROFILE = {
  id: 1,
  has_physical_location: false,
  categories: [{ id: 1, name: "ירקות" }],
  images: [],
  custom_questions: [],
  instagram: "",
  phone: "",
  website: "",
  contact_email: "",
  facebook: "",
  external_order_form: "",
  primary_contact_method: "whatsapp",
  lat: null,
  lng: null,
  city: "",
};
const CATS = [
  { id: 1, name: "ירקות" },
  { id: 2, name: "פירות" },
];
const VALIDATION_422 = {
  response: { status: 422, data: { detail: [{ msg: "צריך מספר רישיון" }] } },
};

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const CAT_SAVE = "dashboard.producer.categories.save_cta";

function defaultGet(url) {
  if (url === "/categories") return Promise.resolve({ data: CATS });
  return Promise.resolve({ data: PROFILE });
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(defaultGet);
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab CategoriesCard", () => {
  it("toggles a category and saves the new category_ids set", async () => {
    render(<ProducerDashboardEditPage />);
    // Seeded category loaded from GET /categories.
    await screen.findByRole("checkbox", { name: "ירקות" });
    fireEvent.click(screen.getByRole("checkbox", { name: "פירות" }));
    fireEvent.click(screen.getByRole("button", { name: CAT_SAVE }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", { category_ids: [1, 2] }),
    );
  });

  it("surfaces the backend Hebrew 422 detail inline (not generic)", async () => {
    api.put.mockRejectedValueOnce(VALIDATION_422);
    render(<ProducerDashboardEditPage />);
    await screen.findByRole("checkbox", { name: "פירות" });
    fireEvent.click(screen.getByRole("checkbox", { name: "פירות" }));
    fireEvent.click(screen.getByRole("button", { name: CAT_SAVE }));
    const alert = await screen.findByRole("alert");
    // detailToMessage collapses the 422 array to its msg string.
    expect(alert.textContent).toContain("צריך מספר רישיון");
    expect(alert.textContent).not.toContain("[object Object]");
  });

  it("shows an inline fetch-error when GET /categories fails", async () => {
    api.get.mockImplementation((url) =>
      url === "/categories"
        ? Promise.reject(new Error("network"))
        : Promise.resolve({ data: PROFILE }),
    );
    render(<ProducerDashboardEditPage />);
    // No detail on a network error → falls back to the fetch_error key.
    const alert = await screen.findByText(
      "dashboard.producer.categories.fetch_error",
    );
    expect(alert).toBeInTheDocument();
  });
});
