import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocationsEditor from "@/app/[locale]/producer/dashboard/edit/LocationsEditor";

// MEH-1421 (MEH-1388 chunk 4a): owner location CRUD editor. Verifies the
// Rule-19 safeParse gate (an out-of-bounds coord toasts + never POSTs) and the
// happy-path create.
// MEH-1936: the city/address fields became CitySearch + AddressSearch, so the
// form now legitimately fetches GET /cities as well. Two consequences the
// fixtures below absorb — see the api mock note.

const LOCATIONS_URL = "/producers/me/locations";

// MEH-1936 — the api mock is URL-AWARE, and that is load-bearing rather than
// tidiness. It used to answer every GET with the same body, which was harmless
// while the form fetched nothing: after this ticket a `mockResolvedValue` of
// location ROWS was also served to `GET /cities`, and CitySearch spreads that
// response into a string sort — `a.localeCompare is not a function`, a crash
// caused entirely by a fixture that cannot happen against the real API.
// Routing by URL also lets the create test count calls to the endpoint it
// actually means, instead of every GET the tree happens to make.
const apiMock = vi.hoisted(() => {
  const state = { locations: [] };
  return {
    state,
    get: vi.fn((url) => {
      if (url === "/cities") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: state.locations });
    }),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key) => (scope ? `${scope}.${key}` : key),
}));

// MEH-1936 — AddressSearch is stubbed so a test can drive BOTH paths
// deterministically: free typing (onChange only, no coordinates) and picking a
// suggestion (onSelect with a full payload). The real component's debounce and
// provider handling are its own concern; what is under test here is what
// LocationsEditor does with the contract at AddressSearch.jsx:39.
// REUSES: __tests__/RegisterProducerClient.test.jsx:99-124 — same stub shape.
vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, onSelect, inputTestId, id, placeholder }) => (
    <div>
      <input
        id={id}
        data-testid={inputTestId}
        placeholder={placeholder}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        data-testid="address-pick"
        onClick={() =>
          onSelect({
            street: "דרך שרה",
            city: "זכרון יעקב",
            displayName: "דרך שרה, זכרון יעקב",
            lat: 32.5731,
            lng: 34.9512,
          })
        }
      >
        pick
      </button>
    </div>
  ),
}));

// The confirmation map is Leaflet, which wants a real layout box. Only its
// props matter to this file — that it is handed the picked point, at the
// street-level zoom, with navigation off.
vi.mock("next/dynamic", () => ({
  default: () =>
    function MiniMapStub({ lat, lng, zoom, showNavigation }) {
      return (
        <div
          data-testid="mini-map"
          data-lat={String(lat)}
          data-lng={String(lng)}
          data-zoom={String(zoom)}
          data-nav={String(showNavigation)}
        />
      );
    },
}));

beforeEach(() => {
  apiMock.state.locations = [];
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  toastMock.info.mockClear();
});

// CitySearch takes no testid prop (and is REUSE-only for this ticket), but it
// renders a real <label htmlFor> — so the accessible name is the handle, which
// is the better locator anyway.
const cityInput = () => screen.getByLabelText("settings.locations.form.city_label");

const locationGets = () =>
  apiMock.get.mock.calls.filter(([url]) => url === LOCATIONS_URL).length;

async function openAddForm() {
  render(<LocationsEditor />);
  // Empty-state CTA opens the add form.
  await waitFor(() => screen.getByText("settings.locations.empty_cta"));
  fireEvent.click(screen.getByText("settings.locations.empty_cta"));
  await waitFor(() => screen.getByTestId("location-form"));
}

async function openEditForm(row) {
  apiMock.state.locations = [row];
  render(<LocationsEditor />);
  await waitFor(() => screen.getByLabelText("settings.locations.edit_aria"));
  fireEvent.click(screen.getByLabelText("settings.locations.edit_aria"));
  await waitFor(() => screen.getByTestId("location-form"));
}

describe("LocationsEditor (MEH-1421)", () => {
  it("renders the empty state when there are no locations", async () => {
    render(<LocationsEditor />);
    await waitFor(() =>
      expect(screen.getByText("settings.locations.empty_title")).toBeTruthy(),
    );
    expect(apiMock.get).toHaveBeenCalledWith(LOCATIONS_URL);
  });

  it("blocks an out-of-bounds coordinate before POSTing (Rule 19 safeParse)", async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId("location-lat"), { target: { value: "200" } });
    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() => expect(toastMock.info).toHaveBeenCalled());
    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("POSTs a valid location and reloads the list", async () => {
    await openAddForm();
    // Default form (kind=branch, blank optional fields) is valid.
    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        LOCATIONS_URL,
        expect.objectContaining({ kind: "branch", is_primary: false }),
      ),
    );
    // One initial fetch + one reload after the successful create. Counted on
    // the locations endpoint alone: CitySearch's GET /cities is a third call
    // that has nothing to do with what this assertion is about.
    await waitFor(() => expect(locationGets()).toBe(2));
  });
});

