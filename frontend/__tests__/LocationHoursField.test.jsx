/**
 * MEH-2805 — a location's opening hours are picked from day rows, not typed.
 *
 * Two layers:
 *   1. LocationHoursField alone — prefill (readable English / Hebrew /
 *      unreadable / empty), the canonical string it reports, round-trip
 *      through parseHours, and an invalid row's inline error + validity flag.
 *   2. Through the REAL LocationsEditor form — an invalid row blocks the save,
 *      and an unreadable stored value goes back to the server byte-identical
 *      when the owner saves another field (no silent data loss).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { parseHours } from "@/lib/hours";
import LocationHoursField from "@/app/[locale]/producer/dashboard/edit/LocationHoursField";
import LocationsEditor from "@/app/[locale]/producer/dashboard/edit/LocationsEditor";

// Same harness as __tests__/LocationsEditor.test.jsx (URL-aware api, echoing
// translator, AddressSearch + MiniMap stubs) — REUSES its :22-104.
const apiMock = vi.hoisted(() => {
  const state = { locations: [] };
  return {
    state,
    get: vi.fn((url) => Promise.resolve({ data: url === "/cities" ? [] : state.locations })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  };
});
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("@/lib/toast", () => ({ showToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) => {
    const base = scope ? `${scope}.${key}` : key;
    if (!values) return base;
    return `${base}(${Object.entries(values).map(([k, v]) => `${k}=${v}`).join(",")})`;
  },
}));
vi.mock("@/components/AddressSearch", () => ({
  default: ({ value, onChange, inputTestId, id }) => (
    <input id={id} data-testid={inputTestId} value={value || ""} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="mini-map" /> }));

const openBox = (i) => screen.getByTestId(`location-hours-open-${i}`);
const timesOf = (i) =>
  Array.from(screen.getByTestId(`location-hours-day-${i}`).querySelectorAll('input[type="time"]')).map((el) => el.value);
const openDays = () => [0, 1, 2, 3, 4, 5, 6].filter((i) => openBox(i).checked);

function renderField(value) {
  const onChange = vi.fn();
  const onValidityChange = vi.fn();
  render(<LocationHoursField value={value} onChange={onChange} onValidityChange={onValidityChange} />);
  return { onChange, onValidityChange };
}

describe("LocationHoursField — prefill (MEH-2805 AC 3)", () => {
  it("a readable English value fills the rows", () => {
    renderField("Sun-Thu 09:00-18:00, Fri 09:00-13:00");
    expect(openDays()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(timesOf(0)).toEqual(["09:00", "18:00"]);
    expect(timesOf(5)).toEqual(["09:00", "13:00"]);
    expect(screen.queryByTestId("location-hours-unreadable")).toBeNull();
  });

  it("a Hebrew value (read since MEH-2803) fills the rows too — the demo seed", () => {
    renderField("א'-ה' 07:00-14:00, ו' 06:30-13:00");
    expect(openDays()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(timesOf(2)).toEqual(["07:00", "14:00"]);
    expect(timesOf(5)).toEqual(["06:30", "13:00"]);
    expect(screen.queryByTestId("location-hours-unreadable")).toBeNull();
  });

  it("an unreadable value: rows empty, the stored text shown verbatim, and nothing reported upward", () => {
    const { onChange } = renderField("בתיאום מראש");
    expect(openDays()).toEqual([]);
    expect(screen.getByTestId("location-hours-unreadable").textContent).toBe(
      "settings.locations.form.hours_unreadable(value=בתיאום מראש)",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the unreadable note stays on screen after the first edit — the owner is re-entering it", () => {
    const onChange = vi.fn();
    const { rerender } = render(<LocationHoursField value="בתיאום מראש" onChange={onChange} />);
    fireEvent.click(openBox(0));
    // The form feeds the new canonical value back in, as LocationsEditor does.
    rerender(<LocationHoursField value={onChange.mock.calls.at(-1)[0]} onChange={onChange} />);
    expect(screen.getByTestId("location-hours-unreadable").textContent).toContain("בתיאום מראש");
  });

  it("an empty value: every day closed, no note", () => {
    renderField("");
    expect(openDays()).toEqual([]);
    expect(screen.queryByTestId("location-hours-unreadable")).toBeNull();
    expect(screen.getAllByText("opening_hours.closed_day")).toHaveLength(7);
  });
});

describe("LocationHoursField — what it saves (MEH-2805 AC 2)", () => {
  it("opening a day reports the canonical string, and it round-trips through parseHours", () => {
    const { onChange } = renderField("");
    fireEvent.click(openBox(5));
    const saved = onChange.mock.calls.at(-1)[0];
    expect(saved).toBe("Fri 09:00-17:00");
    expect(parseHours(saved)).toEqual({ 5: [{ open: "09:00", close: "17:00" }] });
  });

  it("a Hebrew value edited once is saved canonical, with the same week", () => {
    const { onChange } = renderField("א'-ה' 07:00-14:00, ו' 06:30-13:00");
    fireEvent.click(screen.getByTestId("location-hours-add-5"));
    const saved = onChange.mock.calls.at(-1)[0];
    expect(saved).toBe("Sun-Thu 07:00-14:00, Fri 06:30-13:00 13:00-15:00"); // nextRange: starts at the last close
    const map = parseHours(saved);
    expect(Object.keys(map).map(Number)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(map[5]).toHaveLength(2);
  });

  it("closing every day saves an empty string (= no hours)", () => {
    const { onChange } = renderField("Fri 09:00-13:00");
    fireEvent.click(openBox(5));
    expect(onChange.mock.calls.at(-1)[0]).toBe("");
  });
});

describe("LocationHoursField — validation (MEH-2805 AC 4)", () => {
  it("a close-before-open range shows the row's error and reports invalid; fixing it reports valid", () => {
    const { onValidityChange } = renderField("Sun 09:00-17:00");
    const [, to] = screen.getByTestId("location-hours-day-0").querySelectorAll('input[type="time"]');
    fireEvent.change(to, { target: { value: "08:00" } });
    expect(screen.getByTestId("location-hours-error-0").textContent).toBe(
      "dashboard.producer.order_window.invalid_range",
    );
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    fireEvent.change(to, { target: { value: "18:00" } });
    expect(screen.queryByTestId("location-hours-error-0")).toBeNull();
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it("time inputs carry the 44px touch floor (AC 6)", () => {
    renderField("Sun 09:00-17:00");
    for (const el of screen.getByTestId("location-hours-day-0").querySelectorAll('input[type="time"]')) {
      expect(el.className).toContain("min-h-touch");
    }
  });
});

// ── Through the real location form ──────────────────────────────────────────
const ROW = { id: 7, kind: "branch", city: "חיפה", lat: 32.818, lng: 34.999, location_precision: "exact" };

async function openEditForm(row) {
  apiMock.state.locations = [row];
  render(<LocationsEditor />);
  await waitFor(() => screen.getByLabelText("settings.locations.edit_aria"));
  fireEvent.click(screen.getByLabelText("settings.locations.edit_aria"));
  await waitFor(() => screen.getByTestId("location-form"));
}

describe("LocationsEditor + LocationHoursField (MEH-2805 AC 3 + AC 4)", () => {
  beforeEach(() => {
    apiMock.put.mockClear();
    apiMock.post.mockClear();
  });

  it("an unreadable stored value survives saving another field, byte-identical", async () => {
    await openEditForm({ ...ROW, opening_hours: "בתיאום מראש", phone: "" });
    fireEvent.change(screen.getByLabelText("settings.locations.form.phone_label"), {
      target: { value: "0501234567" },
    });
    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    const payload = apiMock.put.mock.calls[0][1];
    expect(payload.phone).toBe("0501234567");
    expect(payload.opening_hours).toBe("בתיאום מראש");
  });

  it("an invalid row blocks the save — no request, the save button disabled", async () => {
    await openEditForm({ ...ROW, opening_hours: "Sun 09:00-17:00" });
    const [, to] = screen.getByTestId("location-hours-day-0").querySelectorAll('input[type="time"]');
    fireEvent.change(to, { target: { value: "08:00" } });
    expect(screen.getByTestId("location-save").disabled).toBe(true);
    fireEvent.submit(screen.getByTestId("location-form"));
    await new Promise((r) => setTimeout(r, 0));
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it("a picked week is sent in the canonical format", async () => {
    await openEditForm({ ...ROW, opening_hours: "" });
    fireEvent.click(screen.getByTestId("location-hours-open-0"));
    fireEvent.click(screen.getByTestId("location-save"));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put.mock.calls[0][1].opening_hours).toBe("Sun 09:00-17:00");
  });
});
