// MEH-3597 (Sapir 21/11): the group buy page shows where and when with a map,
// how it works and cancelling, in the bag page's order. Harness from
// GroupBuyDetailBusinessDelivery.test.jsx.
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


describe("MEH-3597 — where and when, like the bag page", () => {
  it("pickup + business with a point: rows, then the map of the business", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף מהמאפייה", delivery_note: null };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    const map = await screen.findByTestId("mini-map");
    expect(map.getAttribute("data-lat")).toBe("32.43");
    const section = screen.getByTestId("group-buy-fulfillment");
    expect(section.contains(map)).toBe(true);
    expect(screen.getByTestId("group-buy-pickup-note").compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("delivery only: no map (nothing to come to)", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: null, delivery_note: "משלוח לחדרה" };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    await screen.findByTestId("group-buy-delivery-note");
    expect(screen.queryByTestId("mini-map")).toBeNull();
  });

  it("no point for the business: rows only, no map", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף מהמאפייה", delivery_note: null };
    fixture.producer = producer({ lat: null, lng: null });
    await renderPage();
    await screen.findByTestId("delivery-checker");
    expect(screen.queryByTestId("mini-map")).toBeNull();
  });

  it("no note but a point: the section still shows, with its heading and the map", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: null, delivery_note: null };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    await screen.findByTestId("mini-map");
    expect(screen.getByTestId("group-buy-fulfillment").querySelector("h2").textContent).toBe("group_buys.detail.fulfillment_title");
  });

  it("order: where → how → cancel, as on the bag page", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף", delivery_note: null };
    fixture.producer = producer({ lat: 32.43, lng: 34.92 });
    await renderPage();
    await screen.findByTestId("mini-map");
    const where = screen.getByTestId("group-buy-fulfillment");
    const how = screen.getByTestId("group-buy-how");
    const cancel = screen.getByTestId("group-buy-cancel");
    expect(where.compareDocumentPosition(how) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(how.compareDocumentPosition(cancel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cancel.textContent).toContain("cancel_body_open");
  });
});

describe("MEH-3597 — pickup time and when to pay", () => {
  it("a window set: the pickup time sits under the title, before the details (MEH-3610, as the bag page)", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף מהמאפייה", delivery_note: null, pickup_starts_at: "2099-01-02T07:00:00", pickup_ends_at: "2099-01-02T11:00:00" };
    await renderPage();
    const row = await screen.findByTestId("group-buy-pickup-window");
    expect(row.textContent).toContain("group_buys.detail.pickup_label");
    expect(row.textContent).toContain("2099-01-02T07:00:00|2099-01-02T11:00:00");
    const title = screen.getByRole("heading", { level: 1 });
    expect(title.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("group-buy-details").contains(row)).toBe(false);
  });

  it("no window: no row", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף", delivery_note: null };
    await renderPage();
    await screen.findByTestId("group-buy-pickup-note");
    expect(screen.queryByTestId("group-buy-pickup-window")).toBeNull();
  });

  it("delivery only with a saved window: no pickup time row", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: null, delivery_note: "משלוח לחדרה", pickup_starts_at: "2099-01-02T07:00:00", pickup_ends_at: "2099-01-02T11:00:00" };
    await renderPage();
    await screen.findByTestId("group-buy-delivery-note");
    expect(screen.queryByTestId("group-buy-pickup-window")).toBeNull();
  });

  it("deadline passed: no pay line and no cancel section", async () => {
    fixture.gb = { deadline: "2000-01-01T00:00:00Z" };
    await renderPage();
    await screen.findByTestId("group-buy-fulfillment-note");
    expect(screen.queryByTestId("group-buy-pay-line")).toBeNull();
    expect(screen.queryByTestId("group-buy-cancel")).toBeNull();
  });

  it("a member with a window: «הוספה ליומן» puts the pickup in her calendar", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף מהמאפייה", delivery_note: null, pickup_starts_at: "2099-12-04T07:00:00", pickup_ends_at: "2099-12-04T11:00:00", user_committed: true, user_commit: { quantity: 1 } };
    await renderPage();
    const button = await screen.findByTestId("group-buy-add-to-calendar");
    button.click();
    expect(downloadIcs).toHaveBeenCalledWith(
      expect.objectContaining({ event_date: "2099-12-04", event_time: "09:00", end_time: "13:00", location: "איסוף מהמאפייה" }),
      expect.objectContaining({ filename: "group-buy-gb-1.ics" }),
    );
  });

  it("not a member, or no window: no calendar button", async () => {
    fixture.gb = { fulfillment_note: null, pickup_note: "איסוף", delivery_note: null, pickup_starts_at: "2099-12-04T07:00:00", pickup_ends_at: "2099-12-04T11:00:00" };
    await renderPage();
    await screen.findByTestId("group-buy-pickup-window");
    expect(screen.queryByTestId("group-buy-add-to-calendar")).toBeNull();
  });

  it("joinable: the pay line sits with the join button", async () => {
    await renderPage();
    const pay = await screen.findByTestId("group-buy-pay-line");
    expect(pay.textContent).toBe("group_buys.detail.pay_line");
  });
});
