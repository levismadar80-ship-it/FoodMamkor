/**
 * MEH-2549 — the experience page in the event page's structure: cover / gold
 * band, host byline, share («שיתוף החוויה») + «הוספה ליומן», address-built
 * navigation for public venues only. Harness: ExperienceDetailDetails.test.jsx
 * (real he.json). "Today" is pinned to 29/10/2026.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import ExperienceDetailClient from "@/app/[locale]/experiences/[id]/ExperienceDetailClient";

// MEH-2559: the heart needs AuthProvider; its behaviour is SaveButton.test.jsx's.
// A stub that names its props, so where and for what it renders is checkable.
vi.mock("@/components/SaveButton", () => ({
  default: ({ itemType, itemId, variant }) => (
    <button type="button" data-testid={`save-${itemType}`} data-id={String(itemId)} data-variant={variant} />
  ),
}));

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "x-1" }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="minimap" /> }));
vi.mock("@/components/Breadcrumb", () => ({
  default: ({ className }) => <nav data-testid="breadcrumb" className={className} />,
}));
vi.mock("@/lib/israel-date", () => ({ israelToday: () => "2026-10-29" }));

const BASE = {
  id: "x-1",
  title: "סדנת מחמצת",
  description: "סדנה של בוקר שלם",
  event_date: "2026-11-20",
  event_time: "10:00:00",
  city: "חיפה",
  address: "רחוב הנמל 5",
  location_type: "public",
  price_per_person: 120,
  status: "approved",
  is_recurring: false,
  recurring_schedule: null,
  duration_minutes: 90,
  image_url: null,
  host: { id: "u1", name: "נועה", producer_id: "p-1", producer_slug: "ruach", producer_name: "מאפיית רוח השדה" },
};

async function renderWith(extra = {}) {
  api.get.mockResolvedValue({ data: { ...BASE, ...extra } });
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <ExperienceDetailClient />
    </NextIntlClientProvider>,
  );
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2549 — cover", () => {
  it("no photo → a gold band, never an empty frame", async () => {
    await renderWith();
    expect(screen.getByTestId("experience-cover-band")).toBeTruthy();
    expect(screen.queryByTestId("experience-cover")).toBeNull();
  });

  it("a photo → the cover, sized through Cloudinary", async () => {
    await renderWith({ image_url: "https://res.cloudinary.com/demo/image/upload/v1/bread.jpg" });
    const bg = screen.getByTestId("experience-cover").style.backgroundImage;
    expect(bg).toContain("bread.jpg");
    expect(bg).toContain("w_1280");
  });

  it("a photo URL with a quote or parenthesis stays inside one quoted url()", async () => {
    await renderWith({ image_url: 'https://cdn.example.com/a b)"c.jpg' });
    const bg = screen.getByTestId("experience-cover").style.backgroundImage;
    expect(bg).toContain("a b)");
    expect(bg.startsWith('url("')).toBe(true);
  });
});

describe("MEH-2549 — byline", () => {
  it("a host with a business: links to the business page under the title", async () => {
    await renderWith();
    const by = screen.getByTestId("experience-byline");
    expect(by.getAttribute("href")).toBe("/ruach");
    expect(by.textContent).toContain(`${he.experiences.detail.host_label} מאפיית רוח השדה`);
  });

  it("a host without one: plain text, no link", async () => {
    await renderWith({ host: { id: "u2", name: "נועה" } });
    expect(screen.getByTestId("experience-byline").tagName).toBe("P");
  });
});

describe("MEH-2549 — share + calendar", () => {
  it("share carries the experience's own label", async () => {
    await renderWith();
    expect(screen.getByRole("button", { name: he.share.modal_title_experience })).toBeTruthy();
  });

  it("MEH-2559: a save heart for this experience sits on the cover's corner", async () => {
    await renderWith();
    const heart = screen.getByTestId("save-experience");
    expect(screen.getByTestId("experience-cover-actions").contains(heart)).toBe(true);
    expect(heart.getAttribute("data-id")).toBe("x-1");
    // MEH-2671: the inline-END corner (top-left in RTL).
    expect(screen.getByTestId("experience-cover-actions").className).toMatch(/\bend-3\b/);
    expect(screen.getByTestId("experience-cover-actions").className).not.toMatch(/\bstart-3\b/);
  });

  it("a one-off approved experience: «הוספה ליומן» downloads a .ics with start and end", async () => {
    const created = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn((blob) => {
      created.push(blob);
      return "blob:ics";
    });
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      await renderWith();
      fireEvent.click(screen.getByTestId("experience-add-to-calendar"));
      expect(created).toHaveLength(1);
      const text = await created[0].text();
      // 20/11 10:00 Israel (UTC+2) → 08:00Z; 90 minutes → 09:30Z.
      expect(text).toContain("DTSTART:20261120T080000Z");
      expect(text).toContain("DTEND:20261120T093000Z");
      expect(text).toContain("SUMMARY:סדנת מחמצת");
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
      clickSpy.mockRestore();
    }
  });

  it("a recurring experience: no single-date calendar entry, share stays", async () => {
    await renderWith({ is_recurring: true, recurring_schedule: "כל יום שישי" });
    expect(screen.queryByTestId("experience-add-to-calendar")).toBeNull();
    expect(screen.getByTestId("experience-actions")).toBeTruthy();
  });

  it("not approved: no actions at all", async () => {
    await renderWith({ status: "pending" });
    expect(screen.queryByTestId("experience-actions")).toBeNull();
  });
});

describe("MEH-2549 — navigation and the time chip", () => {
  it("public venue, no map point → Waze + Google from the address", async () => {
    await renderWith();
    const links = screen.getByTestId("experience-nav-links").querySelectorAll("a");
    expect(links[0].getAttribute("href")).toContain(encodeURIComponent("רחוב הנמל 5, חיפה"));
  });

  it("MEH-2588: address links show the Waze and Google marks", async () => {
    await renderWith();
    const [waze, google] = screen.getByTestId("experience-nav-links").querySelectorAll("a");
    expect(waze.querySelector("svg")).toBeTruthy();
    expect(google.querySelector("svg clipPath")).toBeTruthy();
    expect(google.hasAttribute("aria-label")).toBe(false);
  });

  it("a home experience never gets address links", async () => {
    await renderWith({ location_type: "home" });
    expect(screen.queryByTestId("experience-nav-links")).toBeNull();
  });

  it("tomorrow → «מחר»; recurring → no chip", async () => {
    await renderWith({ event_date: "2026-10-30" });
    expect(screen.getByTestId("experience-when").textContent).toBe(he.events.detail.when_tomorrow);
  });

  it("recurring → no chip even when the start is tomorrow", async () => {
    await renderWith({ event_date: "2026-10-30", is_recurring: true });
    expect(screen.queryByTestId("experience-when")).toBeNull();
  });
});

/**
 * MEH-2989 — the experience page says each thing once, like the event page.
 */
