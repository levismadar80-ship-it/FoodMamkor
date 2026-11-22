// MEH-3525 · MEH-3698: «ההזמנות שלי» — product orders, group buys and
// surprise bags in one list, «פעילות» / «קודמות», a tag per row.
// Matrix: 0 / 1 / many × each kind; one source off (404); one source failing;
// all failing; a malformed body.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";
import api from "@/lib/api";
import { israelToday } from "@/lib/israel-date";
import MyOrdersClient from "@/app/[locale]/my-orders/MyOrdersClient";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn() } }));
const push = vi.fn();
const router = { push }; // stable, like Next's
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/my-orders" }));
const authRef = { current: { user: { id: "u1" }, loading: false } };
vi.mock("@/lib/auth-context", () => ({ useAuth: () => authRef.current }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }) => <a href={href} {...rest}>{children}</a>,
}));

const P = "7d1f5f3e-1c2b-4e5a-9f00-000000000001";
const id = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
const DAY = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const NOW = Date.now();

const order = (n, status, name, created, slot = created) => ({
  id: id(n), status, producer_id: P, producer_name: name,
  created_at: created, can_cancel: false, customer_name: "דנה", delivery_city: null,
  delivery_fee_agorot: 0, estimated_total_agorot: 5000, expires_at: null, final_total_agorot: null,
  fulfilment: "pickup", items: [], note: null, phone_masked: "05x-xxx-1234", pickup_code: null,
  proposal: null, slot_start: slot, slot_end: slot,
});
const groupBuy = (n, status, name, deadline, pickup = null) => ({
  id: id(n), title: "שק תפוחי אדמה", producer_name: name, status, quantity: 1,
  unit: null, deadline, joined_at: iso(NOW - DAY), pickup_starts_at: pickup, pickup_ends_at: pickup,
});
const bag = (n, status, name, date, over = {}) => ({
  id: id(n), offer_id: id(n + 1), qty: 1, status, created_at: iso(NOW - DAY), date,
  pickup_start: iso(NOW + 60 * 60 * 1000), pickup_end: iso(NOW + 3 * 60 * 60 * 1000),
  producer_id: P, producer_name: name, cancelled_by_business: false, ...over,
});

const PATHS = { orders: "/users/me/product-orders", groupBuys: "/users/me/group-buys", bags: "/rescue/orders/history" };
/** Answer each path from `lists`; a key set to a number answers that HTTP error. */
function serve(lists = {}) {
  api.get.mockImplementation(async (path) => {
    const key = Object.keys(PATHS).find((k) => PATHS[k] === path);
    const v = lists[key] ?? [];
    if (typeof v === "number") throw { response: { status: v } };
    if (v === "malformed") return { data: key === "bags" ? [{ id: "x" }] : { orders: [{ id: "x" }], group_buys: [{ id: "x" }] } };
    return { data: key === "orders" ? { orders: v } : key === "groupBuys" ? { group_buys: v } : v };
  });
}

const copy = he.my_orders;
const mount = () => render(
  <NextIntlClientProvider locale="he" messages={he} onError={() => {}}>
    <MyOrdersClient />
  </NextIntlClientProvider>,
);
const rowsIn = (testId) => within(screen.getByTestId(testId)).getAllByTestId("my-orders-row");

