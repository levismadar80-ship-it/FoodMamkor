import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

// MEH-785: prove the date sites are locale-aware.
// `mockLocale` is mutable so each case drives he/en through useLocale().
// next-intl mocked per established precedent (see InfoTooltip.test.jsx).
let mockLocale = "he";
vi.mock("next-intl", () => ({
  useTranslations: () => (key, opts) => {
    if (key === "events_count") return `${opts?.count ?? 0} events`;
    if (opts?.month) return `${key}:${opts.month}`;
    return key;
  },
  useLocale: () => mockLocale,
}));

import CalendarView from "@/components/CalendarView";

const LONG = { weekday: "long", day: "numeric", month: "long" };
const MONTH_YEAR = { month: "long", year: "numeric" };
const renderItem = (row) => <span data-testid="row">{row.title}</span>;

// Every case pins the clock to 2026-06-10 so "today", past days and future
// days are fixed cells regardless of when the suite runs.
const PINNED = new Date(2026, 5, 10, 12);
const label = (day, loc = "he-IL") => new Date(2026, 5, day).toLocaleDateString(loc, LONG);
const iso = (day) => `2026-06-${String(day).padStart(2, "0")}`;
const ev = (id, day, extra = {}) => ({ id, title: `ev${id}`, event_date: iso(day), ...extra });
const cell = (day, loc) =>
  screen.getByRole("button", { name: new RegExp(`^${label(day, loc)}`) });

beforeEach(() => {
  mockLocale = "he";
  vi.useFakeTimers();
  vi.setSystemTime(PINNED);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarView i18n (MEH-785)", () => {
  it("he locale: month label is byte-identical to the legacy he-IL output", () => {
    render(<CalendarView items={[]} renderItem={renderItem} />);
    const expected = new Date(2026, 5, 1).toLocaleDateString("he-IL", MONTH_YEAR);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(expected);
  });

  it("en locale: month label renders English", () => {
    mockLocale = "en";
    render(<CalendarView items={[]} renderItem={renderItem} />);
    const expected = new Date(2026, 5, 1).toLocaleDateString("en-US", MONTH_YEAR);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(expected);
  });

  it("day-cell aria-label follows the active locale", () => {
    mockLocale = "en";
    render(<CalendarView items={[]} renderItem={renderItem} />);
    expect(cell(15, "en-US")).toBeInTheDocument();
  });
});

// MEH-1042 + MEH-2771: today / past / with-events / without-events cells.
describe("CalendarView day cells (MEH-2771)", () => {
  it("today gets the accent ring and the «היום» label", () => {
    render(<CalendarView items={[]} renderItem={renderItem} />);
    const today = cell(10);
    expect(today).toHaveClass("ring-accent");
    expect(within(today).getByTestId("calendar-today-label")).toHaveTextContent("today");
  });

  it("a future day with events is filled, bold, clickable, with one dot per event", () => {
    render(<CalendarView items={[ev(1, 16), ev(2, 16)]} renderItem={renderItem} />);
    const day = cell(16);
    expect(day).toHaveClass("bg-green-50", "font-bold");
    expect(day).not.toBeDisabled();
    expect(day).toHaveAttribute("data-has-events", "true");
    expect(day).toHaveAccessibleName(`${label(16)}, 2 events`);
    expect(within(day).getByTestId("calendar-day-dots").children).toHaveLength(2);
  });

  it("today with events shows both «היום» and its dots", () => {
    render(<CalendarView items={[ev(1, 10)]} renderItem={renderItem} />);
    const today = cell(10);
    expect(within(today).getByTestId("calendar-today-label")).toBeInTheDocument();
    expect(within(today).getByTestId("calendar-day-dots").children).toHaveLength(1);
  });

  it("dots stop at 3 for a busy day", () => {
    render(
      <CalendarView items={[ev(1, 16), ev(2, 16), ev(3, 16), ev(4, 16)]} renderItem={renderItem} />,
    );
    expect(within(cell(16)).getByTestId("calendar-day-dots").children).toHaveLength(3);
  });

  it("a future day without events is muted and not clickable", () => {
    render(<CalendarView items={[ev(1, 16)]} renderItem={renderItem} />);
    const day = cell(17);
    expect(day).toBeDisabled();
    expect(day).toHaveClass("text-fg-muted");
    expect(day).not.toHaveClass("bg-green-50");
  });

  it("a past day is muted and not clickable even when it had an event", () => {
    render(<CalendarView items={[ev(1, 5)]} renderItem={renderItem} />);
    const day = cell(5);
    expect(day).toBeDisabled();
    expect(day).toHaveClass("text-fg-muted", "opacity-50");
    expect(day).not.toHaveClass("bg-green-50");
  });
});

