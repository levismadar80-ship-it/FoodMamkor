/**
 * Edit-tab chunk C — LocationCard component tests.
 *
 * Renders the whole ProducerDashboardEditPage. AddressSearch is mocked as a
 * button that fires onSelect with fixed coords (so no Nominatim network).
 * Covers the has_physical_location gate, the dirty-guard, and geocode→save.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ProducerDashboardEditPage from "@/app/[locale]/producer/dashboard/edit/page";
import api from "@/lib/api";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: 1, role: "producer" }, loading: false }),
}));
vi.mock("next-intl", () => {
  // Stable translator identity per namespace — mirrors next-intl (see
  // EditTabCategoriesCard.test.jsx for the hang this prevents).
  const cache = new Map();
  return {
    useLocale: () => "he",
    useTranslations: (ns) => {
      if (!cache.has(ns)) cache.set(ns, (key) => `${ns}.${key}`);
      return cache.get(ns);
    },
  };
});
vi.mock("@/components/AddressSearch", () => ({
  default: ({ onSelect }) => (
    <button
      type="button"
      onClick={() => onSelect({ lat: 32.1, lng: 34.8, city: "תל אביב" })}
    >
      pick-address
    </button>
  ),
}));

const BASE_PROFILE = {
  id: 1,
  categories: [],
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

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));

const LOC_SAVE = "dashboard.producer.location.save_cta";

function mountWith(overrides) {
  const profile = { ...BASE_PROFILE, ...overrides };
  api.get.mockImplementation((url) =>
    url === "/categories"
      ? Promise.resolve({ data: [] })
      : Promise.resolve({ data: profile }),
  );
  return render(<ProducerDashboardEditPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab LocationCard", () => {
  it("is hidden for delivery-only producers (has_physical_location === false)", async () => {
    mountWith({ has_physical_location: false });
    // Wait for the page to load via another card's save button.
    await screen.findByRole("button", {
      name: "dashboard.producer.contact_channels.save_cta",
    });
    expect(screen.queryByRole("button", { name: LOC_SAVE })).toBeNull();
    expect(screen.queryByText("pick-address")).toBeNull();
  });

  it("renders for physical-location producers with Save disabled until a pick", async () => {
    mountWith({ has_physical_location: true });
    const save = await screen.findByRole("button", { name: LOC_SAVE });
    expect(save).toBeDisabled();
  });

  it("captures geocoded coords on select and saves lat/lng/city", async () => {
    mountWith({ has_physical_location: true });
    const save = await screen.findByRole("button", { name: LOC_SAVE });
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByText("pick-address"));
    expect(save).not.toBeDisabled();

    fireEvent.click(save);
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith("/producers/me", {
        lat: 32.1,
        lng: 34.8,
        city: "תל אביב",
      }),
    );
  });
});
