/**
 * MEH-2144 (MEH-1938 batch B5) — progressive disclosure on the location form.
 *
 * Google Business Profile asks WHERE first and details after. Eight fields at
 * once is the heaviest moment in the dashboard, and it lands on a brand-new
 * owner adding her first location. Visible: kind + city/address + the
 * confirmation map. Behind "פרטים נוספים": תווית · טלפון · שעות · דיוק.
 *
 * What each block is FOR:
 *   TestCollapsedByDefault  — the change itself, on a NEW location.
 *   TestSeededOpenOnEdit    — editing must never HIDE a value she already set.
 *   TestValuesSurvive       — the AC's persistence case. The inputs stay
 *                             mounted, so this is about `form` state, not DOM.
 *   TestAutoExpandOnClash   — both triggers: the server's 422 code, and the
 *                             client-side same-city detection.
 *   TestPrimaryCheckbox     — hidden at 0 locations, shown from the second.
 *   TestGeocodeUnchanged    — MEH-1936 zero-regression.
 *
 * REUSES: __tests__/LocationsEditor.test.jsx — the api / next-intl /
 * AddressSearch / next-dynamic mock set, verbatim, because this file drives the
 * same component through the same seams.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LocationsEditor from "@/app/[locale]/producer/dashboard/edit/LocationsEditor";

const LOCATIONS_URL = "/producers/me/locations";

const apiMock = vi.hoisted(() => {
  const state = { locations: [], createError: null };
  return {
    state,
    get: vi.fn((url) => {
      if (url === "/cities") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: state.locations });
    }),
    post: vi.fn(() =>
      state.createError
        ? Promise.reject(state.createError)
        : Promise.resolve({ data: {} }),
    ),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toastMock }));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) => {
    const base = scope ? `${scope}.${key}` : key;
    if (!values) return base;
    const parts = Object.entries(values).map(([k, v]) => `${k}=${v}`);
    return `${base}(${parts.join(",")})`;
  },
}));

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
  apiMock.state.createError = null;
  apiMock.get.mockClear();
  apiMock.post.mockClear();
  apiMock.put.mockClear();
  apiMock.delete.mockClear();
  toastMock.info.mockClear();
  toastMock.error.mockClear();
});

const cityInput = () => screen.getByLabelText("settings.locations.form.city_label");
const details = () => screen.getByTestId("location-details");
const isOpen = () => details().hasAttribute("open");

async function openAddForm() {
  render(<LocationsEditor />);
  await waitFor(() => screen.getByText("settings.locations.empty_cta"));
  fireEvent.click(screen.getByText("settings.locations.empty_cta"));
  await waitFor(() => screen.getByTestId("location-form"));
}

/** Add form with N pre-existing locations, so `siblings` is non-empty. */
async function openAddFormWithSiblings(rows) {
  apiMock.state.locations = rows;
  render(<LocationsEditor />);
  await waitFor(() => screen.getByTestId("locations-add"));
  fireEvent.click(screen.getByTestId("locations-add"));
  await waitFor(() => screen.getByTestId("location-form"));
}

async function openEditForm(row) {
  apiMock.state.locations = [row];
  render(<LocationsEditor />);
  await waitFor(() => screen.getByLabelText("settings.locations.edit_aria"));
  fireEvent.click(screen.getByLabelText("settings.locations.edit_aria"));
  await waitFor(() => screen.getByTestId("location-form"));
}

const sibling = (over = {}) => ({
  id: "sib-1",
  kind: "branch",
  city: "חיפה",
  label: "סניף א",
  is_primary: true,
  lat: 32.79,
  lng: 34.98,
  ...over,
});

describe("MEH-2144 — collapsed by default on a new location", () => {
  it("the three deciding fields are visible and the four details are behind a toggle", async () => {
    await openAddForm();

    // Visible tier — present AND not inside the disclosure.
    expect(screen.getByTestId("location-kind")).toBeInTheDocument();
    expect(cityInput()).toBeInTheDocument();
    expect(screen.getByTestId("location-address")).toBeInTheDocument();
    expect(details().contains(screen.getByTestId("location-kind"))).toBe(false);
    expect(details().contains(cityInput())).toBe(false);

    // The four detail fields live INSIDE it, and it starts shut.
    expect(isOpen()).toBe(false);
    expect(details().contains(screen.getByTestId("location-label"))).toBe(true);
    expect(details().contains(screen.getByTestId("location-precision"))).toBe(true);
  });

  it("the toggle opens it", async () => {
    await openAddForm();
    expect(isOpen()).toBe(false);

    fireEvent.click(screen.getByTestId("location-details-toggle"));

    await waitFor(() => expect(isOpen()).toBe(true));
  });
});