describe("MEH-2989 — no repeated information", () => {
  it("the date tile sits in the details card only", async () => {
    await renderWith();
    const tiles = screen.getAllByTestId("experience-date-tile");
    expect(tiles).toHaveLength(1);
    expect(screen.getByTestId("experience-info").contains(tiles[0])).toBe(true);
  });

  // MEH-3057: the tile already says «נובמבר 20» — a one-off row is the
  // weekday + time; «starts from» on a recurring one keeps the full date.
  it("a one-off date row is the weekday and time, not the date again", async () => {
    await renderWith();
    const text = screen.getByTestId("experience-date").textContent;
    expect(text).toBe("יום שישי · 10:00");
    expect(text).not.toMatch(/20|נובמבר|2026/);
  });

  it("a one-off with no time → the weekday alone", async () => {
    await renderWith({ event_time: null });
    expect(screen.getByTestId("experience-date").textContent).toBe("יום שישי");
  });

  it("a recurring date row keeps the full start date", async () => {
    await renderWith({ is_recurring: true });
    expect(screen.getByTestId("experience-date").textContent).toMatch(/20 בנובמבר 2026/);
  });

  it("the breadcrumb is desktop only", async () => {
    await renderWith();
    expect(screen.getByTestId("breadcrumb").className.split(" ")).toEqual(
      expect.arrayContaining(["hidden", "lg:block"]),
    );
  });

  it("category «אחר» → no chip", async () => {
    await renderWith({ category: "אחר" });
    expect(screen.queryByTestId("experience-category")).toBeNull();
  });

  it("the description and «מה להביא» come before the map", async () => {
    await renderWith({ lat: 32.8, lng: 35.0, requirements: "סינר" });
    const map = screen.getByTestId("minimap");
    const desc = screen.getByText("סדנה של בוקר שלם");
    const bring = screen.getByTestId("experience-bring");
    expect(desc.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bring.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no host card and no «כל החוויות» link at the end", async () => {
    await renderWith();
    expect(screen.queryByTestId("experience-host")).toBeNull();
    expect(screen.queryByText(he.experiences.detail.all_experiences)).toBeNull();
  });
});
