import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// MEH-1334 chunk 3 — collapsed hours disclosure: "היום · HH:MM–HH:MM" in
// NEUTRAL ink (no green status line, no "פתוח"), tap to expand the weekly
// table, today highlighted by font-weight only, every range dir="ltr".
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      today: "היום",
      closed_day: "סגור",
      open_now: "פתוח עכשיו",
      "weekdays.sun": "יום ראשון",
      "weekdays.mon": "יום שני",
      "weekdays.tue": "יום שלישי",
      "weekdays.wed": "יום רביעי",
      "weekdays.thu": "יום חמישי",
      "weekdays.fri": "יום שישי",
      "weekdays.sat": "שבת",
    };
    return flat[key] ?? key;
  },
}));
vi.mock("@phosphor-icons/react", () => ({
  Clock: () => <span data-testid="clock-icon" />,
  CaretDown: () => <span data-testid="caret-down" />,
  CaretUp: () => <span data-testid="caret-up" />,
}));

import OpeningHours from "@/components/OpeningHours";

// Every day open 09:00-17:00 → "today" always has a range regardless of when
// the test runs (todayIndex is real Israel-tz time).
const ALL_WEEK = "Sun-Sat 09:00-17:00";

describe("OpeningHours collapsed disclosure (MEH-1334)", () => {
  it("renders nothing without parseable hours", () => {
    const { container } = render(<OpeningHours opening_hours={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("collapsed: today's range only, dir=ltr, neutral (no green status text)", () => {
    render(<OpeningHours opening_hours={ALL_WEEK} />);
    const toggle = screen.getByTestId("hours-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle.textContent).toContain("היום");
    const range = screen.getByText("09:00–17:00");
    expect(range).toHaveAttribute("dir", "ltr");
    // the pre-1334 status line is gone — no "פתוח עכשיו", no status classes
    expect(screen.queryByText("פתוח עכשיו")).not.toBeInTheDocument();
    expect(screen.queryByTestId("hours-week")).not.toBeInTheDocument();
  });

  it("expands to the 7-day table; closed day shows סגור; ranges dir=ltr", () => {
    render(<OpeningHours opening_hours="Sun-Fri 09:00-17:00" />);
    fireEvent.click(screen.getByTestId("hours-toggle"));
    const week = screen.getByTestId("hours-week");
    expect(week).toBeInTheDocument();
    expect(screen.getByTestId("hours-toggle")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("שבת")).toBeInTheDocument();
    // Saturday is closed in this fixture
    expect(week.textContent).toContain("סגור");
    // 6 open rows each carry an LTR-isolated range
    const ranges = week.querySelectorAll('[dir="ltr"]');
    expect(ranges.length).toBe(6);
  });

  it("today's row is highlighted via font-weight only (no color class)", () => {
    render(<OpeningHours opening_hours={ALL_WEEK} />);
    fireEvent.click(screen.getByTestId("hours-toggle"));
    const week = screen.getByTestId("hours-week");
    const bold = week.querySelectorAll(".font-semibold");
    expect(bold.length).toBe(1); // exactly one today-row
    expect(bold[0].className).not.toMatch(/text-primary|green/);
  });
});
