import { describe, it, expect, vi } from "vitest";
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
