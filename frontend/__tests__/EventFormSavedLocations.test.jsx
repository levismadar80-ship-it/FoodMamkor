/**
 * MEH-2932 (C18) — an owner who has already saved her selling points picks one
 * for an event instead of retyping the address and the town.
 *
 * The matrix the card and CLAUDE.md's 5-state rule ask for is (0 / 1 / many)
 * saved locations × (a saved one chosen / «כתובת אחרת» chosen). Counting the
 * two lists separately looks like coverage and leaves a cell with no test
 * (MEH-1583), so every cell below is named after the input it covers.
 *
 * The zero cell is the load-bearing one: a business with no saved locations
 * must see exactly today's form, with no picker and no empty-list furniture.
 *
 * REUSES: __tests__/EventFormImageAccessibility.test.jsx (harness shape).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import EventForm from "@/components/EventForm";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock("@/components/CitySearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ id, value, onChange }) => (
    <input id={id} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const FARM = {
  id: "11111111-1111-1111-1111-111111111111",
  kind: "farm",
  label: "החווה",
  city: "זכרון יעקב",
  address: "הרצל 1",
  lat: 32.57,
  lng: 34.95,
  is_primary: true,
};
const STALL = {
  id: "22222222-2222-2222-2222-222222222222",
  kind: "market",
  label: "הדוכן בשוק",
  city: "חיפה",
  address: "הנמל 5",
  lat: null,
  lng: null,
  is_primary: false,
};

function mockLocations(rows) {
  api.get.mockImplementation((url) =>
    url === "/producers/me/locations"
      ? Promise.resolve({ data: rows })
      : Promise.resolve({ data: {} }),
  );
}

function renderForm() {
  return render(
    <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
      <EventForm />
    </NextIntlClientProvider>,
  );
}

const picker = () => screen.queryByTestId("event-saved-locations");
const addressInput = () => document.getElementById("location");
const cityInput = () => document.getElementById("city");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MEH-2932 · count axis", () => {
  it("0 saved locations — no picker at all, and the form is exactly today's", async () => {
    mockLocations([]);
    renderForm();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me/locations"));
    // Not "an empty picker": no furniture, no «כתובת אחרת» with nothing to be
    // other THAN. The two fields she has always had are still there.
    expect(picker()).toBeNull();
    expect(addressInput()).toBeTruthy();
    expect(cityInput()).toBeTruthy();
  });

  it("1 saved location — it is offered, beside «כתובת אחרת»", async () => {
    mockLocations([FARM]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());
    expect(screen.getByTestId(`event-saved-location-${FARM.id}`)).toBeTruthy();
    expect(screen.getByTestId("event-saved-location-other")).toBeTruthy();
  });

  it("many saved locations — every one is offered, beside «כתובת אחרת»", async () => {
    mockLocations([FARM, STALL]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());
    expect(screen.getByTestId(`event-saved-location-${FARM.id}`)).toBeTruthy();
    expect(screen.getByTestId(`event-saved-location-${STALL.id}`)).toBeTruthy();
    expect(screen.getByTestId("event-saved-location-other")).toBeTruthy();
    // Derived, not stated: one radio per row plus exactly one «other».
    // Scoped to the picker — the form has other radio groups
    // (registration_method), and an unscoped count would be measuring them.
    expect(within(picker()).getAllByRole("radio")).toHaveLength(3);
  });

  it("a failed read leaves the form as it is — the picker is an addition, not a gate", async () => {
    api.get.mockImplementation((url) =>
      url === "/producers/me/locations"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ data: {} }),
    );
    renderForm();
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/producers/me/locations"));
    expect(picker()).toBeNull();
    expect(addressInput()).toBeTruthy();
  });
});

describe("MEH-2932 · selection axis", () => {
  it("choosing a saved location fills the address, the town and the coordinates", async () => {
    mockLocations([FARM, STALL]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());

    fireEvent.click(screen.getByTestId(`event-saved-location-${FARM.id}`));
    await waitFor(() => expect(addressInput().value).toBe("הרצל 1"));
    expect(cityInput().value).toBe("זכרון יעקב");
  });

  it("choosing a location with no coordinates clears the previous ones", async () => {
    // The cell a "just fill the fields" implementation gets wrong: picking the
    // farm and then the stall must not leave the FARM's pin on the event.
    // Asserted on what the server is actually sent, not on a data- attribute
    // added for the test to read — the payload is the thing that matters, and
    // a hook exposed only to tests proves only that the hook was set.
    mockLocations([FARM, STALL]);
    api.post.mockResolvedValue({ data: { id: 3 } });
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());

    fireEvent.click(screen.getByTestId(`event-saved-location-${FARM.id}`));
    await waitFor(() => expect(addressInput().value).toBe("הרצל 1"));
    fireEvent.click(screen.getByTestId(`event-saved-location-${STALL.id}`));
    await waitFor(() => expect(addressInput().value).toBe("הנמל 5"));
    expect(screen.getByTestId(`event-saved-location-${STALL.id}`).checked).toBe(true);

    fireEvent.change(document.getElementById("title"), { target: { value: "שוק גלם" } });
    fireEvent.change(document.getElementById("event_date"), { target: { value: "2026-12-07" } });
    fireEvent.change(document.getElementById("event_time"), { target: { value: "09:30" } });
    fireEvent.change(document.getElementById("category"), { target: { value: "שוק" } });
    fireEvent.click(screen.getByText(he.sweep_tail.event_new.submit));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({ location: "הנמל 5", city: "חיפה", lat: null, lng: null }),
    );
  });

  it("control — a location WITH coordinates sends them", async () => {
    // Without this, the cell above is satisfied by an implementation that never
    // sends coordinates at all.
    mockLocations([FARM, STALL]);
    api.post.mockResolvedValue({ data: { id: 4 } });
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());

    fireEvent.click(screen.getByTestId(`event-saved-location-${FARM.id}`));
    await waitFor(() => expect(addressInput().value).toBe("הרצל 1"));

    fireEvent.change(document.getElementById("title"), { target: { value: "שוק גלם" } });
    fireEvent.change(document.getElementById("event_date"), { target: { value: "2026-12-07" } });
    fireEvent.change(document.getElementById("event_time"), { target: { value: "09:30" } });
    fireEvent.change(document.getElementById("category"), { target: { value: "שוק" } });
    fireEvent.click(screen.getByText(he.sweep_tail.event_new.submit));

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(
      "/events",
      expect.objectContaining({ lat: 32.57, lng: 34.95 }),
    );
  });

  it("«כתובת אחרת» does not erase what she already typed", async () => {
    mockLocations([FARM]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());

    fireEvent.change(addressInput(), { target: { value: "אצלי בחצר" } });
    fireEvent.click(screen.getByTestId("event-saved-location-other"));
    expect(addressInput().value).toBe("אצלי בחצר");
  });

  it("typing a different address moves the choice to «כתובת אחרת» — the radio must not lie", async () => {
    mockLocations([FARM]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());

    fireEvent.click(screen.getByTestId(`event-saved-location-${FARM.id}`));
    await waitFor(() => expect(addressInput().value).toBe("הרצל 1"));
    expect(screen.getByTestId(`event-saved-location-${FARM.id}`).checked).toBe(true);

    fireEvent.change(addressInput(), { target: { value: "מקום אחר לגמרי" } });
    await waitFor(() =>
      expect(screen.getByTestId("event-saved-location-other").checked).toBe(true),
    );
    expect(screen.getByTestId(`event-saved-location-${FARM.id}`).checked).toBe(false);
  });

  it("nothing is pre-selected — the seller chooses, the form does not choose for her", async () => {
    mockLocations([FARM, STALL]);
    renderForm();
    await waitFor(() => expect(picker()).toBeTruthy());
    expect(within(picker()).getAllByRole("radio").filter((r) => r.checked)).toHaveLength(0);
    expect(addressInput().value).toBe("");
  });
});
