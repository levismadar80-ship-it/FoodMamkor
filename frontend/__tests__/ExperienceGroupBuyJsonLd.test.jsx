/**
 * MEH-2478 — structured data on /experiences/[id] and /group-buys/[id].
 *
 * Rendered through the real page modules (server component → static markup),
 * so what is asserted is the <script type="application/ld+json"> a crawler
 * would read, not a builder in isolation. On the old pages there is no such
 * script at all, so every "emits" case below goes red on its assertion.
 *
 * Experience (Google event docs: one Event per page; name + startDate +
 * location required):
 *   - a dated experience with a city → exactly ONE Event node;
 *   - no start date → no Event markup;
 *   - no city (no location) → no Event markup;
 *   - a host-cancelled experience is still described, as EventCancelled.
 *
 * Group buy (Product + Offer):
 *   - open and before its deadline → InStock, price = the GROUP price, ILS,
 *     priceValidUntil = the deadline's date;
 *   - open but past its deadline (nothing closes it automatically) and funded
 *     → not InStock;
 *   - no image field exists on the payload → no `image` key is invented.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const serverFetch = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureMessage: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock("@/lib/server-fetch", () => ({ serverFetch: (...a) => serverFetch(...a) }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (key) => key }));
vi.mock("@/app/[locale]/experiences/[id]/ExperienceDetailClient", () => ({ default: () => null }));
vi.mock("@/app/[locale]/group-buys/[id]/GroupBuyDetailClient", () => ({ default: () => null }));

import ExperiencePage from "@/app/[locale]/experiences/[id]/page";
import GroupBuyPage from "@/app/[locale]/group-buys/[id]/page";

const ok = (body) => ({ ok: true, status: 200, json: async () => body });

/** Every JSON-LD node the rendered page carries, @graph flattened. */
async function ldNodes(Page, payload) {
  serverFetch.mockResolvedValue(ok(payload));
  const element = await Page({ params: Promise.resolve({ id: payload.id, locale: "he" }) });
  const html = renderToStaticMarkup(element);
  const nodes = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const obj = JSON.parse(m[1]);
    nodes.push(...(obj["@graph"] ?? [obj]));
  }
  return nodes;
}
const ofType = (nodes, type) => nodes.filter((n) => n["@type"] === type);

const EXPERIENCE = {
  id: "55555555-5555-5555-5555-555555555555",
  title: "קטיף ענבים בכרם",
  description: "בוקר של קטיף בכרם משפחתי, עם טעימות בסוף",
  image_url: "https://res.cloudinary.com/demo/image/upload/vineyard.jpg",
  event_date: "2099-09-14",
  event_time: "08:30:00",
  duration_minutes: 180,
  location_type: "public",
  city: "זכרון יעקב",
  price_per_person: "120.00",
  is_recurring: false,
  is_active: true,
  status: "approved",
  host: { id: "h1", name: "דנה" },
};

const GROUP_BUY = {
  id: "44444444-4444-4444-4444-444444444444",
  producer_id: "33333333-3333-3333-3333-333333333333",
  producer_name: "בית הבד בגליל",
  title: "רכישה קבוצתית — שמן זית כתית",
  description: "שמן זית מהמסיק של השנה",
  product_name: "שמן זית כתית מעולה",
  unit: "ליטר",
  price_per_unit_regular: "60.00",
  price_per_unit_group: "45.00",
  min_participants: 10,
  deadline: "2099-12-01T10:00:00",
  city: "כרמיאל",
  status: "open",
  commits_count: 3,
};

beforeEach(() => serverFetch.mockReset());

describe("experience page — Event JSON-LD (MEH-2478)", () => {
  it("a dated experience with a city emits exactly ONE Event with name, startDate and location", async () => {
    const nodes = await ldNodes(ExperiencePage, EXPERIENCE);
    const events = ofType(nodes, "Event");
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.name).toBe(EXPERIENCE.title);
    expect(ev.startDate).toBe("2099-09-14T08:30");
    expect(ev.location["@type"]).toBe("Place");
    expect(ev.location.address.addressLocality).toBe("זכרון יעקב");
    expect(ev.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ev.image).toBe(EXPERIENCE.image_url);
    expect(ev.offers.price).toBe("120");
    expect(ev.offers.priceCurrency).toBe("ILS");
    expect(ev.url).toContain(`/experiences/${EXPERIENCE.id}`);
  });

  it("no start date → no Event markup", async () => {
    const { event_date, ...noDate } = EXPERIENCE;
    const nodes = await ldNodes(ExperiencePage, noDate);
    expect(ofType(nodes, "Event")).toHaveLength(0);
  });

  it("no city (no location) → no Event markup", async () => {
    const nodes = await ldNodes(ExperiencePage, { ...EXPERIENCE, city: null });
    expect(ofType(nodes, "Event")).toHaveLength(0);
  });

  it("a host-cancelled experience is marked EventCancelled", async () => {
    const nodes = await ldNodes(ExperiencePage, { ...EXPERIENCE, is_active: false });
    const events = ofType(nodes, "Event");
    expect(events).toHaveLength(1);
    expect(events[0].eventStatus).toBe("https://schema.org/EventCancelled");
  });
});

describe("group-buy page — Product + Offer JSON-LD (MEH-2478)", () => {
  it("open before its deadline → Product with an InStock ILS Offer at the group price", async () => {
    const nodes = await ldNodes(GroupBuyPage, GROUP_BUY);
    const products = ofType(nodes, "Product");
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.name).toBe(GROUP_BUY.product_name);
    expect(p.offers["@type"]).toBe("Offer");
    expect(p.offers.price).toBe("45");
    expect(p.offers.priceCurrency).toBe("ILS");
    expect(p.offers.availability).toBe("https://schema.org/InStock");
    expect(p.offers.priceValidUntil).toBe("2099-12-01");
    expect(p.offers.url).toContain(`/group-buys/${GROUP_BUY.id}`);
  });

  it("does not invent an image — the payload has no image field", async () => {
    const [p] = ofType(await ldNodes(GroupBuyPage, GROUP_BUY), "Product");
    expect(p).toBeDefined();
    expect("image" in p).toBe(false);
  });

  it("open but past its deadline → not InStock", async () => {
    const [p] = ofType(
      await ldNodes(GroupBuyPage, { ...GROUP_BUY, deadline: "2020-01-01T10:00:00" }),
      "Product",
    );
    expect(p).toBeDefined();
    expect(p.offers.availability).toBe("https://schema.org/OutOfStock");
  });

  it("funded (no longer joinable) → not InStock", async () => {
    const [p] = ofType(await ldNodes(GroupBuyPage, { ...GROUP_BUY, status: "funded" }), "Product");
    expect(p).toBeDefined();
    expect(p.offers.availability).toBe("https://schema.org/OutOfStock");
  });
});
