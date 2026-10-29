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

// MEH-2559: the heart needs AuthProvider; its behaviour is SaveButton.test.jsx's.
// A stub that names its props, so where and for what it renders is checkable.
vi.mock("@/components/SaveButton", () => ({
  default: ({ itemType, itemId, variant }) => (
    <button type="button" data-testid={`save-${itemType}`} data-id={String(itemId)} data-variant={variant} />
  ),
}));

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
  // MEH-2546: no row is left without a picture — event photo → the owner's
  // first photo (marked with the owner's initial) → a category tile.
  it("an event with no photo and an owner with none gets the category tile", () => {
    const { container } = render(<EventEntryRow entry={toEventEntry(EVENT, "events", t)} freeLabel="חינם" />);
    const tile = screen.getByTestId("event-row-image");
    expect(tile.getAttribute("data-kind")).toBe("category");
    expect(tile.style.backgroundImage).toBe("");
    expect(tile.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("a").className).toContain("grid-cols-[64px_1fr_auto]");
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

  it("an event with no photo falls back to the owner's first photo, marked with the owner's initial", () => {
    const owned = { ...EVENT, owner_image_url: "https://res.cloudinary.com/demo/image/upload/owner.jpg" };
    render(<EventEntryRow entry={toEventEntry(owned, "events", t)} freeLabel="חינם" />);
    const img = screen.getByTestId("event-row-image");
    expect(img.getAttribute("data-kind")).toBe("owner");
    expect(img.style.backgroundImage).toContain("owner.jpg");
    expect(screen.getByTestId("event-row-owner-initial").textContent).toBe("ש");
  });

  it("an owner photo with no owner name shows the photo but no empty initial badge", () => {
    const nameless = {
      ...EVENT,
      producer_name: "  ",
      owner_image_url: "https://res.cloudinary.com/demo/image/upload/owner.jpg",
    };
    render(<EventEntryRow entry={toEventEntry(nameless, "events", t)} freeLabel="חינם" />);
    expect(screen.getByTestId("event-row-image").getAttribute("data-kind")).toBe("owner");
    expect(screen.queryByTestId("event-row-owner-initial")).toBeNull();
  });

  it("a photo URL with a quote or parenthesis stays inside one quoted url()", () => {
    const odd = { ...EVENT, image_url: 'https://cdn.example.com/a b)"c.jpg' };
    render(<EventEntryRow entry={toEventEntry(odd, "events", t)} freeLabel="חינם" />);
    const bg = screen.getByTestId("event-row-image").style.backgroundImage;
    expect(bg).toContain("a b)");
    expect(bg.startsWith('url("')).toBe(true);
  });

  it("the event's own photo wins over the owner's, with no initial badge", () => {
    const both = {
      ...EVENT,
      image_url: "https://res.cloudinary.com/demo/image/upload/event.jpg",
      owner_image_url: "https://res.cloudinary.com/demo/image/upload/owner.jpg",
    };
    render(<EventEntryRow entry={toEventEntry(both, "events", t)} freeLabel="חינם" />);
    const img = screen.getByTestId("event-row-image");
    expect(img.getAttribute("data-kind")).toBe("event");
    expect(img.style.backgroundImage).toContain("event.jpg");
    expect(screen.queryByTestId("event-row-owner-initial")).toBeNull();
  });

  it("compact moves the picture to a top band from lg instead of dropping it", () => {
    const { container } = render(
      <EventEntryRow entry={toEventEntry(EXPERIENCE, "experiences", t)} freeLabel="חינם" compact />,
    );
    expect(screen.getByTestId("event-row-image").className).toContain("lg:hidden");
    const band = screen.getByTestId("event-row-band");
    expect(band.className).toContain("lg:grid");
    expect(band.style.backgroundImage).toContain("a.jpg");
    expect(container.querySelector("a").className).toContain("lg:grid-cols-[104px_1fr]");
  });

  it("compact with no picture anywhere still gets a category band, not an empty strip", () => {
    render(<EventEntryRow entry={toEventEntry(EVENT, "events", t)} freeLabel="חינם" compact />);
    const band = screen.getByTestId("event-row-band");
    expect(band.style.backgroundImage).toBe("");
    expect(band.querySelector("svg")).toBeTruthy();
  });

  // MEH-2559: the heart rides every row, typed by the row's species, and sits
  // OUTSIDE the row link — a button inside an <a> would follow the link.
  it("an event row carries an event heart beside the link, not inside it", () => {
    const { container } = render(<EventEntryRow entry={toEventEntry(EVENT, "events", t)} freeLabel="חינם" />);
    const heart = screen.getByTestId("save-event");
    expect(heart.getAttribute("data-id")).toBe("7");
    expect(heart.getAttribute("data-variant")).toBe("row");
    expect(container.querySelector("a").contains(heart)).toBe(false);
    expect(screen.queryByTestId("save-experience")).toBeNull();
  });

  it("an experience row carries an experience heart", () => {
    render(<EventEntryRow entry={toEventEntry(EXPERIENCE, "experiences", t)} freeLabel="חינם" />);
    expect(screen.getByTestId("save-experience").getAttribute("data-id")).toBe("9");
    expect(screen.queryByTestId("save-event")).toBeNull();
  });
});
