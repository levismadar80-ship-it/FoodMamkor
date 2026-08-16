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
    window.localStorage.clear();
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

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY))).toEqual({
      lat: 32.0853,
      lng: 34.7818,
    });
    expect(eventListener).toHaveBeenCalledTimes(1);

    window.removeEventListener(EVENT_NAME, eventListener);
  });
});

/**
 * MEH-2039 — the dialog contract, guarded at the vitest gate.
 *
 * These exist because the CI reviewer on PR #2847 pointed out that the
 * keyboard evidence for this file lived only in
 * frontend/e2e/qa-meh2039-modal-a11y.mjs — a hand-run QA script that no CI job
 * executes. A trap with no gated test is a trap a future refactor can delete
 * silently. Same three assertions as CategoryRequestModal.test.jsx.
 *
 * The trap test discriminates by construction: jsdom does not implement native
 * Tab focus movement, so nothing moves focus on a Tab keydown unless the
 * component's own handler runs and calls .focus() itself.
 */
describe("LocationModal dialog contract (MEH-2039)", () => {
  it("traps Tab inside the panel — wraps last→first and first→last", () => {
    setup();
    const panel = screen.getByRole("dialog");
    const focusables = panel.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusables.length).toBeGreaterThan(1);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("locks body scroll while open and restores it on unmount", () => {
    document.body.style.overflow = "auto";
    const { unmount } = render(<LocationModal open onClose={() => {}} onSelectCity={() => {}} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("names itself from the visible heading, not a parallel aria-label", () => {
    setup();
    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("aria-labelledby", "location-modal-title");
    expect(panel).toHaveAttribute("aria-describedby", "location-modal-subtitle");
    // The name must resolve to real, rendered text — an aria-labelledby
    // pointing at nothing is worse than the aria-label it replaced.
    expect(document.getElementById("location-modal-title").textContent.trim()).not.toBe("");
    expect(panel).not.toHaveAttribute("aria-label");
  });

  it("moves initial focus to the close button, not the city field", () => {
    setup();
    // Deliberate: focusing the text input would raise the on-screen keyboard
    // the moment the modal opens on mobile.
    expect(document.activeElement).toBe(screen.getByLabelText("modals.location.close_aria"));
  });
});
