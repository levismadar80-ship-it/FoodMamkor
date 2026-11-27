/**
 * MEH-3962 — the business's «שולם» mark on an order card, the WhatsApp
 * payment reminder, and the «לא שולמו» filter on the board.
 *
 * Cells: the card × (not taken on · owed · paid · paid after it closed ·
 * no_show unpaid); the filter × (0 owed: hidden · 1 · many) × (off · on), and
 * the last owed order marked paid ending the filter. Real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));

import api from "@/lib/api";
import OrderCard from "@/components/dashboard/orders/OrderCard";
import OrdersBoard from "@/components/dashboard/orders/OrdersBoard";

const T = he.dashboard.producer.orders.paid;
const PAID_AT = "2026-11-27T19:00:00Z";

const wrap = (ui) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      {ui}
    </NextIntlClientProvider>,
  );

let seq = 0;
function order(over = {}) {
  seq += 1;
  return {
    id: `0a000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    producer_id: "7e57a6f0-0000-4000-8000-000000000007",
    status: "confirmed",
    fulfilment: "pickup",
    slot_start: "2026-11-30T07:00:00Z",
    slot_end: "2026-11-30T08:00:00Z",
    items: [{ name: "חלה", qty: 2, unit_price_agorot: 2800, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 5600,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    delivery_city: null,
    customer_name: "דנה לוי",
    customer_phone: "972501234567",
    delivery_address: null,
    note: null,
    proposal: null,
    created_at: "2026-11-27T10:00:00Z",
    expires_at: null,
    age_declared: false,
    has_estimate: false,
    repeat: null,
    paid_at: null,
    ...over,
  };
}

/** What the server says: owed = taken on, not paid (handed from the cutoff). */
const owed = (over = {}) => order({ owed: true, ...over });

beforeEach(() => vi.clearAllMocks());