// MEH-1563: the coords disclosure is the only non-trivial logic in the
// field-guidance layer — a NEW location must not open on two unexplained
// numeric inputs, but editing a row that already carries coordinates must not
// hide a value the owner previously set.
describe("coords disclosure (MEH-1563)", () => {
  const detailsOf = () =>
    screen.getByTestId("location-coords-toggle").closest("details");

  it("starts closed on a new location", async () => {
    await openAddForm();
    expect(detailsOf().open).toBe(false);
  });

  it("starts open when the edited location already has coordinates", async () => {
    await openEditForm({ id: 5, kind: "branch", lat: 32.818, lng: 34.999 });
    expect(detailsOf().open).toBe(true);
  });
});

// MEH-1936 — the editor now geocodes through the same canonical components the
// register flow uses. What matters is what LocationsEditor does with the result:
// the point must reach the payload, a failure must stay nullable and unblocked,
// and precision must follow how the row was entered without ever overruling the
// owner.
describe("geocoding (MEH-1936)", () => {
  it("a picked address fills lat/lng and sends them in the payload", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId("address-pick"));

    // Visible confirmation first — the owner's evidence that a point was taken.
    await waitFor(() => screen.getByTestId("location-address-confirm"));
    const map = screen.getByTestId("mini-map");
    expect(map.dataset.lat).toBe("32.5731");
    expect(map.dataset.lng).toBe("34.9512");
    expect(map.dataset.zoom).toBe("16");
    expect(map.dataset.nav).toBe("false");

    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        LOCATIONS_URL,
        expect.objectContaining({
          lat: 32.5731,
          lng: 34.9512,
          address: "דרך שרה",
          location_precision: "exact",
        }),
      ),
    );
  });

  it("an address that never resolves stays nullable and still saves", async () => {
    await openAddForm();
    fireEvent.change(screen.getByTestId("location-address"), {
      target: { value: "רחוב שלא קיים 999" },
    });

    // The fallback line appears and the confirmation does not — the two states
    // are exclusive, so a green here cannot mean "both rendered".
    await waitFor(() => screen.getByTestId("location-address-unresolved"));
    expect(screen.queryByTestId("location-address-confirm")).not.toBeInTheDocument();

    // Critically: saving is NOT blocked. lat/lng stay null.
    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        LOCATIONS_URL,
        expect.objectContaining({ lat: null, lng: null, address: "רחוב שלא קיים 999" }),
      ),
    );
    expect(toastMock.info).not.toHaveBeenCalled();
  });

  it("typing over a picked address retires the coordinates it belonged to", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId("address-pick"));
    await waitFor(() => screen.getByTestId("location-address-confirm"));

    fireEvent.change(screen.getByTestId("location-address"), {
      target: { value: "משהו אחר לגמרי" },
    });

    // Stale coordinates surviving a rewritten address would put a confident pin
    // on the wrong place — worse than no pin. MEH-1808 found this on register.
    expect(screen.queryByTestId("location-address-confirm")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        LOCATIONS_URL,
        expect.objectContaining({ lat: null, lng: null }),
      ),
    );
  });

});

// Precision follows how the row was entered — until the owner says otherwise.
// Each case needs a form whose select has never been touched, so they live in
// their own `it`s rather than sharing one render.
describe("precision derivation (MEH-1936)", () => {
  it("city with no address derives approximate", async () => {
    await openAddForm();
    fireEvent.change(cityInput(), { target: { value: "זכרון יעקב" } });
    expect(screen.getByTestId("location-precision").value).toBe("approximate");
  });

  it("a picked address derives exact even after a city-only downgrade", async () => {
    await openAddForm();
    fireEvent.change(cityInput(), { target: { value: "זכרון יעקב" } });
    expect(screen.getByTestId("location-precision").value).toBe("approximate");

    fireEvent.click(screen.getByTestId("address-pick"));
    expect(screen.getByTestId("location-precision").value).toBe("exact");
  });

  it("never overrules a precision the owner set herself", async () => {
    await openAddForm();
    // Owner deliberately chooses approximate…
    fireEvent.change(screen.getByTestId("location-precision"), {
      target: { value: "approximate" },
    });
    // …then picks a street address, which WOULD derive "exact".
    fireEvent.click(screen.getByTestId("address-pick"));

    expect(screen.getByTestId("location-precision").value).toBe("approximate");
  });

  it("opening an existing row does not rewrite its saved precision", async () => {
    await openEditForm({
      id: 7,
      kind: "branch",
      city: "חיפה",
      lat: 32.818,
      lng: 34.999,
      location_precision: "approximate",
    });
    expect(screen.getByTestId("location-precision").value).toBe("approximate");
  });
});

// MEH-213 bans free-text towns: `city` is CitySearch's canonical value, and the
// server's same-city-label invariant (producer_me.py:1412) compares it across
// the producer's rows. A geocoder string must therefore only ever fill a gap.
describe("city is never clobbered by the geocoder (MEH-1936)", () => {
  it("keeps the town the owner chose when a pick resolves a different one", async () => {
    await openAddForm();
    fireEvent.change(cityInput(), { target: { value: "תל אביב" } });
    fireEvent.click(screen.getByTestId("address-pick")); // resolves זכרון יעקב

    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() =>
      expect(apiMock.post).toHaveBeenCalledWith(
        LOCATIONS_URL,
        expect.objectContaining({ city: "תל אביב" }),
      ),
    );
  });
});
