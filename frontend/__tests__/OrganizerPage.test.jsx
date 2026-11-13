/**
 * MEH-2461 — /organizers/[slug] (server component).
 * 5-state rule: 0 / 1 / many upcoming events. Contract mirrored from the
 * business slug page (MEH-1754): only a 404 becomes notFound(); any other
 * failure throws (5xx, never a de-indexing soft 404).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const fetchMock = vi.fn();
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => fetchMock(...a) }));
vi.mock("@/lib/env", () => ({ API_URL: "https://api.test", SITE_URL: "https://site.test" }));
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

// MEH-2559: the heart needs AuthProvider; its behaviour is SaveButton.test.jsx's.
vi.mock("@/components/SaveButton", () => ({ default: () => null }));

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

  it("MEH-2619: an event with an end time shows only its start «09:30» in an LTR isolate", async () => {
    respond(200, {
      ...ORG,
      upcoming_events: [{ ...ev("e1", "2026-11-07"), event_time: "09:30:00", end_time: "15:00:00" }],
    });
    await renderPage();
    const start = screen.getByText("09:30");
    expect(start.getAttribute("dir")).toBe("ltr");
    expect(screen.queryByText(/15:00/)).not.toBeInTheDocument();
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
    // Decorative next to the h1 — a repeated name would be read twice.
    expect(screen.getByTestId("organizer-cover").getAttribute("alt")).toBe("");
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

  it("MEH-2547: a blank name → no empty avatar circle", async () => {
    respond(200, { ...ORG, name: "  " });
    await renderPage();
    expect(screen.queryByTestId("organizer-avatar")).toBeNull();
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
    // MEH-2988: drawn as the business button — label, and no new tab for a call
    expect(call.textContent).toBe("contact_cta.phone");
    expect(call.getAttribute("target")).toBeNull();
    expect(screen.queryByTestId("organizer-contact-whatsapp")).not.toBeInTheDocument();
  });

  it("MEH-2988: the preferred channel is the business page's button — icon + contact_cta label", async () => {
    respond(200, ORG);
    await renderPage();
    const wa = screen.getByTestId("organizer-contact-whatsapp");
    expect(wa.getAttribute("data-primary")).toBe("true");
    expect(wa.textContent).toBe("contact_cta.whatsapp");
    expect(wa.querySelector("svg")).not.toBeNull();
    expect(wa.className).toContain("btn-whatsapp");
    // a secondary channel keeps its short pill label and no icon
    const ig = screen.getByTestId("organizer-contact-instagram");
    expect(ig.textContent).toBe("organizers.page.instagram");
    expect(ig.querySelector("svg")).toBeNull();
  });

  it("MEH-2988: a website primary keeps the business button's referral rules", async () => {
    respond(200, { ...ORG, primary_contact_method: "website", website: "gelem.co.il" });
    await renderPage();
    const site = screen.getByTestId("organizer-contact-website");
    expect(site.getAttribute("data-primary")).toBe("true");
    expect(site.getAttribute("href")).toMatch(/^https:\/\/gelem\.co\.il\/?\?.*utm_source=/);
    expect(site.getAttribute("target")).toBe("_blank");
    expect(site.getAttribute("rel")).toBe("noopener");
  });

  it("MEH-2988: a WhatsApp primary opens in place, as on the business page", async () => {
    respond(200, ORG);
    await renderPage();
    expect(screen.getByTestId("organizer-contact-whatsapp").getAttribute("target")).toBeNull();
  });

  it("MEH-2475: the founding year shows as a quiet «since» line only when set", async () => {
    respond(200, { ...ORG, established_year: 2015 });
    await renderPage();
    expect(screen.getByTestId("organizer-since").textContent).toContain("2015");
  });

  // MEH-3005: «חזרה» as on the event / workshop pages (HistoryBackLink). The
  // page has no breadcrumb, so this is its only way back. Both cells of the
  // link's one condition: a page of ours behind this one, or not.
  describe("MEH-3005 back link", () => {
    const setCanGoBack = (value) =>
      Object.defineProperty(window, "navigation", { value: { canGoBack: value }, configurable: true });
    // jsdom has no Navigation API: drop the stub so no later test inherits it.
    afterEach(() => {
      delete window.navigation;
    });

    it("arrival from inside the site → the back link sits above the name", async () => {
      setCanGoBack(true);
      respond(200, ORG);
      await renderPage();
      const back = screen.getByTestId("history-back");
      const h1 = screen.getByRole("heading", { level: 1 });
      expect(back.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.getByTestId("organizer-cover-band").compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("with a cover photo → the back link still sits between the cover and the name", async () => {
      setCanGoBack(true);
      respond(200, { ...ORG, images: ["https://res.cloudinary.com/x/image/upload/org.jpg"] });
      await renderPage();
      const back = screen.getByTestId("history-back");
      expect(screen.getByTestId("organizer-cover").compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(back.compareDocumentPosition(screen.getByRole("heading", { level: 1 })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("direct arrival (WhatsApp, Google) → no back link", async () => {
      setCanGoBack(false);
      respond(200, ORG);
      await renderPage();
      expect(screen.queryByTestId("history-back")).toBeNull();
      // control: the page did render
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("שוק גלם");
    });
  });

  // MEH-3018: the organizer page had no share button. It now carries the
  // shared overlay circle on the cover, named for an organizer — not the
  // ShareButton default «שתפו לינק לעסק», which would tell a screen reader
  // this is a business.
  describe("MEH-3018 share button", () => {
    it("no cover photo → the share circle sits on the green band, named for an organizer", async () => {
      respond(200, ORG);
      await renderPage();
      const share = screen.getByTestId("share-overlay");
      expect(share.getAttribute("aria-label")).toBe("share.modal_title_organizer");
      expect(screen.getByTestId("organizer-cover-band").parentElement.contains(share)).toBe(true);
    });

    it("with a cover photo → the same circle, inside the cover block", async () => {
      respond(200, { ...ORG, images: ["https://res.cloudinary.com/x/image/upload/org.jpg"] });
      await renderPage();
      const share = screen.getByTestId("share-overlay");
      expect(share.getAttribute("aria-label")).toBe("share.modal_title_organizer");
      expect(screen.getByTestId("organizer-cover").parentElement.contains(share)).toBe(true);
    });

    it("a tap shares the page's own canonical address", async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "share", { value: share, configurable: true });
      try {
        respond(200, ORG);
        await renderPage();
        fireEvent.click(screen.getByTestId("share-overlay"));
        await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
        expect(share.mock.calls[0][0].url).toBe("https://site.test/organizers/gelem");
      } finally {
        delete navigator.share;
      }
    });

    it("the label is the string Sapir approved, in both languages", () => {
      const he = JSON.parse(readFileSync(join(__dirname, "../messages/he.json"), "utf8"));
      const en = JSON.parse(readFileSync(join(__dirname, "../messages/en.json"), "utf8"));
      expect(he.share.modal_title_organizer).toBe("שתפו את דף המארגן");
      expect(en.share.modal_title_organizer).toBe("Share this organizer page");
    });
  });
});
