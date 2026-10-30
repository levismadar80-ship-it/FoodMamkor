import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2604 — free-text hours (the location form's own example is Hebrew:
// «למשל: ימים א׳–ה׳, 9:00–17:00») must reach the producer page, and every
// time range must render left-to-right inside the RTL row.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => ({ today: "היום", closed_day: "סגור" })[key] ?? key,
}));
vi.mock("@phosphor-icons/react", () => ({
  Clock: () => <span data-testid="clock-icon" />,
  CaretDown: () => <span />,
  CaretUp: () => <span />,
}));

import OpeningHours from "@/components/OpeningHours";
import HoursText from "@/components/HoursText";

// The exact string the staging sweep entered through the location form.
const HEBREW_HOURS = "א'–ה' 07:00–14:00, ו' 07:00–13:00";

describe("OpeningHours — unparseable free text (MEH-2604)", () => {
  it("shows the owner's text instead of rendering nothing", () => {
    render(<OpeningHours opening_hours={HEBREW_HOURS} />);
    const row = screen.getByTestId("hours-raw");
    expect(row.textContent).toBe(HEBREW_HOURS);
  });

  it("isolates each time range left-to-right", () => {
    render(<OpeningHours opening_hours={HEBREW_HOURS} />);
    const ltr = [...screen.getByTestId("hours-raw").querySelectorAll('[dir="ltr"]')].map(
      (el) => el.textContent,
    );
    expect(ltr).toEqual(["07:00–14:00", "07:00–13:00"]);
  });

  it("still opens the weekly table for the structured format", () => {
    render(<OpeningHours opening_hours="Sun-Sat 09:00-17:00" />);
    expect(screen.queryByTestId("hours-raw")).toBeNull();
    expect(screen.getByTestId("hours-toggle")).toBeInTheDocument();
  });

  it("renders nothing for an empty or whitespace string", () => {
    const { container } = render(<OpeningHours opening_hours="   " />);
    expect(container.firstChild).toBeNull();
  });
});

describe("HoursText", () => {
  it("wraps a pickup-row range typed with an en dash", () => {
    const { container } = render(
      <p>
        <HoursText text="ה' 16:00–19:00" />
      </p>,
    );
    expect(container.textContent).toBe("ה' 16:00–19:00");
    expect(container.querySelector('[dir="ltr"]').textContent).toBe("16:00–19:00");
  });

  it("leaves text without a range as one plain run", () => {
    const { container } = render(
      <p>
        <HoursText text="בתיאום מראש" />
      </p>,
    );
    expect(container.querySelector('[dir="ltr"]')).toBeNull();
    expect(container.textContent).toBe("בתיאום מראש");
  });

  it("does not split a phone number typed into the hours field", () => {
    const { container } = render(
      <p>
        <HoursText text="בתיאום בטלפון 050-1234567" />
      </p>,
    );
    expect(container.querySelector('[dir="ltr"]')).toBeNull();
    expect(container.textContent).toBe("בתיאום בטלפון 050-1234567");
  });
});