// The 5-state rule: list rows × (0 / 1 / many) × (no day selected / selected).
describe("CalendarView month list (MEH-2771)", () => {
  it("0 events: the empty line, no rows", () => {
    render(<CalendarView items={[]} renderItem={renderItem} />);
    expect(screen.getByTestId("calendar-month-empty")).toHaveTextContent("empty_month");
    expect(screen.queryAllByTestId("calendar-list-item")).toHaveLength(0);
  });

  it("experiences get their own heading and empty line", () => {
    render(<CalendarView items={[]} renderItem={renderItem} kind="experiences" />);
    expect(screen.getByRole("heading", { level: 4 }).textContent).toMatch(/^list_heading_experiences:/);
    expect(screen.getByTestId("calendar-month-empty")).toHaveTextContent("empty_month_experiences");
  });

  it("1 event: listed before any click, nothing highlighted", () => {
    render(<CalendarView items={[ev(1, 20)]} renderItem={renderItem} />);
    const rows = screen.getAllByTestId("calendar-list-item");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("ev1");
    expect(rows[0]).toHaveAttribute("data-selected", "false");
    expect(screen.getByRole("heading", { level: 4 }).textContent).toMatch(/^list_heading:/);
  });

  it("many events: sorted by day then time, past days and other months left out", () => {
    const items = [
      ev(1, 25),
      ev(2, 12, { event_time: "18:00" }),
      ev(3, 12, { event_time: "09:00" }),
      ev(4, 3), // past
      { id: 5, title: "ev5", event_date: "2026-07-02" }, // next month
    ];
    render(<CalendarView items={items} renderItem={renderItem} />);
    const titles = screen.getAllByTestId("row").map((n) => n.textContent);
    expect(titles).toEqual(["ev3", "ev2", "ev1"]);
  });

  it("many events, a day selected: only that day's rows are highlighted; a second click clears it", () => {
    const items = [ev(1, 12), ev(2, 12), ev(3, 25)];
    render(<CalendarView items={items} renderItem={renderItem} />);
    fireEvent.click(cell(12));
    expect(cell(12)).toHaveAttribute("aria-pressed", "true");
    expect(cell(12)).toHaveClass("ring-primary");
    const selected = screen
      .getAllByTestId("calendar-list-item")
      .map((r) => r.getAttribute("data-selected"));
    expect(selected).toEqual(["true", "true", "false"]);

    fireEvent.click(cell(12));
    expect(cell(12)).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getAllByTestId("calendar-list-item").every((r) => r.getAttribute("data-selected") === "false"),
    ).toBe(true);
  });

  it("switching month clears the selection and lists the new month", () => {
    const items = [ev(1, 12), { id: 2, title: "ev2", event_date: "2026-07-02" }];
    render(<CalendarView items={items} renderItem={renderItem} />);
    fireEvent.click(cell(12));
    fireEvent.click(screen.getByRole("button", { name: "next_month" }));
    const rows = screen.getAllByTestId("calendar-list-item");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("ev2");
    expect(rows[0]).toHaveAttribute("data-selected", "false");
  });
});
