import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// MEH-2497: EventEntryRow moved out of EventsClient into components/ so the
// home preview can reuse it. Guard the shared row directly, not only through
// a consumer: 0/1 image, free/paid, the experience branch, and `compact`.
vi.mock("next-intl", () => ({ useLocale: () => "he" }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import EventEntryRow, { toEventEntry } from "@/components/EventEntryRow";

const t = (k, vars) => (k === "organizer_line" ? `מארגן: ${vars.name}` : k);
const EVENT = {
  id: 7,
  title: "שוק גלם בכרמל",
  event_date: "2026-11-07",
  event_time: "09:00:00",
  producer_name: "שוק גלם",
  owner_kind: "organizer",
  city: "חיפה",
  category: "שוק",
  price: 0,
  image_url: null,
};
const EXPERIENCE = {
  id: 9,
  title: "קטיף בגולן",
  event_date: "2026-11-10",
  host: { name: "משק ברק" },
  city: "קצרין",
  is_recurring: true,
  recurring_schedule: " כל יום שישי ",
  price_per_person: 80,
  image_url: "https://res.cloudinary.com/demo/image/upload/a.jpg",
};

describe("EventEntryRow", () => {
  it("an event without a photo has two columns and no thumbnail", () => {
    const { container } = render(<EventEntryRow entry={toEventEntry(EVENT, "events", t)} freeLabel="חינם" />);
    expect(screen.queryByTestId("event-row-image")).toBeNull();
    expect(container.querySelector("a").className).toContain("grid-cols-[64px_1fr]");
    expect(screen.getByText("חינם")).toBeTruthy();
    expect(screen.getByText("מארגן: שוק גלם · חיפה")).toBeTruthy();
    expect(container.querySelector("a").getAttribute("href")).toBe("/events/7");
  });

  it("an experience with a photo shows the thumbnail, host, schedule and price", () => {
    const { container } = render(
      <EventEntryRow entry={toEventEntry(EXPERIENCE, "experiences", t)} freeLabel="חינם" />,
    );
    const img = screen.getByTestId("event-row-image");
    expect(img.className).not.toContain("lg:hidden");
    expect(screen.getByText("משק ברק · קצרין · כל יום שישי")).toBeTruthy();
    expect(screen.queryByText("חינם")).toBeNull();
    expect(container.querySelector("a").getAttribute("href")).toBe("/experiences/9");
    expect(container.querySelector("a").className).not.toContain("lg:grid-cols-[104px_1fr]");
  });

  it("compact drops the thumbnail from lg (3-up home grid is too narrow for it)", () => {
    const { container } = render(
      <EventEntryRow entry={toEventEntry(EXPERIENCE, "experiences", t)} freeLabel="חינם" compact />,
    );
    expect(screen.getByTestId("event-row-image").className).toContain("lg:hidden");
    expect(container.querySelector("a").className).toContain("lg:grid-cols-[104px_1fr]");
  });
});
