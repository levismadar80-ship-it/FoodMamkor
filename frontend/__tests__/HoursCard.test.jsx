/**
 * MEH-3790 — the one «שעות» card on the owner's edit page: each location's
 * opening hours (0 / 1 / many locations), the order window and special hours
 * as sections, the collapsed summary, and the hours save (a partial PUT of
 * `opening_hours` only, then a re-read of the location list).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import HoursCard from "@/app/[locale]/producer/dashboard/edit/HoursCard";

const apiMock = vi.hoisted(() => ({ put: vi.fn(() => Promise.resolve({ data: {} })) }));
vi.mock("@/lib/api", () => ({ default: apiMock }));

vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) =>
    `${scope}.${key}${values ? `(${Object.values(values).join(",")})` : ""}`,
}));

// The day-row picker has its own tests (LocationHoursField.test.jsx). Here it
// only has to hand a value up, the way the real one does after a touch.
vi.mock("@/app/[locale]/producer/dashboard/edit/LocationHoursField", () => ({
  default: ({ value, onChange }) => (
    <div data-testid="hours-field" data-value={value}>
      <button type="button" data-testid="hours-field-change" onClick={() => onChange("Sun 08:00-14:00")}>
        change
      </button>
    </div>
  ),
}));
vi.mock("@/app/[locale]/producer/dashboard/edit/OrderWindowEditor", () => ({
  default: () => <div data-testid="order-window-editor" />,
}));
vi.mock("@/app/[locale]/producer/dashboard/edit/SpecialHoursEditor", () => ({
  default: () => <div data-testid="special-hours-editor" />,
}));
vi.mock("@/components/WhatsThis", () => ({ default: () => null }));

const LOC_A = { id: 1, kind: "branch", is_primary: true, label: "החנות", city: "חיפה", opening_hours: "Sun 09:00-12:00" };
const LOC_B = { id: 2, kind: "pickup", is_primary: false, label: null, city: "עכו", opening_hours: "" };

function mount(over = {}) {
  const props = {
    profile: { order_window: {}, special_hours: [] },
    locations: [LOC_A],
    open: true,
    onToggle: vi.fn(),
    onSave: vi.fn(),
    reportDirty: vi.fn(),
    onHoursSaved: vi.fn(),
    onGoToLocations: vi.fn(),
    ...over,
  };
  render(<HoursCard {...props} />);
  return props;
}

beforeEach(() => {
  apiMock.put.mockClear();
  apiMock.put.mockImplementation(() => Promise.resolve({ data: {} }));
});

describe("«שעות» card — sections", () => {
  it("holds opening hours, then the order window, then special hours", () => {
    mount();
    const order = ["hours-section-opening", "hours-section-order-window", "hours-section-special"].map((id) =>
      screen.getByTestId(id),
    );
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(order[1]).getByTestId("order-window-editor")).toBeInTheDocument();
    expect(within(order[2]).getByTestId("special-hours-editor")).toBeInTheDocument();
    // The old deep links scroll to these two sections.
    expect(order[1].id).toBe("order-window");
    expect(order[2].id).toBe("special-hours");
  });
});

describe("«שעות» card — opening hours per location (0 / 1 / many)", () => {
  it("0 locations: no picker, and the button sends her to the locations card", () => {
    const props = mount({ locations: [] });
    expect(screen.queryByTestId("hours-field")).toBeNull();
    const empty = screen.getByTestId("hours-no-locations");
    fireEvent.click(within(empty).getByRole("button"));
    expect(props.onGoToLocations).toHaveBeenCalledTimes(1);
  });

  it("1 location: one picker, no location name above it", () => {
    mount();
    expect(screen.getAllByTestId("hours-field")).toHaveLength(1);
    expect(screen.queryByText("החנות")).toBeNull();
  });

  it("many locations: a picker per location, each under its name (or its kind when unnamed and townless)", () => {
    mount({ locations: [LOC_A, LOC_B, { ...LOC_B, id: 3, city: null }] });
    expect(screen.getAllByTestId("hours-field")).toHaveLength(3);
    expect(within(screen.getByTestId("hours-location-1")).getByText("החנות")).toBeInTheDocument();
    expect(within(screen.getByTestId("hours-location-2")).getByText("עכו")).toBeInTheDocument();
    expect(within(screen.getByTestId("hours-location-3")).getByText("settings.locations.kind.pickup")).toBeInTheDocument();
  });
});

describe("«שעות» card — saving one location's hours", () => {
  it("the save is off until the hours change", () => {
    mount();
    const row = screen.getByTestId("hours-location-1");
    expect(within(row).getByRole("button", { name: /save_cta/ })).toBeDisabled();
    fireEvent.click(within(row).getByTestId("hours-field-change"));
    expect(within(row).getByRole("button", { name: /save_cta/ })).toBeEnabled();
  });

  it("PUTs only opening_hours to that location, then asks for a re-read", async () => {
    const props = mount({ locations: [LOC_A, LOC_B] });
    const row = screen.getByTestId("hours-location-2");
    fireEvent.click(within(row).getByTestId("hours-field-change"));
    fireEvent.click(within(row).getByRole("button", { name: /save_cta/ }));
    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put).toHaveBeenCalledWith("/producers/me/locations/2", { opening_hours: "Sun 08:00-14:00" });
    await waitFor(() => expect(props.onHoursSaved).toHaveBeenCalledTimes(1));
  });

  it("a failed save says so in the row and asks for no re-read", async () => {
    apiMock.put.mockImplementation(() => Promise.reject({ response: { data: {} } }));
    const props = mount();
    const row = screen.getByTestId("hours-location-1");
    fireEvent.click(within(row).getByTestId("hours-field-change"));
    fireEvent.click(within(row).getByRole("button", { name: /save_cta/ }));
    expect(await within(row).findByText("dashboard.producer.location.save_error")).toBeInTheDocument();
    expect(props.onHoursSaved).not.toHaveBeenCalled();
  });

  it("a value that differs only by surrounding spaces is not a change", () => {
    mount({ locations: [{ ...LOC_A, opening_hours: "Sun 08:00-14:00  " }] });
    const row = screen.getByTestId("hours-location-1");
    fireEvent.click(within(row).getByTestId("hours-field-change"));
    expect(within(row).getByRole("button", { name: /save_cta/ })).toBeDisabled();
  });

  it("many locations: each row is a group named after its location", () => {
    mount({ locations: [LOC_A, LOC_B] });
    expect(screen.getByRole("group", { name: "החנות" })).toBe(screen.getByTestId("hours-location-1"));
    expect(screen.getByRole("group", { name: "עכו" })).toBe(screen.getByTestId("hours-location-2"));
  });

  it("an unsaved change is reported to the page's banner as «hours»", async () => {
    const props = mount();
    fireEvent.click(screen.getByTestId("hours-field-change"));
    await waitFor(() => expect(props.reportDirty).toHaveBeenLastCalledWith("hours", true));
  });
});

describe("«שעות» card — the collapsed summary", () => {
  const summaryOf = () => screen.getByTestId("accordion-hours").textContent;

  it("nothing set: says so", () => {
    mount({ open: false, locations: [{ ...LOC_A, opening_hours: "" }] });
    expect(summaryOf()).toContain("dashboard.producer.order_window.summary_empty");
  });

  it("names what is set: store hours, order days, upcoming dates", () => {
    // A date far ahead, so the test never depends on today's date.
    mount({
      open: false,
      profile: { order_window: { sunday: [{ open: "08:00", close: "12:00" }] }, special_hours: { "2099-01-01": { ranges: [] } } },
    });
    const text = summaryOf();
    expect(text).toContain("dashboard.producer.completeness.fields.hours");
    expect(text).toContain("dashboard.producer.order_window.summary_set(1)");
    expect(text).toContain("dashboard.producer.special_hours.summary_set(1)");
  });
});
