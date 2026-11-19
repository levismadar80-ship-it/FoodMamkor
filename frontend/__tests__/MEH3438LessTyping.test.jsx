/**
 * MEH-3438 — three places a business stops retyping what she already has.
 *
 * 1. Opening hours: «אותן שעות לכל הימים הפתוחים». Cells by open-day count:
 *    0 → no button · 1 → no button · 2+ → button; a closed day stays closed.
 * 2. «שכפול» of an event / experience: ?from=<id> seeds the create form from
 *    the owner's OWN row (looked up in /…/mine), date cleared, id dropped. An
 *    id that is not hers, a failed read, and no ?from all give no seed.
 * 3. Group buy «מילוי ממוצר קיים»: 0 products → nothing rendered; 1+ → a pick
 *    fills the name and regular price, and the fields stay editable.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, cleanup } from "@testing-library/react";

const apiMock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: apiMock }));
vi.mock("next-intl", () => ({
  useTranslations: (scope) => (key, values) =>
    `${scope}.${key}${values ? `(${Object.values(values).join(",")})` : ""}`,
}));

import LocationHoursField from "@/app/[locale]/producer/dashboard/edit/LocationHoursField";
import useDuplicateSource from "@/lib/use-duplicate-source";
import GroupBuyProductPicker from "@/components/GroupBuyProductPicker";
import he from "@/messages/he.json";
import en from "@/messages/en.json";

const timesOf = (i) =>
  Array.from(screen.getByTestId(`location-hours-day-${i}`).querySelectorAll('input[type="time"]')).map((el) => el.value);
const copyButton = () => screen.queryByTestId("location-hours-copy-all");

beforeEach(() => {
  apiMock.get.mockReset();
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("MEH-3438 · opening hours — same hours for all open days", () => {
  it("0 open days: no button", () => {
    render(<LocationHoursField value="" onChange={vi.fn()} />);
    expect(copyButton()).toBeNull();
  });

  it("1 open day: no button (nowhere to copy to)", () => {
    render(<LocationHoursField value="Sun 09:00-18:00" onChange={vi.fn()} />);
    expect(copyButton()).toBeNull();
  });

  it("2+ open days: copies the first open day's ranges, a closed day stays closed", () => {
    const onChange = vi.fn();
    render(<LocationHoursField value="Sun 08:00-12:00 16:00-19:00, Mon 10:00-11:00, Tue 10:00-11:00" onChange={onChange} />);
    // The button sits in Sunday's row, the first open day.
    expect(screen.getByTestId("location-hours-day-0")).toContainElement(copyButton());
    fireEvent.click(copyButton());
    expect(timesOf(1)).toEqual(["08:00", "12:00", "16:00", "19:00"]);
    expect(timesOf(2)).toEqual(["08:00", "12:00", "16:00", "19:00"]);
    // Friday (5) was closed and stays closed.
    expect(screen.getByTestId("location-hours-open-5")).not.toBeChecked();
    // Three identical days collapse into one range; Friday is not in it.
    expect(onChange).toHaveBeenLastCalledWith("Sun-Tue 08:00-12:00 16:00-19:00");
  });

  it("the label is the approved string in both locales", () => {
    expect(he.settings.locations.form.hours_copy_all).toBe("אותן שעות לכל הימים הפתוחים");
    expect(en.settings.locations.form.hours_copy_all).toBe("Same hours for all open days");
  });
});

describe("MEH-3438 · duplicate an event / experience", () => {
  const MINE = [
    { id: "e1", title: "סדנת לחם", event_date: "2099-01-01", event_time: "10:00", city: "חיפה" },
    { id: "e2", title: "אחר", event_date: "2099-02-01" },
  ];

  it("?from=<own id>: seeds every field but the date, and drops the id", async () => {
    window.history.replaceState(null, "", "/?from=e1");
    apiMock.get.mockResolvedValue({ data: MINE });
    const { result } = renderHook(() => useDuplicateSource("events"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiMock.get).toHaveBeenCalledWith("/events/mine");
    expect(result.current.source).toMatchObject({ title: "סדנת לחם", event_time: "10:00", city: "חיפה", event_date: "" });
    expect(result.current.source.id).toBeUndefined();
  });

  it("experiences read their own list", async () => {
    window.history.replaceState(null, "", "/?from=e2");
    apiMock.get.mockResolvedValue({ data: MINE });
    const { result } = renderHook(() => useDuplicateSource("experiences"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(apiMock.get).toHaveBeenCalledWith("/experiences/mine");
    expect(result.current.source.title).toBe("אחר");
  });

  it("an id that is not in her own list: no seed", async () => {
    window.history.replaceState(null, "", "/?from=someone-else");
    apiMock.get.mockResolvedValue({ data: MINE });
    const { result } = renderHook(() => useDuplicateSource("events"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBeNull();
  });

  it("a failed read: no seed, the empty form opens", async () => {
    window.history.replaceState(null, "", "/?from=e1");
    apiMock.get.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useDuplicateSource("events"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBeNull();
  });

  it("no ?from: no request at all", async () => {
    const { result } = renderHook(() => useDuplicateSource("events"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBeNull();
    expect(apiMock.get).not.toHaveBeenCalled();
  });
});

describe("MEH-3438 · group buy from an existing product", () => {
  it("0 products: nothing rendered", async () => {
    apiMock.get.mockResolvedValue({ data: [] });
    const { container } = render(<GroupBuyProductPicker onPick={vi.fn()} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalledWith("/producers/me/products"));
    expect(container).toBeEmptyDOMElement();
  });

  it("a failed read: nothing rendered", async () => {
    apiMock.get.mockRejectedValue(new Error("500"));
    const { container } = render(<GroupBuyProductPicker onPick={vi.fn()} />);
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("1+ products: a pick reports the name and the regular price", async () => {
    apiMock.get.mockResolvedValue({
      data: [
        { id: "p1", name: "חלה מתוקה", price_min: "45.00" },
        { id: "p2", name: "עוגה", price_min: null },
      ],
    });
    const onPick = vi.fn();
    render(<GroupBuyProductPicker onPick={onPick} />);
    const select = await screen.findByTestId("group-buy-product-picker");
    fireEvent.change(select, { target: { value: "p1" } });
    expect(onPick).toHaveBeenLastCalledWith({ name: "חלה מתוקה", regularPrice: "45" });
    fireEvent.change(select, { target: { value: "p2" } });
    expect(onPick).toHaveBeenLastCalledWith({ name: "עוגה", regularPrice: "" });
  });
});