describe("MEH-2144 — editing never hides a value already set", () => {
  it("opens seeded when the row has a label", async () => {
    await openEditForm(sibling({ label: "הדוכן בשוק" }));
    expect(isOpen()).toBe(true);
  });

  it("opens seeded when the row has only a phone", async () => {
    // The FOURTH trigger. It shares an `||` branch with label and hours, so it
    // cannot regress on its own today — but the negative control below asserts
    // the form stays shut given "none of the four", and that claim is only
    // honest once all four have each been shown to open it alone. Testing
    // three while naming four is the coverage the suite appeared to have.
    // (CI reviewer, PR #3036 — LocationsEditor.jsx:561-568.)
    await openEditForm(sibling({ label: "", phone: "052-1234567" }));
    expect(isOpen()).toBe(true);
  });

  it("opens seeded when the row has hours but no label", async () => {
    await openEditForm(sibling({ label: "", opening_hours: "Sun-Thu 09:00-17:00" }));
    expect(isOpen()).toBe(true);
  });

  it("opens seeded when precision is non-default", async () => {
    await openEditForm(sibling({ label: "", location_precision: "approximate" }));
    expect(isOpen()).toBe(true);
  });

  it("stays SHUT when the row carries none of the four", async () => {
    // The discriminating case for the seed condition: an edit form is not
    // unconditionally open, or the first three assertions would be vacuous.
    await openEditForm(
      sibling({ label: "", phone: "", opening_hours: "", location_precision: "exact" }),
    );
    expect(isOpen()).toBe(false);
  });
});

describe("MEH-2144 — values entered in the collapsed section survive", () => {
  it("a phone typed then re-collapsed is still in the submitted payload", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId("location-details-toggle"));
    await waitFor(() => expect(isOpen()).toBe(true));

    fireEvent.change(screen.getByTestId("location-address"), {
      target: { value: "דרך שרה 1" },
    });
    fireEvent.change(cityInput(), { target: { value: "זכרון יעקב" } });
    const phone = screen.getByPlaceholderText("settings.locations.form.phone_placeholder");
    fireEvent.change(phone, { target: { value: "0521234567" } });

    // Collapse again BEFORE submitting — the AC's exact scenario.
    fireEvent.click(screen.getByTestId("location-details-toggle"));
    await waitFor(() => expect(isOpen()).toBe(false));

    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const [url, body] = apiMock.post.mock.calls[0];
    expect(url).toBe(LOCATIONS_URL);
    expect(body.phone).toBe("0521234567");
  });
});

