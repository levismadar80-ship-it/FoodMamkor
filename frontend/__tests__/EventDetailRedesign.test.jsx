/**
 * MEH-2548 — the redesigned event page: cover / green band, the «מחר»-style
 * chip, Waze + Google from the address, «עוד אירועים של…», and the past-event
 * notice that points at the owner's next event. Harness:
 * EventDetailOrganizer.test.jsx. "Today" is pinned to 29/10/2026.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import api from "@/lib/api";
import EventDetailClient from "@/app/[locale]/events/[id]/EventDetailClient";

// MEH-2559: the heart needs AuthProvider; its behaviour is SaveButton.test.jsx's.
// A stub that names its props, so where and for what it renders is checkable.
vi.mock("@/components/SaveButton", () => ({
  default: ({ itemType, itemId, variant }) => (
    <button type="button" data-testid={`save-${itemType}`} data-id={String(itemId)} data-variant={variant} />
  ),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "ev-1" }) }));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, v) => `${ns}.${k}${v ? ` ${Object.values(v).join(" ")}` : ""}`,
  useLocale: () => "he",
}));
vi.mock("@phosphor-icons/react", () => {
  const Stub = () => null;
  return {
    Basket: Stub, Calendar: Stub, CalendarBlank: Stub, CalendarPlus: Stub, CaretLeft: Stub, Coins: Stub,
    CookingPot: Stub, Drop: Stub, Leaf: Stub, MapPin: Stub, MapTrifold: Stub, Path: Stub, Plant: Stub,
    Storefront: Stub, UsersThree: Stub,
  };
});
vi.mock("@/components/ShareButton", () => ({ default: () => <span data-testid="share-button" /> }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u, IMAGE_RATIOS: {} }));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "DATE" }));
vi.mock("@/components/Breadcrumb", () => ({ default: () => null }));
vi.mock("@/lib/israel-date", () => ({ israelToday: () => "2026-10-29" }));

const base = {
  id: "ev-1",
  producer_id: "p-1",
  producer_name: "שוק גלם",
  owner_kind: "organizer",
  owner_slug: "gelem",
  title: "שוק גלם בנמל",
  event_date: "2026-11-20",
  city: "תל אביב",
  location: "האנגר 11",
  category: "שוק",
  price: 0,
  image_url: null,
};
const other = (id, date) => ({ ...base, id, title: `אירוע ${id}`, event_date: date });

async function renderEvent(extra = {}, more = []) {
  api.get.mockImplementation((url) =>
    Promise.resolve({ data: url === "/events" ? more : { ...base, ...extra } }),
  );
  render(<EventDetailClient />);
  await screen.findByRole("heading", { level: 1 });
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2548 — cover", () => {
  it("no photo → a green band, never an empty frame", async () => {
    await renderEvent();
    expect(screen.getByTestId("event-cover-band")).toBeTruthy();
    expect(screen.queryByTestId("event-cover")).toBeNull();
    expect(screen.getByTestId("event-date-tile")).toBeTruthy();
  });

  it("a photo URL with a quote or parenthesis stays inside one quoted url()", async () => {
    await renderEvent({ image_url: 'https://cdn.example.com/a b)"c.jpg' });
    const bg = screen.getByTestId("event-cover").style.backgroundImage;
    expect(bg).toContain("a b)");
    expect(bg.startsWith('url("')).toBe(true);
  });

  it("a photo → the cover image", async () => {
    await renderEvent({ image_url: "https://res.cloudinary.com/x/image/upload/e.jpg" });
    expect(screen.getByTestId("event-cover").style.backgroundImage).toContain("e.jpg");
    expect(screen.queryByTestId("event-cover-band")).toBeNull();
  });
});

describe("MEH-2548 — when chip", () => {
  it.each([
    ["2026-10-29", "events.detail.when_today"],
    ["2026-10-30", "events.detail.when_tomorrow"],
    ["2026-10-31", "events.detail.when_this_week"],
  ])("%s → %s", async (date, label) => {
    await renderEvent({ event_date: date });
    expect(screen.getByTestId("event-when").textContent).toBe(label);
  });

  it("more than a week away → no chip", async () => {
    await renderEvent();
    expect(screen.queryByTestId("event-when")).toBeNull();
  });
});

describe("MEH-2548 — navigation from the address", () => {
  it("no map point → Waze + Google built from place and city", async () => {
    await renderEvent();
    const links = screen.getByTestId("event-nav-links").querySelectorAll("a");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toContain(encodeURIComponent("האנגר 11, תל אביב"));
    expect(screen.queryByTestId("minimap")).toBeNull();
  });

  // MEH-2588: each button carries its app's mark (same glyphs as the
  // business-page map), and Google's visible name is its accessible name.
  it("address links show the Waze and Google marks", async () => {
    await renderEvent();
    const [waze, google] = screen.getByTestId("event-nav-links").querySelectorAll("a");
    expect(waze.querySelector("svg")).toBeTruthy();
    expect(google.querySelector("svg clipPath")).toBeTruthy();
    expect(google.hasAttribute("aria-label")).toBe(false);
  });

  it("a map point → the map (with its own buttons), no address links", async () => {
    await renderEvent({ lat: 32.1, lng: 34.8 });
    expect(screen.getByTestId("minimap")).toBeTruthy();
    expect(screen.queryByTestId("event-nav-links")).toBeNull();
  });
});

describe("MEH-2548 — more events of the same owner", () => {
  it("0 others (the list holds only this event) → no section", async () => {
    await renderEvent({}, [base]);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith("/events", { params: { producer_id: "p-1" } }));
    expect(screen.queryByTestId("event-more")).toBeNull();
  });

  it("1 other → the section with one row, this event excluded", async () => {
    await renderEvent({}, [base, other("e2", "2026-11-27")]);
    const section = await screen.findByTestId("event-more");
    expect(section.querySelector("h2").textContent).toBe("events.detail.more_from שוק גלם");
    expect([...section.querySelectorAll("li a")].map((a) => a.getAttribute("href"))).toEqual(["/events/e2"]);
  });

  it("many → at most three rows", async () => {
    await renderEvent({}, [other("e2", "2026-11-27"), other("e3", "2026-12-04"), other("e4", "2026-12-11"), other("e5", "2026-12-18")]);
    const section = await screen.findByTestId("event-more");
    expect(section.querySelectorAll("li")).toHaveLength(3);
  });
});

describe("MEH-2548 — an event that already happened", () => {
  it("shows the notice and the owner's next event; no calendar button, no register CTA", async () => {
    await renderEvent(
      { event_date: "2026-10-20", registration_url: "https://x.test/r" },
      [other("e2", "2026-11-27"), other("e3", "2026-12-04")],
    );
    const notice = await screen.findByTestId("event-past-notice");
    await waitFor(() => expect(screen.getByTestId("event-past-next")).toBeTruthy());
    expect(notice.querySelector("p").textContent).toBe(
      "events.detail.past_notice events.detail.past_next שוק גלם",
    );
    expect(screen.getByTestId("event-past-next").querySelector("a").getAttribute("href")).toBe("/events/e2");
    // The next one is not repeated in «more events».
    expect([...screen.getByTestId("event-more").querySelectorAll("li a")].map((a) => a.getAttribute("href"))).toEqual([
      "/events/e3",
    ]);
    expect(screen.queryByTestId("event-add-to-calendar")).toBeNull();
    expect(screen.queryByText("events.detail.register")).toBeNull();
    expect(screen.queryByTestId("event-when")).toBeNull();
  });

  it("no next event → the notice alone, no dangling «the next one:»", async () => {
    await renderEvent({ event_date: "2026-10-20" }, []);
    const notice = screen.getByTestId("event-past-notice");
    expect(notice.textContent).toBe("events.detail.past_notice");
  });
});

describe("MEH-2548 — byline under the title", () => {
  it("an organizer's event: links to the organizer page", async () => {
    await renderEvent();
    const by = screen.getByTestId("event-byline");
    expect(by.getAttribute("href")).toBe("/organizers/gelem");
    expect(by.textContent).toContain("events.detail.organizer_line שוק גלם");
  });

  it("a business's event: links to the business page", async () => {
    await renderEvent({ owner_kind: "producer", producer_name: "חוות הניסוי" });
    expect(screen.getByTestId("event-byline").getAttribute("href")).toBe("/producer/p-1");
  });
});

// MEH-2559: the heart sits on the cover's corner (photo or band), and stays on
// a past event (the saved list keeps past events, labelled «עברו»).
describe("MEH-2559 — save heart", () => {
  it("no photo: a heart for this event on the band's corner, none in the action row", async () => {
    await renderEvent();
    const hearts = [...screen.getByTestId("event-cover-actions").querySelectorAll('[data-testid="save-event"]')];
    expect(hearts).toHaveLength(1);
    expect(hearts[0].getAttribute("data-id")).toBe("ev-1");
    expect(screen.getByTestId("event-actions").querySelector('[data-testid="save-event"]')).toBeNull();
  });

  it("a photo: the heart is still there", async () => {
    await renderEvent({ image_url: "https://res.cloudinary.com/x/image/upload/e.jpg" });
    expect(screen.getByTestId("event-cover-actions").querySelector('[data-testid="save-event"]')).toBeTruthy();
  });

  it("a past event keeps its heart though the calendar button goes", async () => {
    await renderEvent({ event_date: "2026-10-20" });
    expect(screen.queryByTestId("event-add-to-calendar")).toBeNull();
    expect(screen.getByTestId("event-cover-actions").querySelector('[data-testid="save-event"]')).toBeTruthy();
  });
});
