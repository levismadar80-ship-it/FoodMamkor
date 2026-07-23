/**
 * MEH-1192 — LocationModal commit contract.
 *
 * The bug: onChange committed + closed on the first typed character (it called
 * handleCityPick per keystroke while CitySearch fires onChange per keystroke).
 * These tests lock the corrected contract: onChange = setState only; commit
 * happens ONLY on Enter (onSubmit) or a popular-city chip. Uses the REAL
 * CitySearch so the onChange/onSubmit wiring is exercised end-to-end.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => (ns ? `${ns}.${key}` : key),
}));

vi.mock("@phosphor-icons/react", () => ({
  X: () => <span />,
  Crosshair: () => <span />,
}));

vi.mock("@/lib/use-focus-return", () => ({ useFocusReturn: () => {} }));

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: [] })) },
}));

import LocationModal from "@/components/LocationModal";
import { STORAGE_KEY, EVENT_NAME } from "@/lib/user-location";

afterEach(() => vi.clearAllMocks());

function setup() {
  const onSelectCity = vi.fn();
  const onClose = vi.fn();
  render(<LocationModal open onClose={onClose} onSelectCity={onSelectCity} />);
  return { onSelectCity, onClose };
}

describe("LocationModal commit contract (MEH-1192)", () => {
  it("typing characters never commits (onSelectCity stays at zero)", async () => {
    const { onSelectCity } = setup();
    const input = screen.getByRole("combobox");
    await act(async () => { fireEvent.change(input, { target: { value: "ת" } }); });
    await act(async () => { fireEvent.change(input, { target: { value: "תל" } }); });
    await act(async () => { fireEvent.change(input, { target: { value: "תל " } }); });
    expect(onSelectCity).not.toHaveBeenCalled();
  });

  it("Enter commits exactly once", async () => {
    const { onSelectCity } = setup();
    const input = screen.getByRole("combobox");
    await act(async () => { fireEvent.change(input, { target: { value: "זזזז" } }); });
    await act(async () => { fireEvent.keyDown(input, { key: "Enter" }); });
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    expect(onSelectCity).toHaveBeenCalledWith("זזזז");
  });

  it("a popular-city chip commits exactly once", async () => {
    const { onSelectCity } = setup();
    // Chip label resolves to the namespaced key via the mock.
    const chip = screen.getByText("modals.location.popular_cities.tel_aviv");
    await act(async () => { fireEvent.click(chip); });
    expect(onSelectCity).toHaveBeenCalledTimes(1);
    // MEH-1504: Tel Aviv chip commits the canonical city name "תל אביב-יפו"
    // (the official cities-table value) so backend exact-match filtering hits.
    expect(onSelectCity).toHaveBeenCalledWith("תל אביב-יפו");
  });

  // MEH-1192 (R1): geolocate SUCCESS must persist the GPS fix (the third and
  // last flow after the two MEH-1230 handlers) so /map "מרחק" sort + card
  // distance labels unlock. Persistence happens BEFORE the reverse-geocode, so
  // it must survive even when Nominatim fails.
  it("geolocate success persists user_location + dispatches the sync event, even if reverse-geocode fails", async () => {
    window.sessionStorage.clear();
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 32.0853, longitude: 34.7818 } }),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    // Reverse-geocode intentionally rejects — persistence must not depend on it.
    global.fetch = vi.fn(() => Promise.reject(new Error("nominatim down")));
    const eventListener = vi.fn();
    window.addEventListener(EVENT_NAME, eventListener);

    setup();
    const geoBtn = screen.getByText("modals.location.geo_button");
    await act(async () => { fireEvent.click(geoBtn); });

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({
      lat: 32.0853,
      lng: 34.7818,
    });
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENT_NAME, eventListener);
  });
});