describe("MEH-2144 — תווית is revealed and focused on a same-city clash", () => {
  it("client-side: typing a town a sibling already uses REVEALS the field", async () => {
    await openAddFormWithSiblings([sibling({ city: "חיפה" })]);
    expect(isOpen()).toBe(false);

    fireEvent.change(cityInput(), { target: { value: "חיפה" } });

    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it("client-side: it does NOT steal focus, because she is still typing", async () => {
    // A declared narrowing of the AC, asserted so it cannot drift back by
    // accident. The client trigger fires mid-word in the city combobox;
    // CitySearch legitimately owns the caret there. Driving both viewports
    // showed the race resolving differently at 375 and 1440 — the same code
    // giving two answers is the signal that winning it harder is the wrong fix.
    // Revealing is what makes the rule discoverable; focus follows only after
    // the 422, where nothing else wants it (asserted below).
    await openAddFormWithSiblings([sibling({ city: "חיפה" })]);
    const city = cityInput();
    city.focus();

    fireEvent.change(city, { target: { value: "חיפה" } });

    await waitFor(() => expect(isOpen()).toBe(true));
    expect(document.activeElement).toBe(city);
  });

  it("the match is trimmed and case-insensitive, like the server's", async () => {
    await openAddFormWithSiblings([sibling({ city: "Haifa" })]);

    fireEvent.change(cityInput(), { target: { value: "  haifa  " } });

    await waitFor(() => expect(isOpen()).toBe(true));
  });

  it("a DIFFERENT town does not open it", async () => {
    // The discriminating case: without it, "opens on clash" is satisfied by a
    // form that opens on any keystroke in the city field.
    await openAddFormWithSiblings([sibling({ city: "חיפה" })]);

    fireEvent.change(cityInput(), { target: { value: "תל אביב" } });

    await new Promise((r) => setTimeout(r, 50));
    expect(isOpen()).toBe(false);
  });

  it("does not re-open once she has typed a label", async () => {
    await openAddFormWithSiblings([sibling({ city: "חיפה" })]);
    fireEvent.change(cityInput(), { target: { value: "חיפה" } });
    await waitFor(() => expect(isOpen()).toBe(true));

    fireEvent.change(screen.getByTestId("location-label"), {
      target: { value: "הדוכן" },
    });
    fireEvent.click(screen.getByTestId("location-details-toggle"));

    await waitFor(() => expect(isOpen()).toBe(false));
    // Still shut a tick later — the effect must not re-fire and yank it open.
    await new Promise((r) => setTimeout(r, 50));
    expect(isOpen()).toBe(false);
  });

  it("server-side: the 422 code opens it even with no sibling in state", async () => {
    // The server is the authority; the client check is only a hint. This drives
    // the OTHER trigger, with `siblings` deliberately empty so the client-side
    // branch cannot be what opens it.
    apiMock.state.createError = {
      response: {
        data: {
          detail: {
            code: "location_same_city_needs_label",
            message: "…",
            params: { city: "חיפה", existing_kind: "branch", existing_count: 1 },
          },
        },
      },
    };
    await openAddForm();
    fireEvent.change(cityInput(), { target: { value: "חיפה" } });
    fireEvent.change(screen.getByTestId("location-address"), {
      target: { value: "הרצל 1" },
    });
    expect(isOpen()).toBe(false);

    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() => expect(isOpen()).toBe(true));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("location-label")),
    );
  });

  it("the form error stays VISIBLE while the section is shut", async () => {
    // The trade this design makes, asserted rather than assumed: the error
    // block was NOT moved inside the disclosure. MEH-1940 put it next to תווית
    // so it would not land in the bottom strip — but a non-label error (any
    // other 422) inside a collapsed section would be invisible, which is worse
    // than the problem MEH-1940 solved. It stays out; the auto-expand is what
    // brings תווית to her.
    apiMock.state.createError = {
      response: { data: { detail: "משהו אחר נכשל" } },
    };
    await openAddForm();
    fireEvent.change(cityInput(), { target: { value: "תל אביב" } });
    fireEvent.change(screen.getByTestId("location-address"), {
      target: { value: "דיזנגוף 1" },
    });

    fireEvent.click(screen.getByTestId("location-save"));

    const err = await screen.findByTestId("location-form-error");
    expect(err).toBeInTheDocument();
    expect(details().contains(err)).toBe(false);
    // A non-same-city error must NOT reveal the section.
    expect(isOpen()).toBe(false);
  });
});

describe("MEH-2144 — the primary checkbox is hidden on the first location", () => {
  it("absent when the business has zero locations", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId("location-details-toggle"));
    await waitFor(() => expect(isOpen()).toBe(true));

    // The server forces the first row primary regardless, so the control has
    // one possible outcome and asking is noise.
    expect(screen.queryByTestId("location-primary")).not.toBeInTheDocument();
  });

  it("present from the second location onward", async () => {
    // Discriminating pair: without this, "hidden" would also be satisfied by a
    // checkbox deleted outright.
    await openAddFormWithSiblings([sibling()]);
    fireEvent.click(screen.getByTestId("location-details-toggle"));
    await waitFor(() => expect(isOpen()).toBe(true));

    expect(screen.getByTestId("location-primary")).toBeInTheDocument();
  });
});

describe("MEH-2144 — the MEH-1936 geocode flow is unchanged", () => {
  it("picking an address still fills coordinates and shows the confirmation map", async () => {
    await openAddForm();

    fireEvent.click(screen.getByTestId("address-pick"));

    const map = await screen.findByTestId("mini-map");
    expect(map).toHaveAttribute("data-lat", "32.5731");
    expect(map).toHaveAttribute("data-lng", "34.9512");
    expect(map).toHaveAttribute("data-zoom", "16");
  });

  it("the picked address is submitted with its coordinates", async () => {
    await openAddForm();
    fireEvent.click(screen.getByTestId("address-pick"));
    await screen.findByTestId("mini-map");

    fireEvent.click(screen.getByTestId("location-save"));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalled());
    const [, body] = apiMock.post.mock.calls[0];
    expect(body.lat).toBeCloseTo(32.5731);
    expect(body.lng).toBeCloseTo(34.9512);
    expect(body.address).toBe("דרך שרה");
  });
});