describe("MyOrdersClient", () => {
  beforeEach(() => {
    api.get.mockReset();
    push.mockReset();
    authRef.current = { user: { id: "u1" }, loading: false };
  });

  it("reads all three lists", async () => {
    serve();
    mount();
    await screen.findByText(copy.empty);
    expect(api.get.mock.calls.map((c) => c[0]).sort()).toEqual(Object.values(PATHS).sort());
  });

  it("0 items in all three: the empty state with a way to the businesses", async () => {
    serve();
    mount();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
    expect(screen.getByText(copy.empty_cta).closest("a")).toHaveAttribute("href", expect.stringContaining("/producers"));
    expect(screen.queryByTestId("my-orders-active")).toBeNull();
    expect(screen.queryByTestId("my-orders-past")).toBeNull();
  });

  it("all three switched off (404): the empty state, not an error", async () => {
    serve({ orders: 404, groupBuys: 404, bags: 404 });
    mount();
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it("1 running order: one «פעילות» row with its tag, opening its status page; no «קודמות»", async () => {
    serve({ orders: [order(1, "confirmed", "מאפיית השכונה", "2026-11-18T09:00:00+00:00", iso(NOW + DAY))] });
    mount();
    await screen.findByTestId("my-orders-active");
    const [row] = rowsIn("my-orders-active");
    expect(row).toHaveTextContent(copy.kind.order);
    expect(row).toHaveTextContent("מאפיית השכונה · 18.11.2026 · " + copy.status.confirmed);
    expect(row).toHaveAttribute("href", `/order/${id(1)}`);
    expect(screen.getByText(copy.section_active)).toBeInTheDocument();
    expect(screen.queryByTestId("my-orders-past")).toBeNull();
  });

  it("1 finished group buy: only «קודמות», tagged and linked to the group", async () => {
    serve({ groupBuys: [groupBuy(2, "fulfilled", "חוות הגליל", "2026-11-01T10:00:00")] });
    mount();
    await screen.findByTestId("my-orders-past");
    const [row] = rowsIn("my-orders-past");
    expect(row).toHaveTextContent(he.home.whats_on.type.group_buy);
    expect(row).toHaveTextContent("חוות הגליל · 01.11.2026 · " + copy.group_buy_status.fulfilled);
    expect(row).toHaveAttribute("href", `/group-buys/${id(2)}`);
    expect(screen.queryByTestId("my-orders-active")).toBeNull();
  });

  it("today's reserved bag is running and opens the bag's page", async () => {
    const today = israelToday();
    serve({ bags: [bag(3, "reserved", "מאפיית ההצלה", today)] });
    mount();
    await screen.findByTestId("my-orders-active");
    const [row] = rowsIn("my-orders-active");
    expect(row).toHaveTextContent(he.home.whats_on.type.rescue);
    expect(row).toHaveTextContent(he.rescue.dashboard.status.reserved);
    expect(row).toHaveAttribute("href", `/rescue/${id(4)}`);
  });

  it("a bag from an earlier day is past and opens the business (its page is gone)", async () => {
    serve({ bags: [bag(3, "handed", "מאפיית ההצלה", "2026-11-02", { pickup_end: iso(NOW - 20 * DAY) })] });
    mount();
    await screen.findByTestId("my-orders-past");
    const [row] = rowsIn("my-orders-past");
    expect(row).toHaveTextContent("מאפיית ההצלה · 02.11.2026 · " + copy.bag_status.handed);
    expect(row).toHaveAttribute("href", `/producer/${P}`);
  });

  it("a bag the business cancelled says so", async () => {
    serve({ bags: [bag(3, "cancelled", "מאפיית ההצלה", "2026-11-02", { cancelled_by_business: true })] });
    mount();
    expect(await screen.findByTestId("my-orders-row")).toHaveTextContent(copy.bag_status.cancelled_by_business);
  });

  it("many of each: running nearest first, past newest first, kinds mixed", async () => {
    serve({
      orders: [
        order(1, "pending", "גבינות", iso(NOW - DAY), iso(NOW + 3 * DAY)),
        order(5, "handed", "מאפייה", iso(NOW - 10 * DAY)),
      ],
      groupBuys: [
        groupBuy(2, "open", "חווה", iso(NOW + 5 * DAY).replace("Z", "")),
        groupBuy(6, "cancelled", "חווה ב", iso(NOW - 2 * DAY).replace("Z", "")),
      ],
      bags: [bag(3, "reserved", "סלים", israelToday())],
    });
    mount();
    await screen.findByTestId("my-orders-past");
    const kinds = (testId) => rowsIn(testId).map((r) => r.dataset.kind);
    // The bag's pickup is in an hour, the order's slot in 3 days, the group's deadline in 5.
    expect(kinds("my-orders-active")).toEqual(["bag", "order", "group_buy"]);
    // Cancelled group 2 days ago, then the order handed 10 days ago.
    expect(kinds("my-orders-past")).toEqual(["group_buy", "order"]);
  });

  it("a status the page has no word for shows no status, not a wrong one", async () => {
    serve({ orders: [order(1, "refunded", "מאפיית השכונה", "2026-11-18T09:00:00+00:00")] });
    mount();
    const row = await screen.findByTestId("my-orders-row");
    expect(row).toHaveTextContent(/^הזמנהמאפיית השכונה · 18\.11\.2026$/);
  });

  it("one list failing: the others still show, with a note and a retry", async () => {
    serve({ orders: [order(1, "confirmed", "מאפיית השכונה", iso(NOW))], bags: 500 });
    mount();
    await screen.findByTestId("my-orders-active");
    expect(screen.getByTestId("my-orders-partial")).toHaveTextContent(copy.partial_error);
  });

  it("one list failing and the others empty is an error, never «you have nothing»", async () => {
    serve({ groupBuys: 500 });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
    expect(screen.queryByText(copy.empty)).toBeNull();
  });

  it("all three failing: an error with a retry that reads again", async () => {
    serve({ orders: 500, groupBuys: 500, bags: 500 });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
    serve();
    fireEvent.click(screen.getByTestId("my-orders-error-retry"));
    expect(await screen.findByText(copy.empty)).toBeInTheDocument();
  });

  it("a malformed body counts as that list failing (rule 19)", async () => {
    serve({ orders: "malformed", groupBuys: "malformed", bags: "malformed" });
    mount();
    expect(await screen.findByText(copy.load_error)).toBeInTheDocument();
  });

  it("a guest is sent to login and nothing is read", async () => {
    authRef.current = { user: null, loading: false };
    mount();
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
  });
});
