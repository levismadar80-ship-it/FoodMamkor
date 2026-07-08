import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-785: prove the 3 migrated date sites are locale-aware.
// `mockLocale` is mutable so each case drives he/en through useLocale().
// next-intl mocked per established precedent (see InfoTooltip.test.jsx).
let mockLocale = "he";
vi.mock("next-intl", () => ({
  useTranslations: () => (key, opts) =>
    key === "events_count" ? `${opts?.count ?? 0} events` : key,
  useLocale: () => mockLocale,
}));

import CalendarView from "@/components/CalendarView";

const LONG = { weekday: "long", day: "numeric", month: "long" };
const MONTH_YEAR = { month: "long", year: "numeric" };

// First-of-current-month — what the component seeds currentMonth to.
function firstOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
// Day 15 always exists in every month → a stable cell to assert against.
function day15() {
  const f = firstOfMonth();
  return new Date(f.getFullYear(), f.getMonth(), 15);
}

describe("CalendarView i18n (MEH-785)", () => {
  it("he locale: month label is byte-identical to the legacy he-IL output", () => {
    mockLocale = "he";
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const expected = firstOfMonth().toLocaleDateString("he-IL", MONTH_YEAR);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(expected);
  });

  it("en locale: month label renders English (the MEH-785 fix)", () => {
    mockLocale = "en";
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const expected = firstOfMonth().toLocaleDateString("en-US", MONTH_YEAR);
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(expected);
  });

  it("day-cell aria-label follows the active locale", () => {
    mockLocale = "en";
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const expected = day15().toLocaleDateString("en-US", LONG);
    expect(screen.getByRole("button", { name: expected })).toBeInTheDocument();
  });

  it("selected-day header is locale-aware (he byte-identical)", () => {
    mockLocale = "he";
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const expected = day15().toLocaleDateString("he-IL", LONG);
    fireEvent.click(screen.getByRole("button", { name: expected }));
    expect(screen.getByRole("heading", { level: 4 })).toHaveTextContent(expected);
  });
});

// EVENT-09 / MEH-1042: today/past/future day-cell visual states.
// System clock pinned mid-month so today, a past day, and a future day
// all land inside the rendered current month regardless of the real date.
describe("CalendarView today/past states (MEH-1042)", () => {
  const PINNED = new Date(2026, 5, 15, 12); // 2026-06-15, mid-month

  beforeEach(() => {
    mockLocale = "he";
    vi.useFakeTimers();
    vi.setSystemTime(PINNED);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Same locale mapping the passing i18n cases above rely on (he → he-IL).
  const label = (day) => new Date(2026, 5, day).toLocaleDateString("he-IL", LONG);

  it("today gets the gold ring (ring-accent), not muted", () => {
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const cell = screen.getByRole("button", { name: label(15) });
    expect(cell).toHaveClass("ring-accent");
    expect(cell).not.toHaveClass("text-fg-muted");
  });

  it("a past day renders muted (text-fg-muted), no ring", () => {
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const cell = screen.getByRole("button", { name: label(14) });
    expect(cell).toHaveClass("text-fg-muted");
    expect(cell).not.toHaveClass("ring-accent");
  });

  it("a future day keeps default text-text, neither muted nor ringed", () => {
    render(<CalendarView items={[]} linkPrefix="/events" />);
    const cell = screen.getByRole("button", { name: label(16) });
    expect(cell).toHaveClass("text-text");
    expect(cell).not.toHaveClass("text-fg-muted");
    expect(cell).not.toHaveClass("ring-accent");
  });
});
