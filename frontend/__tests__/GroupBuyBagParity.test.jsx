// MEH-3610 (Sapir 21/11): a group buy says what a rescue bag says, in its
// look — one white card, the pickup branch on the map, allergens, and until
// when she can leave. Harness from GroupBuyPageLikeBag.test.jsx.
import { contractRow, uuidFor } from "./helpers/contract-row";
import { GetProducerProducersProducerIdGetResponse } from "@/lib/generated/api.zod";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import GroupBuyDetailClient from "@/app/[locale]/group-buys/[id]/GroupBuyDetailClient";

// MEH-2544: the page's business row is OwnerRow, which links via @/i18n/navigation.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const captureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureMessage: (...a) => captureMessage(...a) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("next-intl", () => ({
  useLocale: () => "he",
  useTranslations: (ns) => (key, vals) =>
    vals ? `${ns}.${key}:${JSON.stringify(vals)}` : `${ns}.${key}`,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/format-date", () => ({ formatEventDate: () => "1 בינואר 2099", formatDate: () => "1 בינואר 2099" }));
// The checker seeds from the saved city; none saved here.
// MEH-3597: the map is next/dynamic (leaflet); a stub records what it got.
vi.mock("next/dynamic", () => ({
  default: () => (props) => <div data-testid="mini-map" data-lat={props.lat} data-name={props.name} />,
}));
// MEH-3597: the window's wording is lib/group-buy-pickup's own test; here only whether it shows.
vi.mock("@/lib/group-buy-pickup", async (importOriginal) => ({
  ...(await importOriginal()),
  pickupWindowText: (s, e) => (s && e ? `${s}|${e}` : null),
}));
const downloadIcs = vi.fn();
vi.mock("@/lib/event-ics", () => ({ downloadIcs: (...a) => downloadIcs(...a) }));
vi.mock("@/lib/use-user-city", () => ({ useUserCity: () => ({ city: null }) }));

const GB = {
  id: "gb-1",
  producer_id: "p-1",
  producer_name: "מאפיית שקד",
  title: "מארז לחמים",
  status: "open",
  deadline: "2099-01-01T00:00:00Z",
  min_participants: 5,
  max_participants: null,
  commits_count: 1,
  price_per_unit_regular: "100.00",
  price_per_unit_group: "80.00",
  fulfillment_note: "איסוף מחדרה ביום שישי",
  user_committed: false,
  user_commit: null,
};

// MEH-1748: the page parses the whole ProducerDetailOut (generated), so the
// body is a contract-valid row with only the delivery fields set here.
const producer = (over = {}) =>
  contractRow(GetProducerProducersProducerIdGetResponse, {
    id: uuidFor("p-1"),
    name: "מאפיית שקד",
    offers_delivery: true,
    delivery_nationwide: false,
    delivery_excluded_cities: [],
    delivery_areas: [{ id: uuidFor("a1"), city: "חדרה", min_order: 100, delivery_day: "שישי" }],
    ...over,
  });

const fixture = { producer: null, producerError: null };
const defaultGet = (url) => {
  if (url === "/group-buys/gb-1") return Promise.resolve({ data: { ...GB, ...fixture.gb } });
  if (url === "/producers/p-1") {
    return fixture.producerError
      ? Promise.reject(fixture.producerError)
      : Promise.resolve({ data: fixture.producer });
  }
  return Promise.reject(new Error(`unexpected GET ${url}`));
};
const get = vi.fn(defaultGet);
vi.mock("@/lib/api", () => ({ default: { get: (...a) => get(...a), post: vi.fn(), delete: vi.fn() } }));

const by = (name) => `group_buys.detail.by_producer:${JSON.stringify({ name })}`;

async function renderPage() {
  render(<GroupBuyDetailClient id="gb-1" />);
  // MEH-2857: the title is also the breadcrumb's last crumb — wait on the heading.
  await screen.findByRole("heading", { level: 1, name: GB.title });
}

beforeEach(() => {
  get.mockClear();
  get.mockImplementation(defaultGet);
  captureMessage.mockReset();
  fixture.producer = producer();
  fixture.producerError = null;
  fixture.gb = {};
});



const PLACE = { id: uuidFor("loc-1"), label: "הסניף בכרמל", city: "חיפה", address: "הרצל 5", lat: 32.81, lng: 34.99 };

