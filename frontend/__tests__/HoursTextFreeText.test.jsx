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

import HoursText from "@/components/HoursText";

// MEH-2810: the OpeningHours free-text cases moved to
// ProducerHoursSection.test.jsx, against the card the page renders.

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
