/**
 * Edit-tab chunk C — LocationCard isolation tests.
 *
 * Renders the CARD directly under the real NextIntlClientProvider + he.json
 * (see EditTabCategoriesCard.test.jsx for why isolation, not the full page).
 * AddressSearch is mocked as a button that fires onSelect with fixed coords
 * (no Nominatim network). Covers dirty-guard, geocode→save, and the
 * has_physical_location gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { LocationCard } from "@/app/[locale]/producer/dashboard/edit/page";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), put: vi.fn(), post: vi.fn() },
}));
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

const L = he.dashboard.producer.location;

// Mirrors the page's mount gate exactly:
//   {profile.has_physical_location !== false && <LocationCard .../>}
// (edit/page.js). Kept in the test so the gate contract is covered without
// mounting the whole page (which hangs the runner).
function Gated({ profile, onSave }) {
  return profile.has_physical_location !== false ? (
    <LocationCard profile={profile} onSave={onSave} />
  ) : null;
}

function renderGated(overrides) {
  const onSave = vi.fn();
  const profile = { lat: null, lng: null, city: "", ...overrides };
  const utils = render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <Gated profile={profile} onSave={onSave} />
    </NextIntlClientProvider>,
  );
  return { onSave, ...utils };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.put.mockResolvedValue({ data: {} });
});

describe("Edit-tab LocationCard (isolation)", () => {
  it("is hidden for delivery-only producers (has_physical_location === false)", () => {
    renderGated({ has_physical_location: false });
    expect(screen.queryByRole("button", { name: L.save_cta })).toBeNull();
    expect(screen.queryByText("pick-address")).toBeNull();
  });

  it("renders for physical-location producers with Save disabled until a pick", () => {
    renderGated({ has_physical_location: true });
    expect(screen.getByRole("button", { name: L.save_cta })).toBeDisabled();
  });

  it("captures geocoded coords on select and saves lat/lng/city", async () => {
    const { onSave } = renderGated({ has_physical_location: true });
    const save = screen.getByRole("button", { name: L.save_cta });
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
    expect(onSave).toHaveBeenCalledWith({ lat: 32.1, lng: 34.8, city: "תל אביב" });
  });
});
