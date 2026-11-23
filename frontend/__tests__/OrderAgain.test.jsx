/**
 * MEH-3764 — «להזמין שוב»: a finished order's items go back in the cart on the
 * business page. What is still on the menu is added; what was deleted, left
 * the menu or sold out is named in the toast (Wolt «Order again», Amazon «Buy
 * it again»). Cells: the button per status × lines (none / some / all gone),
 * the hand-off in sessionStorage, and the merge against the live menu
 * (all added / some skipped / none / business not taking orders).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

const { push, toast, menuRead } = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
  menuRead: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/toast", () => ({ showToast: toast }));
vi.mock("@/lib/order-cart", async (actual) => ({ ...(await actual()), loadOrderMenu: (id) => menuRead(id) }));

import { OrderStatusView } from "@/app/[locale]/order/[id]/OrderStatusClient";
import { applyOrderAgain, canOrderAgain, orderAgainLines, stashOrderAgain, takeOrderAgain } from "@/lib/order-again";
import { useOrderCart } from "@/lib/use-order-cart";

const SHOP = "1a000000-0000-4000-8000-000000000001";
const BREAD = "2b000000-0000-4000-8000-000000000002";
const CHEESE = "3c000000-0000-4000-8000-000000000003";
const BIG = "4d000000-0000-4000-8000-000000000004";

const breadLine = { product_id: BREAD, variant_id: null, name: "חלה", variant_name: null, qty: 2 };
const cheeseLine = { product_id: CHEESE, variant_id: BIG, name: "גבינה", variant_name: "גדול", qty: 1 };
const goneLine = { product_id: null, variant_id: null, name: "עוגה", variant_name: null, qty: 1 };

const product = (id, name, over = {}) => ({
  id,
  name,
  in_stock: true,
  variants: [],
  price_min_agorot: 2800,
  price_max_agorot: 2800,
  ...over,
});
const bread = product(BREAD, "חלה");
const cheese = product(CHEESE, "גבינה", { variants: [{ id: BIG, name: "גדול", price_agorot: 5000, in_stock: true }] });

const wrapper = ({ children }) => (
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
    {children}
  </NextIntlClientProvider>
);

const order = (over) => ({
  id: "0a000000-0000-4000-8000-00000000000a",
  producer_id: SHOP,
  status: "handed",
  fulfilment: "pickup",
  slot_start: "2026-11-20T07:00:00Z",
  slot_end: "2026-11-20T08:00:00Z",
  items: [breadLine, cheeseLine],
  estimated_total_agorot: 0,
  final_total_agorot: 0,
  delivery_fee_agorot: 0,
  proposal: null,
  expires_at: null,
  producer_name: "המאפייה של רותי",
  pickup_address: null,
  pickup_code: null,
  can_cancel: false,
  review_url: null,
  ...over,
});

const show = (over) => render(<OrderStatusView order={order(over)} onChange={() => {}} refOf={() => ({})} />, { wrapper });

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());

describe("the «להזמין שוב» button on the order page", () => {
  it.each(["handed", "cancelled", "declined", "expired", "no_show"])("%s: shown", (status) => {
    show({ status });
    expect(screen.getByTestId("order-again").textContent).toBe("להזמין שוב");
  });

  it.each(["pending", "change_proposed", "confirmed", "ready"])("%s (still open): not shown", (status) => {
    show({ status });
    expect(screen.queryByTestId("order-again")).toBeNull();
  });

  it("every product of the order was deleted: not shown", () => {
    show({ items: [goneLine] });
    expect(screen.queryByTestId("order-again")).toBeNull();
  });

  it("one product left of two: shown", () => {
    expect(canOrderAgain(order({ items: [goneLine, breadLine] }))).toBe(true);
  });

  it("click: the lines are stashed for this business and the business page opens", () => {
    show({ items: [breadLine, cheeseLine, goneLine] });
    fireEvent.click(screen.getByTestId("order-again"));
    expect(push).toHaveBeenCalledWith(`/producer/${SHOP}`);
    expect(takeOrderAgain(SHOP)?.lines).toEqual([
      { key: BREAD, qty: 2, name: "חלה" },
      { key: `${CHEESE}~${BIG}`, qty: 1, name: "גבינה · גדול" },
      { key: null, qty: 1, name: "עוגה" },
    ]);
  });

  it("with a review link the review stays the main button and «להזמין שוב» is outlined", () => {
    show({ review_url: "https://mehamakor.co.il/p/ruti?rt=abc" });
    expect(screen.getByTestId("order-again").className).not.toBe(screen.getByTestId("order-write-review").className);
  });
});

describe("the hand-off (sessionStorage)", () => {
  it("is read once, and only by the business it was left for", () => {
    stashOrderAgain(SHOP, [breadLine]);
    expect(takeOrderAgain("another-business")).toBeNull();
    expect(takeOrderAgain(SHOP)?.lines).toHaveLength(1);
    expect(takeOrderAgain(SHOP)).toBeNull();
  });

  it("a stash older than half an hour is dropped", () => {
    vi.useFakeTimers({ now: new Date("2026-11-23T10:00:00Z") });
    stashOrderAgain(SHOP, [breadLine]);
    vi.setSystemTime(new Date("2026-11-23T10:31:00Z"));
    expect(takeOrderAgain(SHOP)).toBeNull();
  });

  it("broken storage content reads as nothing", () => {
    sessionStorage.setItem("meh_order_again", "{not json");
    expect(takeOrderAgain(SHOP)).toBeNull();
  });

  it("a quantity past the cap is cut to it", () => {
    expect(orderAgainLines([{ ...breadLine, qty: 500 }])[0].qty).toBe(99);
  });
});

describe("the merge against the live menu", () => {
  const lines = orderAgainLines([breadLine, cheeseLine, goneLine]);

  it("adds what is orderable and names the rest", () => {
    const res = applyOrderAgain({}, lines, [bread, cheese]);
    expect(res.picks).toEqual({ [BREAD]: 2, [`${CHEESE}~${BIG}`]: 1 });
    expect(res.skipped).toEqual(["עוגה"]);
  });

  it("a sold-out product and a sold-out variant are skipped by name", () => {
    const soldOut = { ...cheese, variants: [{ ...cheese.variants[0], in_stock: false }] };
    const res = applyOrderAgain({}, lines, [{ ...bread, in_stock: false }, soldOut]);
    expect(res.added).toBe(0);
    expect(res.skipped).toEqual(["חלה", "גבינה · גדול", "עוגה"]);
  });

  it("a product that left the menu is skipped by name", () => {
    const res = applyOrderAgain({}, lines, [cheese]);
    expect(res.picks).toEqual({ [`${CHEESE}~${BIG}`]: 1 });
    expect(res.skipped).toEqual(["חלה", "עוגה"]);
  });

  it("keeps what is already in the cart, at the higher quantity", () => {
    const res = applyOrderAgain({ [BREAD]: 5 }, lines, [bread, cheese]);
    expect(res.picks[BREAD]).toBe(5);
  });
});

describe("the business page cart (useOrderCart) takes the stash", () => {
  const takes = { id: SHOP, takes_site_orders: true };

  it("all orderable: the cart fills and the toast says so", async () => {
    menuRead.mockResolvedValue({ products: [bread, cheese] });
    stashOrderAgain(SHOP, [breadLine, cheeseLine]);
    const { result } = renderHook(() => useOrderCart(takes), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(3));
    expect(toast.success).toHaveBeenCalledWith("הוספנו להזמנה את הפריטים מהפעם הקודמת");
    expect(takeOrderAgain(SHOP)).toBeNull();
  });

  it("some gone: the rest is added and the toast names what is not", async () => {
    menuRead.mockResolvedValue({ products: [bread] });
    stashOrderAgain(SHOP, [breadLine, cheeseLine, goneLine]);
    const { result } = renderHook(() => useOrderCart(takes), { wrapper });
    await waitFor(() => expect(result.current.count).toBe(2));
    expect(toast.info).toHaveBeenCalledWith("הוספנו את מה שאפשר להזמין עכשיו. לא זמינים כרגע: גבינה · גדול, עוגה");
  });

  it("nothing orderable: the cart stays empty and the toast says so", async () => {
    menuRead.mockResolvedValue({ products: [] });
    stashOrderAgain(SHOP, [breadLine]);
    renderHook(() => useOrderCart(takes), { wrapper });
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("הפריטים מהפעם הקודמת לא זמינים כרגע"));
  });

  it("the business stopped taking site orders: no menu read, the toast says so", async () => {
    stashOrderAgain(SHOP, [breadLine]);
    renderHook(() => useOrderCart({ id: SHOP, takes_site_orders: false }), { wrapper });
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith("בית העסק לא מקבל כרגע הזמנות באתר"));
    expect(menuRead).not.toHaveBeenCalled();
  });

  it("no stash: an ordinary visit shows no toast", async () => {
    menuRead.mockResolvedValue({ products: [bread] });
    renderHook(() => useOrderCart(takes), { wrapper });
    await waitFor(() => expect(menuRead).toHaveBeenCalled());
    await act(async () => {});
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
