import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// MEH-1143: the homepage events preview fetches GET /events/upcoming on mount,
// then maps the result into cards. Mock next-intl (useTranslations + useLocale)
// and @/lib/api per the AdminNullGuards.test.jsx precedent.
vi.mock("next-intl", () => ({
  useTranslations: () => (key) => {
    const flat = {
      "home.events.heading": "אירועים קרובים",
      "home.events.all_events": "כל האירועים",
      "home.events.free": "חינם",
    };
    return flat[key] ?? key;
  },
  useLocale: () => "he",
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

  it("shows the canonical placeholder for an imageless event and none for an imaged one", async () => {
    apiResponseRef.current = { data: [IMAGED, IMAGELESS] };
    render(<UpcomingEventsPreview />);
    // Both titles render once the fetch resolves.
    await waitFor(() =>
      expect(screen.getByText("סדנת מאפים ביתיים")).toBeInTheDocument()
    );
    expect(screen.getByText("ארוחת שף בגינה")).toBeInTheDocument();
    // MEH-1143: the imageless event ALWAYS renders a fixed image area — the
    // canonical Leaf + "מהמקור" placeholder — exactly one, for the single
    // imageless event (the imaged one shows a CSS-background div, no testid).
    expect(screen.getAllByTestId("event-image-missing")).toHaveLength(1);
    expect(screen.getByText(BRAND_NAME)).toBeInTheDocument();
  });
});