describe("MEH-3610 — one white card, in the bag page's order", () => {
  it("where, allergens, how and cancel are sections of one card", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף", delivery_note: null };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    const card = await screen.findByTestId("group-buy-details");
    expect(card.className).toContain("bg-surface");
    expect(card.className).toContain("divide-y");
    // MEH-3949: the card ends with one row that links to the hub's questions.
    const rows = [...card.children];
    const faqRow = rows.pop();
    expect(faqRow.querySelector('[data-testid="hub-faq-link-detail"]')).not.toBeNull();
    const ids = rows.map((el) => el.getAttribute("data-testid"));
    expect(ids).toEqual(["group-buy-fulfillment", "group-buy-allergens", "group-buy-how", "group-buy-cancel"]);
    expect(rows.every((el) => el.tagName === "SECTION")).toBe(true);
  });
});

describe("MEH-3610 — allergens (0 / 1 / many)", () => {
  it("none declared: the line says so, never «no allergens»", async () => {
    fixture.gb = { allergens: null };
    await renderPage();
    expect((await screen.findByTestId("group-buy-allergens-none")).textContent).toBe("rescue.section.allergens_undeclared");
    expect(screen.queryByTestId("group-buy-allergens-declared")).toBeNull();
  });

  it("one declared: named in the product sheet's words", async () => {
    fixture.gb = { allergens: ["sesame"] };
    await renderPage();
    const line = await screen.findByTestId("group-buy-allergens-declared");
    expect(line.textContent).toBe(`rescue.section.allergens_declared:${JSON.stringify({ list: "settings.products.form.allergen_sesame" })}`);
  });

  it("many declared: all of them, in the order given; an unknown code is dropped", async () => {
    fixture.gb = { allergens: ["gluten", "milk", "unicorn"] };
    await renderPage();
    const line = await screen.findByTestId("group-buy-allergens-declared");
    expect(line.textContent).toContain("allergen_gluten, settings.products.form.allergen_milk");
    expect(line.textContent).not.toContain("unicorn");
  });
});

describe("MEH-3610 — the pickup branch", () => {
  it("a branch: the first row names it, and the map pins it, not the business", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "בכניסה", delivery_note: null, pickup_location: PLACE };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    const map = await screen.findByTestId("mini-map");
    expect(map.getAttribute("data-lat")).toBe("32.81");
    expect(map.getAttribute("data-name")).toBe("הסניף בכרמל");
    const row = screen.getByTestId("group-buy-pickup-place");
    expect(row.textContent).toContain("group_buys.detail.pickup_place_label");
    expect(row.textContent).toContain("הסניף בכרמל — הרצל 5, חיפה");
    expect(row.compareDocumentPosition(screen.getByTestId("group-buy-pickup-note")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an approximate branch (no street, no pin): the city in the row, the business's map", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "בכניסה", delivery_note: null, pickup_location: { ...PLACE, address: null, lat: null, lng: null } };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    const map = await screen.findByTestId("mini-map");
    expect(map.getAttribute("data-lat")).toBe("32.43");
    expect(screen.getByTestId("group-buy-pickup-place").textContent).toContain("הסניף בכרמל — חיפה");
  });

  it("delivery only: no branch row and no map, even with one saved", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: null, delivery_note: "משלוח", pickup_location: PLACE };
    await renderPage();
    await screen.findByTestId("group-buy-delivery-note");
    expect(screen.queryByTestId("group-buy-pickup-place")).toBeNull();
    expect(screen.queryByTestId("mini-map")).toBeNull();
  });
});

describe("MEH-3610 — «אפשר לבטל עד…»", () => {
  it("the cancel section names the date (open and funded)", async () => {
    await renderPage();
    const cancel = await screen.findByTestId("group-buy-cancel");
    expect(cancel.textContent).toMatch(/cancel_body_open:\{"date":"[^"]+2099[^"]*"\}/);
  });

  it("the join confirmation says until when she can leave", async () => {
    fixture.gb = { user_committed: true, user_commit: { quantity: 1 } };
    await renderPage();
    const line = await screen.findByTestId("group-buy-cancel-until");
    expect(line.textContent).toMatch(/cancel_until_short:\{"date":"[^"]+"\}/);
  });

  it("past the deadline: no «until» line on her confirmation", async () => {
    fixture.gb = { user_committed: true, user_commit: { quantity: 1 }, deadline: "2000-01-01T00:00:00Z" };
    await renderPage();
    await screen.findByTestId("group-buy-member");
    expect(screen.queryByTestId("group-buy-cancel-until")).toBeNull();
  });
});
