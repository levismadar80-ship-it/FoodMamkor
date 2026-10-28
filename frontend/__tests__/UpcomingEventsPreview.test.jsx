import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-1143: the homepage events preview fetches GET /events/upcoming on mount,
// then maps the result into cards. Mock next-intl (useTranslations + useLocale)
// and @/lib/api per the AdminNullGuards.test.jsx precedent.
vi.mock("next-intl", () => ({
  useTranslations: (ns) => (k, vars) => {
    const key = ns ? `${ns}.${k}` : k;
    if (key === "events.list.organizer_line") return `מארגן: ${vars.name}`;
    const flat = {
      "home.events.heading": "אירועים קרובים",
      "home.events.all_events": "כל האירועים",
      "home.events.free": "חינם",
    };
    return flat[key] ?? key;
  },
  useLocale: () => "he",
}));

// MEH-2497: the rows link through next-intl's Link (keeps /en). The stub marks
// its anchors, so a plain next/link anchor (which drops /en) is told apart.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }) => (
    <a data-intl-link="" href={typeof href === "string" ? href : "#"} {...props}>
      {children}
    </a>
  ),
}));

const apiResponseRef = { current: { data: [] } };
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve(apiResponseRef.current)),
  },
}));

import { UpcomingEventsPreview } from "@/app/[locale]/home/UpcomingEventsPreview";
import { BRAND_NAME } from "@/lib/constants";

const IMAGED = {
  id: 1,
  title: "ארוחת שף בגינה",
  image_url: "https://res.cloudinary.com/demo/image/upload/food.jpg",
  event_date: "2026-08-15",
  event_time: "18:30:00",
  producer_name: "מטבח נעמה",
  city: "תל אביב",
  price: 120,
};
const IMAGELESS = {
  id: 2,
  title: "סדנת מאפים ביתיים",
  image_url: null,
  event_date: "2026-08-20",
  event_time: "19:00:00",
  producer_name: "המאפייה של דנה",
  city: "חיפה",
  price: 0,
};

describe("UpcomingEventsPreview", () => {
  beforeEach(() => {
    apiResponseRef.current = { data: [] };
  });

  it("renders nothing when there are no upcoming events", async () => {
    apiResponseRef.current = { data: [] };
    const { container } = render(<UpcomingEventsPreview />);
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("MEH-2497: a thumbnail only for the event with a photo — no placeholder box for the one without", async () => {
    apiResponseRef.current = { data: [IMAGED, IMAGELESS] };
    render(<UpcomingEventsPreview />);
    // Both titles render once the fetch resolves.
    await waitFor(() =>
      expect(screen.getByText("סדנת מאפים ביתיים")).toBeInTheDocument()
    );
    expect(screen.getByText("ארוחת שף בגינה")).toBeInTheDocument();
    // The /events row (MEH-2468): one thumbnail, for the one imaged event.
    expect(screen.getAllByTestId("event-row-image")).toHaveLength(1);
    // MEH-1143's fixed image area (Leaf + «מהמקור») is gone.
    expect(screen.queryByTestId("event-image-missing")).toBeNull();
    expect(screen.queryByText(BRAND_NAME)).toBeNull();
  });

  it("MEH-2497: rows and «all events» link through next-intl's Link (keeps /en)", async () => {
    apiResponseRef.current = { data: [IMAGELESS] };
    const { container } = render(<UpcomingEventsPreview />);
    await waitFor(() => expect(screen.getByText("סדנת מאפים ביתיים")).toBeInTheDocument());
    const links = [...container.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.hasAttribute("data-intl-link")]);
    expect(links).toEqual([["/events", true], ["/events/2", true]]);
  });

  it("MEH-2468: an organizer's event reads «מארגן: {name}»; a business keeps its bare name", async () => {
    apiResponseRef.current = {
      data: [
        { ...IMAGED, producer_name: "שוק גלם", owner_kind: "organizer", owner_slug: "gelem" },
        { ...IMAGELESS, owner_kind: "producer" },
      ],
    };
    render(<UpcomingEventsPreview />);
    await waitFor(() => expect(screen.getByText(/מארגן: שוק גלם/)).toBeInTheDocument());
    expect(screen.getByText(/המאפייה של דנה/).textContent).not.toMatch(/מארגן/);
  });

  it("MEH-2469: a start–end range renders inside an LTR isolate (no «15:00–09:30» flip)", async () => {
    apiResponseRef.current = { data: [{ ...IMAGED, event_time: "09:30:00", end_time: "15:00:00" }] };
    render(<UpcomingEventsPreview />);
    const range = await screen.findByText("09:30–15:00");
    expect(range.getAttribute("dir")).toBe("ltr");
  });
});