describe("the order card", () => {
  it("an order not taken on yet shows no mark, badge or reminder", () => {
    wrap(<ul><OrderCard order={order({ status: "pending" })} onChanged={vi.fn()} /></ul>);
    expect(screen.queryByTestId("order-paid-control")).toBeNull();
    expect(screen.queryByTestId("order-unpaid-badge")).toBeNull();
  });

  it("an owed order: «לא שולם», the mark, and a reminder with name and total", () => {
    wrap(<ul><OrderCard order={owed()} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-unpaid-badge").textContent).toBe(T.unpaid);
    expect(screen.getByTestId("order-paid-mark").textContent).toContain(T.mark);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByTestId("order-paid-remind"));
    const href = decodeURIComponent(open.mock.calls[0][0]);
    open.mockRestore();
    expect(href).toContain("https://wa.me/972501234567?text=");
    expect(href).toContain("שלום דנה לוי");
    expect(href).toContain("56 ₪");
  });

  it("marking sends paid: true and shows the server's order", async () => {
    const onChanged = vi.fn();
    const o = owed();
    api.post.mockResolvedValue({ data: { ...o, paid_at: PAID_AT, owed: false } });
    wrap(<ul><OrderCard order={o} onChanged={onChanged} /></ul>);
    fireEvent.click(screen.getByTestId("order-paid-mark"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith(`/producers/me/product-orders/${o.id}/paid`, { paid: true });
    expect(onChanged.mock.calls[0][0].paid_at).toBe(PAID_AT);
  });

  it("a paid order: «✓ שולם» and undo, no badge, no reminder", async () => {
    const o = order({ paid_at: PAID_AT });
    api.post.mockResolvedValue({ data: { ...o, paid_at: null } });
    wrap(<ul><OrderCard order={o} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-paid").textContent).toBe(`✓ ${T.paid}`);
    expect(screen.queryByTestId("order-unpaid-badge")).toBeNull();
    expect(screen.queryByTestId("order-paid-remind")).toBeNull();
    fireEvent.click(screen.getByTestId("order-paid-undo"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/producers/me/product-orders/${o.id}/paid`, { paid: false }));
  });

  it("a mark on an order that closed since can still be undone", () => {
    wrap(<ul><OrderCard order={order({ status: "cancelled", paid_at: PAID_AT })} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-paid-undo")).toBeTruthy();
  });

  it("a no-show can be marked, but is not owed", () => {
    wrap(<ul><OrderCard order={order({ status: "no_show" })} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-paid-mark")).toBeTruthy();
    expect(screen.queryByTestId("order-unpaid-badge")).toBeNull();
    expect(screen.queryByTestId("order-paid-remind")).toBeNull();
  });

  it("a weighed order with no final total: the reminder names no sum", () => {
    wrap(<ul><OrderCard order={owed({ has_estimate: true, final_total_agorot: null })} onChanged={vi.fn()} /></ul>);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    fireEvent.click(screen.getByTestId("order-paid-remind"));
    const text = decodeURIComponent(open.mock.calls[0][0]);
    open.mockRestore();
    expect(text).toContain("שלום דנה לוי");
    expect(text).not.toContain("₪");
  });

  it("a handed order the server does not count as owed shows no badge or reminder", () => {
    wrap(<ul><OrderCard order={order({ status: "handed", owed: false })} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-paid-mark")).toBeTruthy();
    expect(screen.queryByTestId("order-unpaid-badge")).toBeNull();
    expect(screen.queryByTestId("order-paid-remind")).toBeNull();
  });

  it("an erased buyer (no phone) gets no reminder button", () => {
    wrap(<ul><OrderCard order={owed({ status: "handed", customer_phone: "" })} onChanged={vi.fn()} /></ul>);
    expect(screen.getByTestId("order-unpaid-badge")).toBeTruthy();
    expect(screen.queryByTestId("order-paid-remind")).toBeNull();
  });

  it("a refused mark shows the server's Hebrew", async () => {
    api.post.mockRejectedValue({ response: { data: { detail: "אפשר לסמן «שולם» רק בהזמנה שאישרתם" } } });
    wrap(<ul><OrderCard order={owed()} onChanged={vi.fn()} /></ul>);
    fireEvent.click(screen.getByTestId("order-paid-mark"));
    expect(await screen.findByText("אפשר לסמן «שולם» רק בהזמנה שאישרתם")).toBeTruthy();
  });
});

describe("the «לא שולמו» filter", () => {
  it("is hidden when nothing is owed", () => {
    wrap(<OrdersBoard orders={[order({ paid_at: PAID_AT }), order({ status: "pending" })]} onChanged={vi.fn()} />);
    expect(screen.queryByTestId("orders-owed-filter")).toBeNull();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("one owed: counts 1, on shows that order only, off brings the tabs back", () => {
    const one = owed({ customer_name: "חייבת אחת" });
    wrap(<OrdersBoard orders={[one, order({ status: "pending" }), order({ paid_at: PAID_AT })]} onChanged={vi.fn()} />);
    const button = screen.getByTestId("orders-owed-filter");
    expect(button.textContent).toBe(T.filter.replace("{count}", "1"));
    expect(button.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(button);
    const list = screen.getByTestId("orders-owed-list");
    expect(within(list).getAllByTestId("order-card")).toHaveLength(1);
    expect(within(list).getByText("חייבת אחת")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    const pressed = screen.getByTestId("orders-owed-filter");
    expect(pressed.getAttribute("aria-pressed")).toBe("true");
    expect(pressed.textContent).toBe(T.filter.replace("{count}", "1"));
    fireEvent.click(screen.getByTestId("orders-owed-filter"));
    expect(screen.getByRole("tablist")).toBeTruthy();
  });

  it("many owed across lists, none of the paid or open ones", () => {
    const orders = [
      owed({ status: "confirmed" }),
      owed({ status: "ready" }),
      owed({ status: "handed" }),
      order({ status: "handed", owed: false }),
      order({ status: "confirmed", paid_at: PAID_AT }),
      order({ status: "pending" }),
      order({ status: "cancelled" }),
    ];
    wrap(<OrdersBoard orders={orders} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId("orders-owed-filter"));
    const shown = within(screen.getByTestId("orders-owed-list")).getAllByTestId("order-card");
    expect(shown.map((li) => li.getAttribute("data-status")).sort()).toEqual(["confirmed", "handed", "ready"]);
  });

  it("the last owed order marked paid ends the filter", () => {
    const last = owed();
    const { rerender } = wrap(<OrdersBoard orders={[last]} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByTestId("orders-owed-filter"));
    expect(screen.getByTestId("orders-owed-list")).toBeTruthy();
    rerender(
      <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
        <OrdersBoard orders={[{ ...last, paid_at: PAID_AT, owed: false }]} onChanged={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("orders-owed-list")).toBeNull();
    expect(screen.queryByTestId("orders-owed-filter")).toBeNull();
    expect(screen.getByRole("tablist")).toBeTruthy();
  });
});

describe("loading the owed orders", () => {
  it("adds an owed order the latest handed page missed, once", async () => {
    const { withOwed } = await import("@/lib/order-paid");
    const seen = owed({ status: "handed" });
    const older = owed({ status: "handed" });
    const merged = withOwed([seen, order({ status: "pending" })], [seen, older]);
    expect(merged.map((o) => o.id)).toEqual([seen.id, merged[1].id, older.id]);
  });
});
