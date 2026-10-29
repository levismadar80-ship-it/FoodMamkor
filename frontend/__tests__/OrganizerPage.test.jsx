/**
 * MEH-2461 — /organizers/[slug] (server component).
 * 5-state rule: 0 / 1 / many upcoming events. Contract mirrored from the
 * business slug page (MEH-1754): only a 404 becomes notFound(); any other
 * failure throws (5xx, never a de-indexing soft 404).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const fetchMock = vi.fn();
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => fetchMock(...a) }));
vi.mock("@/lib/env", () => ({ API_URL: "https://api.test" }));
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({ notFound: () => notFoundMock() }));
const setRequestLocaleMock = vi.fn();
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ namespace }) => (k) => `${namespace}.${k}`,
  setRequestLocale: (l) => setRequestLocaleMock(l),
}));
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...a) => captureMessage(...a),
  captureException: vi.fn(),
}));
// MEH-2475: OwnerCard (shared with the business page) reads next-intl's hook.
// MEH-2547: the event rows are EventEntryRow, which reads useLocale.
vi.mock("next-intl", () => ({
  useTranslations: (namespace) => (k) => `${namespace}.${k}`,
  useLocale: () => "he",
}));
vi.mock("@/components/ImageWithFallback", () => ({
  // eslint-disable-next-line @next/next/no-img-element -- test stub
  default: ({ src, alt }) => <img src={src} alt={alt} />,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import OrganizerPage from "@/app/[locale]/organizers/[slug]/page";

const ORG = {
  id: "o-1",
  name: "שוק גלם",
  slug: "gelem",
  description: "שוק יצרנים נודד",
  city: "חיפה",
  images: [],
  phone: "0521234567",
  instagram: "@gelem",
  website: null,
  facebook: null,
  upcoming_events: [],
};
const ev = (id, date) => ({
  id,
  title: `שוק ${id}`,
  event_date: date,
  city: "חיפה",
  owner_kind: "organizer",
  owner_slug: "gelem",
});

function respond(status, body) {
  fetchMock.mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    statusText: String(status),
    json: async () => body,
  });
}

async function renderPage(slug = "gelem") {
  const ui = await OrganizerPage({ params: Promise.resolve({ slug, locale: "he" }) });
  render(ui);
}

beforeEach(() => vi.clearAllMocks());

describe("MEH-2461 organizer page", () => {
  it("0 events: profile + the approved empty copy, no event list", async () => {
    respond(200, ORG);
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("שוק גלם");
    expect(screen.getByTestId("organizer-events-empty").textContent).toBe("organizers.page.empty");
    expect(screen.queryByTestId("organizer-events")).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/organizers/gelem");
  });

  it("1 event: one row linking to the event page, no empty copy", async () => {
    respond(200, { ...ORG, upcoming_events: [ev("e1", "2026-11-10")] });
    await renderPage();
    const rows = screen.getAllByTestId("organizer-event");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector("a").getAttribute("href")).toBe("/events/e1");
    // MEH-2547: the /events date-rail row, minus the «who» line — every row
    // here is this organizer's.
    expect(rows[0].textContent).toContain("שוק e1");
    expect(rows[0].textContent).not.toContain("organizer_line");
    expect(screen.queryByTestId("organizer-events-empty")).not.toBeInTheDocument();
  });

  it("MEH-2469: an event with an end time shows «09:30–15:00» in an LTR isolate", async () => {
    respond(200, {
      ...ORG,
      upcoming_events: [{ ...ev("e1", "2026-11-07"), event_time: "09:30:00", end_time: "15:00:00" }],
    });
    await renderPage();
    const range = screen.getByText("09:30–15:00");
    expect(range.getAttribute("dir")).toBe("ltr");
  });

  it("many events: rendered in the order the API returns (soonest first)", async () => {
    respond(200, {
      ...ORG,
      upcoming_events: [ev("e1", "2026-11-01"), ev("e2", "2026-11-08"), ev("e3", "2026-12-01")],
    });
    await renderPage();
    expect(screen.getAllByTestId("organizer-event").map((li) => li.querySelector("a").getAttribute("href"))).toEqual([
      "/events/e1",
      "/events/e2",
      "/events/e3",
    ]);
  });

  it("contacts: only the channels the organizer has, WhatsApp via wa.me", async () => {
    respond(200, ORG);
    await renderPage();
    expect(screen.getByTestId("organizer-contact-whatsapp").getAttribute("href")).toMatch(
      /^https:\/\/wa\.me\/972521234567/,
    );
    expect(screen.getByTestId("organizer-contact-instagram").getAttribute("href")).toBe(
      "https://instagram.com/gelem",
    );
    expect(screen.queryByTestId("organizer-contact-website")).not.toBeInTheDocument();
    expect(screen.queryByTestId("organizer-contact-facebook")).not.toBeInTheDocument();
  });

  it("404 from the API → notFound()", async () => {
    respond(404, { detail: "מארגן לא נמצא" });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("5xx from the API → throws (not a soft 404)", async () => {
    respond(503, {});
    await expect(renderPage()).rejects.toThrow(/organizer lookup failed: 503/);
    expect(notFoundMock).not.toHaveBeenCalled();
  });

  it("a protocol-less website / facebook becomes an https link (review #3712 F6)", async () => {
    respond(200, { ...ORG, website: "gelem.co.il", facebook: "  https://facebook.com/gelem " });
    await renderPage();
    expect(screen.getByTestId("organizer-contact-website").getAttribute("href")).toBe(
      "https://gelem.co.il",
    );
    expect(screen.getByTestId("organizer-contact-facebook").getAttribute("href")).toBe(
      "https://facebook.com/gelem",
    );
  });

  it("sets the request locale (static rendering, review #3712 F8)", async () => {
    respond(200, ORG);
    await renderPage();
    expect(setRequestLocaleMock).toHaveBeenCalledWith("he");
  });

  it("Rule 19: a contract-breaking payload is reported and still renders (review #3712 F4)", async () => {
    respond(200, { ...ORG, slug: undefined });
    await renderPage();
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage.mock.calls[0][0]).toBe("SSR payload failed schema validation");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("שוק גלם");
  });

  it("control: a valid payload reports nothing", async () => {
    respond(200, { ...ORG, upcoming_events: [ev("e1", "2026-11-10")] });
    await renderPage();
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it("MEH-2468/2546: a row shows the event's own photo, else a category tile — never the organizer's photo", async () => {
    respond(200, {
      ...ORG,
      images: ["https://res.cloudinary.com/x/image/upload/org.jpg"],
      upcoming_events: [
        { ...ev("e1", "2026-11-01"), image_url: "https://res.cloudinary.com/x/image/upload/a.jpg" },
        { ...ev("e2", "2026-11-08"), owner_image_url: "https://res.cloudinary.com/x/image/upload/org.jpg" },
      ],
    });
    await renderPage();
    const thumbs = screen.getAllByTestId("event-row-image");
    expect(thumbs.map((el) => el.getAttribute("data-kind"))).toEqual(["event", "category"]);
    expect(thumbs[0].style.backgroundImage).toContain("a.jpg");
  });

  it("MEH-2547: masthead — the first photo as a cover, the initial in a round avatar", async () => {
    respond(200, { ...ORG, images: ["https://res.cloudinary.com/x/image/upload/org.jpg"] });
    await renderPage();
    expect(screen.getByTestId("organizer-cover").getAttribute("src")).toContain("org.jpg");
    expect(screen.queryByTestId("organizer-cover-band")).toBeNull();
    expect(screen.getByTestId("organizer-avatar").textContent).toBe("ש");
  });

  it("MEH-2547: no photo → a green band instead of a cover, avatar still there", async () => {
    respond(200, ORG);
    await renderPage();
    expect(screen.queryByTestId("organizer-cover")).toBeNull();
    expect(screen.getByTestId("organizer-cover-band")).toBeTruthy();
    expect(screen.getByTestId("organizer-avatar").textContent).toBe("ש");
  });

  it("a scanner-shaped slug never reaches the API", async () => {
    await expect(renderPage("wp-admin.php")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ── MEH-2475: what the organizer fills in the dashboard reaches the page ──

  it("MEH-2475: the owner story renders under the organizer heading; absent when empty", async () => {
    respond(200, { ...ORG, owner_bio: "התחלנו בחצר של סבתא", contact_name: "נועה" });
    await renderPage();
    const card = screen.getByTestId("owner-card");
    expect(card.textContent).toContain("organizers.page.owner_heading");
    expect(card.textContent).toContain("התחלנו בחצר של סבתא");
  });

  it("MEH-2475: no owner story → no owner card", async () => {
    respond(200, ORG);
    await renderPage();
    expect(screen.queryByTestId("owner-card")).not.toBeInTheDocument();
  });

  it("MEH-2475: the preferred channel comes first; email / group / form appear only when filled", async () => {
    respond(200, {
      ...ORG,
      primary_contact_method: "email",
      contact_email: "market@example.com",
      whatsapp_group: "https://chat.whatsapp.com/AbC",
      external_order_form: "forms.example.com/stand",
    });
    await renderPage();
    const links = screen.getByTestId("organizer-contact").querySelectorAll("a");
    expect(links[0].getAttribute("href")).toBe("mailto:market@example.com");
    expect(links[0].getAttribute("data-primary")).toBe("true");
    expect(screen.getByTestId("organizer-contact-whatsapp_group").getAttribute("href")).toBe(
      "https://chat.whatsapp.com/AbC",
    );
    expect(screen.getByTestId("organizer-contact-external_order").getAttribute("href")).toBe(
      "https://forms.example.com/stand",
    );
    // WhatsApp from the phone stays available as a secondary channel
    expect(screen.getByTestId("organizer-contact-whatsapp")).toBeInTheDocument();
  });

  it("MEH-2475: phone as the preferred channel → a call link, not a WhatsApp link built from it", async () => {
    respond(200, { ...ORG, primary_contact_method: "phone" });
    await renderPage();
    const call = screen.getByTestId("organizer-contact-phone");
    expect(call.getAttribute("href")).toBe("tel:0521234567");
    expect(call.getAttribute("data-primary")).toBe("true");
    expect(screen.queryByTestId("organizer-contact-whatsapp")).not.toBeInTheDocument();
  });

  it("MEH-2475: the founding year shows as a quiet «since» line only when set", async () => {
    respond(200, { ...ORG, established_year: 2015 });
    await renderPage();
    expect(screen.getByTestId("organizer-since").textContent).toContain("2015");
  });
});
