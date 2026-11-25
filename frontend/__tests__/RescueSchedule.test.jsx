/**
 * MEH-3703 — the weekly surprise-bag routine on the dashboard: the strip
 * under the counters («לדלג על מחר») and the settings page.
 *
 * Copy is read from the real messages/he.json (renderHe). Dates are built
 * from a fixed Thursday passed as `today`, so nothing reads the runner's clock.
 *
 * Cells (5-state rule): points 0 / 1 / many × the strip shown or not, the
 * skip question closed / open, a point with no exact address.
 *
 * Shown red against a broken build (PR body):
 *   - tomorrow's weekday bit off by one        -> "shows a point whose routine covers tomorrow…"
 *   - the server's 409 not turned into a question -> "asks first when tomorrow's bag has reservations"
 *   - «כן» sent without cancel_reserved            -> "asks first when tomorrow's bag has reservations"
 *   - a point that cannot publish still promised  -> "shows a point whose routine covers tomorrow…"
 *   - the price sent in shekels                 -> "saves the routine in agorot"
 *   - tomorrow listed on the page too           -> "lists the routine days from the day after tomorrow"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderHe as render } from "./helpers/render-with-he";
import he from "../messages/he.json";

const get = vi.fn();
const put = vi.fn();
const post = vi.fn();
const del = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={typeof href === "string" ? href : "#"} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/api", () => ({
  default: { get: (...a) => get(...a), put: (...a) => put(...a), post: (...a) => post(...a), delete: (...a) => del(...a) },
}));

const { default: Strip, tomorrowRows, tomorrowOf } = await import("@/components/dashboard/RescueScheduleStrip");
const { default: Form, upcomingDays } = await import("@/components/dashboard/RescueScheduleForm");

// Thursday 10/12/2026. Tomorrow is Friday (bit 32).
const THU = "2026-12-10";
const FRI = "2026-12-11";
const FRIDAY = 32;
const s = he.rescue.schedule;
const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";

function row(over = {}, schedule = {}) {
  return {
    producer_location_id: L1,
    label: "הסניף בכרמל",
    address: "הנשיא 1",
    city: "חיפה",
    exact: true,
    publishing: true,
    closed_days: [],
    schedule: {
      weekdays: 127,
      pickup_start: "18:00",
      pickup_end: "20:00",
      cancel_minutes: 60,
      qty: 4,
      price_agorot: 1500,
      value_min_agorot: null,
      value_max_agorot: null,
      paused: false,
      skip_dates: [],
      ...schedule,
    },
    ...over,
  };
}

beforeEach(() => {
  get.mockReset();
  put.mockReset().mockResolvedValue({ data: row() });
  post.mockReset().mockResolvedValue({ data: {} });
  del.mockReset().mockResolvedValue({ data: row() });
});

describe("which points the strip shows", () => {
  it("tomorrow is Friday's bit", () => {
    expect(tomorrowOf(THU)).toEqual({ day: FRI, bit: FRIDAY });
  });

  it("shows a point whose routine covers tomorrow, and not one that skips the weekday, is paused, cannot publish or was cancelled", () => {
    const rows = [
      row({ producer_location_id: "fri" }, { weekdays: FRIDAY }),
      row({ producer_location_id: "thu" }, { weekdays: 16 }),
      row({ producer_location_id: "paused" }, { paused: true }),
      row({ producer_location_id: "none", schedule: null }),
      row({ producer_location_id: "unapproved", publishing: false }),
      row({ producer_location_id: "cancelled", closed_days: [FRI] }),
    ];
    expect(tomorrowRows(rows, THU).map((r) => r.producer_location_id)).toEqual(["fri"]);
  });

  it("keeps a skipped tomorrow, marked, so the skip can be taken back", () => {
    const [shown] = tomorrowRows([row({}, { skip_dates: [FRI] })], THU);
    expect(shown.skipped).toBe(true);
  });
});

describe("the strip", () => {
  it("renders nothing when no point publishes tomorrow (0 points)", async () => {
    get.mockResolvedValue({ data: [row({}, { weekdays: 16 })] });
    const { container } = render(<Strip today={THU} onChanged={() => {}} />);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(container.querySelector("[data-testid='rescue-schedule-strip']")).toBeNull();
  });

  it("one point: tomorrow's bag in one line, without the place", async () => {
    get.mockResolvedValue({ data: [row()] });
    render(<Strip today={THU} onChanged={() => {}} />);
    const line = await screen.findByTestId("rescue-schedule-line");
    expect(line.textContent).toContain("בלוח של מחר: 4 סלים ב-15 ₪");
    expect(line.textContent).not.toContain("הסניף בכרמל");
    // The window is isolated left-to-right (LRI … PDI), or inside the Hebrew
    // line it reads backwards, «20:00–18:00» (screenshot, 25/11).
    expect(line.textContent).toContain("\u206618:00–20:00\u2069");
    expect(screen.getByTestId("rescue-schedule-edit-link").getAttribute("href")).toBe("/producer/dashboard/rescue/schedule");
  });

  it("many points: each line names its place", async () => {
    get.mockResolvedValue({ data: [row(), row({ producer_location_id: L2, label: "הדוכן בשוק" })] });
    render(<Strip today={THU} onChanged={() => {}} />);
    const lines = await screen.findAllByTestId("rescue-schedule-line");
    expect(lines.map((l) => l.textContent.split(",")[0])).toEqual(["הסניף בכרמל", "הדוכן בשוק"]);
  });

  it("skipping tomorrow is one call; the server cancels a bag already up", async () => {
    get.mockResolvedValue({ data: [row()] });
    const onChanged = vi.fn();
    render(<Strip today={THU} onChanged={onChanged} />);
    fireEvent.click(await screen.findByTestId("rescue-schedule-skip"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe(`/producers/me/rescue/locations/${L1}/schedule/skips/${FRI}`);
    expect(put.mock.calls[0][2]).toBeUndefined(); // no cancel_reserved on the first try
    expect(post).not.toHaveBeenCalled();
  });

  it("asks first when tomorrow's bag has reservations (closed, then open, then yes)", async () => {
    get.mockResolvedValue({ data: [row()] });
    const reserved = { response: { status: 409, data: { detail: "יש הזמנות לסל של היום הזה" } } };
    put.mockRejectedValueOnce(reserved).mockRejectedValueOnce(reserved); // the server refuses until confirmed
    const onChanged = vi.fn();
    render(<Strip today={THU} onChanged={onChanged} />);
    expect(screen.queryByTestId("rescue-schedule-ask")).toBeNull();
    fireEvent.click(await screen.findByTestId("rescue-schedule-skip"));
    expect((await screen.findByTestId("rescue-schedule-ask")).textContent).toContain(s.skip_has_orders);
    expect(onChanged).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("rescue-schedule-skip-no"));
    expect(screen.queryByTestId("rescue-schedule-ask")).toBeNull();
    expect(put).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("rescue-schedule-skip"));
    fireEvent.click(await screen.findByTestId("rescue-schedule-skip-yes"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(put.mock.calls[2][2]).toEqual({ params: { cancel_reserved: true } });
  });

  it("a skipped tomorrow offers «לבטל את הדילוג», which removes the skip", async () => {
    get.mockResolvedValue({ data: [row({}, { skip_dates: [FRI] })] });
    render(<Strip today={THU} onChanged={() => {}} />);
    expect((await screen.findByTestId("rescue-schedule-line")).textContent).toBe(s.strip_skipped);
    fireEvent.click(screen.getByTestId("rescue-schedule-unskip"));
    await waitFor(() => expect(del).toHaveBeenCalledWith(`/producers/me/rescue/locations/${L1}/schedule/skips/${FRI}`));
  });
});

describe("the settings page", () => {
  it("lists the routine days from the day after tomorrow, two weeks ahead", () => {
    const days = upcomingDays(FRIDAY, THU).map((d) => d.day);
    expect(days).toEqual(["2026-12-18"]); // 11/12 is tomorrow (the strip), 25/12 past two weeks
    expect(upcomingDays(127, THU)).toHaveLength(13);
    expect(upcomingDays(127, THU)[0].day).toBe("2026-12-12");
  });

  it("no points: says an exact address is needed, with the link", async () => {
    get.mockResolvedValue({ data: [] });
    render(<Form today={THU} />);
    expect((await screen.findByTestId("rescue-schedule-no-points")).textContent).toContain(s.no_points);
  });

  it("a point without an exact address shows why, and no form", async () => {
    get.mockResolvedValue({ data: [row({ exact: false, schedule: null })] });
    render(<Form today={THU} />);
    expect((await screen.findByTestId("rescue-schedule-not-exact")).textContent).toBe(s.point_not_exact);
    expect(screen.queryByTestId("rescue-schedule-save")).toBeNull();
  });

  it("a new routine cannot be saved before a day is picked", async () => {
    get.mockResolvedValue({ data: [row({ schedule: null })] });
    render(<Form today={THU} />);
    expect(await screen.findByTestId("rescue-schedule-none-picked")).toBeTruthy();
    expect(screen.getByTestId("rescue-schedule-save").disabled).toBe(true);
    expect(screen.queryByTestId("rescue-schedule-remove")).toBeNull();
  });

  it("saves the routine in agorot, with the days picked", async () => {
    get.mockResolvedValue({ data: [row({ schedule: null })] });
    render(<Form today={THU} />);
    const chips = await screen.findAllByTestId(/^rescue-schedule-day-/);
    fireEvent.click(chips[5]); // Friday
    fireEvent.change(screen.getByTestId("rescue-schedule-price"), { target: { value: "12" } });
    fireEvent.click(screen.getByTestId("rescue-schedule-save"));
    await waitFor(() => expect(put).toHaveBeenCalled());
    const [url, body] = put.mock.calls[0];
    expect(url).toBe(`/producers/me/rescue/locations/${L1}/schedule`);
    expect(body).toMatchObject({ weekdays: FRIDAY, price_agorot: 1200, qty: 4, pickup_start: "18:00", paused: false });
    expect((await screen.findByTestId("rescue-schedule-note")).textContent).toBe(s.saved);
  });

  it("many points: one form each; a day in the list toggles its skip", async () => {
    get.mockResolvedValue({ data: [row({}, { weekdays: FRIDAY }), row({ producer_location_id: L2, label: "הדוכן בשוק", schedule: null })] });
    render(<Form today={THU} />);
    expect(await screen.findAllByTestId("rescue-schedule-point")).toHaveLength(2);
    const [first] = screen.getAllByTestId("rescue-schedule-upcoming-day");
    expect(first.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(first);
    await waitFor(() => expect(put).toHaveBeenCalledWith(`/producers/me/rescue/locations/${L1}/schedule/skips/2026-12-18`));
  });

  it("a response of the wrong shape says the page could not load", async () => {
    get.mockResolvedValue({ data: [{ producer_location_id: "not-a-uuid" }] });
    render(<Form today={THU} />);
    expect(await screen.findByText(s.failed)).toBeTruthy();
    expect(screen.queryByTestId("rescue-schedule-point")).toBeNull();
  });

  it("a server refusal is shown in Hebrew", async () => {
    get.mockResolvedValue({ data: [row()] });
    put.mockRejectedValue({ response: { data: { detail: "האזור עוד לא פתוח לסלים" } } });
    render(<Form today={THU} />);
    fireEvent.click(await screen.findByTestId("rescue-schedule-save"));
    expect((await screen.findByTestId("rescue-schedule-note")).textContent).toBe("האזור עוד לא פתוח לסלים");
  });
});
