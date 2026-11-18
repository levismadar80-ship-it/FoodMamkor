/**
 * MEH-3316 — the business's «הזמנות» tab (stage 4 of on-site ordering).
 *
 * The lists are a matrix (CLAUDE.md 5-state rule): 0 / 1 / many orders × each
 * of the four list tabs, plus the buttons each status offers, the settings
 * body, and the week prefilled from producers.order_window. Rendered with the
 * real he.json, so missing keys and ICU plurals are read, not mocked.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import OrdersBoard from "@/components/dashboard/orders/OrdersBoard";
import { buttonsFor } from "@/components/dashboard/orders/OrderActions";
import { toBody } from "@/components/dashboard/orders/OrderSettingsCard";
import { prefillFrom } from "@/components/dashboard/orders/OrderWindowsCard";
import { agorotFromInput, groupOrders, israelDay, shekelsText, toPayAgorot } from "@/lib/product-orders";

const NOW = new Date("2026-11-19T08:00:00Z"); // Thursday 10:00 in Israel
const hours = (n) => new Date(NOW.getTime() + n * 3600 * 1000).toISOString();

function order(over = {}) {
  return {
    id: over.id ?? `o-${Math.random()}`,
    producer_id: "p-1",
    status: "pending",
    fulfilment: "pickup",
    slot_start: hours(2),
    slot_end: hours(3),
    items: [{ name: "חלה", qty: 2, unit_price_agorot: 2000, price_unit: "unit", price_is_estimate: false, contains_alcohol: false }],
    estimated_total_agorot: 4000,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    delivery_city: null,
    customer_name: "דנה לוי",
    customer_phone: "972501234567",
    delivery_address: null,
    note: null,
    proposal: null,
    created_at: NOW.toISOString(),
    expires_at: hours(24),
    age_declared: false,
    has_estimate: false,
    ...over,
  };
}

const renderBoard = (orders) =>
  render(
    <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
      <OrdersBoard orders={orders} onChanged={() => {}} />
    </NextIntlClientProvider>,
  );

describe("lists (groupOrders)", () => {
  it("sorts every status into exactly one of waiting / confirmed / done, and today is a time filter", () => {
    const orders = [
      order({ id: "a", status: "pending" }),
      order({ id: "b", status: "change_proposed", slot_start: hours(48), slot_end: hours(49) }),
      order({ id: "c", status: "confirmed" }),
      order({ id: "d", status: "ready", slot_start: hours(48), slot_end: hours(49) }),
      order({ id: "e", status: "handed" }),
      order({ id: "f", status: "expired" }),
    ];
    const lists = groupOrders(orders, NOW);
    const ids = (key) => lists[key].map((o) => o.id);
    expect(ids("waiting")).toEqual(["a", "b"]);
    expect(ids("confirmed")).toEqual(["c", "d"]);
    expect(ids("today")).toEqual(["a", "c"]);
    expect(ids("done")).toEqual(["f", "e"]);
  });

  it("today is the Israel day, not the UTC one (23:30 UTC is already tomorrow in Israel)", () => {
    expect(israelDay("2026-11-18T23:30:00Z")).toBe("2026-11-19");
  });
});

describe("money", () => {
  it("prints whole shekels without decimals and agorot with two", () => {
    expect(shekelsText(4000)).toBe("40");
    expect(shekelsText(4050)).toBe("40.50");
  });
  it("to pay = final total once set, else the estimate, plus delivery", () => {
    expect(toPayAgorot(order({ delivery_fee_agorot: 1500 }))).toBe(5500);
    expect(toPayAgorot(order({ final_total_agorot: 3700, delivery_fee_agorot: 1500 }))).toBe(5200);
  });
  it("reads typed shekels: empty is null, junk is NaN", () => {
    expect(agorotFromInput("12.5")).toBe(1250);
    expect(agorotFromInput(" ")).toBeNull();
    expect(Number.isNaN(agorotFromInput("abc"))).toBe(true);
  });
});

describe("board: 0 / 1 / many × the four lists", () => {
  it("0 orders: the approved empty state, no tabs", () => {
    renderBoard([]);
    expect(screen.getByText("עוד אין הזמנות. כשתגיע הראשונה, נודיע לכם בוואטסאפ ובמייל.")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("1 order: opens on «מחכות לטיפול» with the card; the other three lists are empty, «היום» included", () => {
    renderBoard([order({ slot_start: hours(30), slot_end: hours(31) })]);
    expect(screen.getByTestId("orders-tab-waiting")).toHaveAttribute("aria-selected", "true");
    expect(screen.getAllByTestId("order-card")).toHaveLength(1);
    for (const key of ["confirmed", "today", "done"]) {
      fireEvent.click(screen.getByTestId(`orders-tab-${key}`));
      expect(screen.getByTestId("orders-empty-list")).toHaveTextContent("אין כאן הזמנות כרגע.");
    }
  });

  it("many orders: each tab shows its count and only its own cards", () => {
    renderBoard([
      order({ id: "a" }),
      order({ id: "b" }),
      order({ id: "c", status: "confirmed" }),
      order({ id: "d", status: "handed" }),
    ]);
    expect(screen.getByTestId("orders-tab-waiting")).toHaveTextContent("מחכות לטיפול (2)");
    expect(screen.getAllByTestId("order-card")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("orders-tab-done"));
    const cards = screen.getAllByTestId("order-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByTestId("order-status")).toHaveTextContent("נמסרה");
    expect(within(cards[0]).queryByTestId("order-actions")).toBeNull();
  });

  it("with nothing waiting it opens on «מאושרות»", () => {
    renderBoard([order({ status: "confirmed" })]);
    expect(screen.getByTestId("orders-tab-confirmed")).toHaveAttribute("aria-selected", "true");
  });

  it("the card reads the business's facts: total with delivery, alcohol note, phone link", () => {
    renderBoard([order({ delivery_fee_agorot: 1500, age_declared: true, fulfilment: "delivery", delivery_address: "הרצל 1" })]);
    const card = screen.getByTestId("order-card");
    expect(within(card).getByTestId("order-total")).toHaveTextContent("לתשלום: 55 ₪");
    expect(card).toHaveTextContent("כולל משלוח 15 ₪");
    expect(card).toHaveTextContent("יש בהזמנה אלכוהול · לבקש תעודה מזהה במסירה");
    expect(card).toHaveTextContent("כתובת למשלוח: הרצל 1");
    expect(within(card).getByRole("link", { name: "טלפון" })).toHaveAttribute("href", "tel:+972501234567");
  });
});

describe("buttons per status", () => {
  const keys = (o, now = NOW) => buttonsFor(o, now).map((b) => b.key);
  it("pending: confirm / propose / decline; a weighed line opens the price dialog", () => {
    expect(keys(order())).toEqual(["confirm", "propose", "decline"]);
    expect(buttonsFor(order(), NOW)[0].dialog).toBeNull();
    expect(buttonsFor(order({ has_estimate: true }), NOW)[0].dialog).toBe("confirm");
  });
  it("confirmed pickup: ready first; no-show only after the slot ended", () => {
    expect(keys(order({ status: "confirmed" }))).toEqual(["ready", "handed", "cancel"]);
    expect(keys(order({ status: "confirmed" }), new Date(hours(4)))).toEqual(["ready", "handed", "no_show", "cancel"]);
  });
  it("confirmed delivery: no «מוכנה לאיסוף», hand-over is the main action", () => {
    const delivery = buttonsFor(order({ status: "confirmed", fulfilment: "delivery" }), NOW);
    expect(delivery.map((b) => b.key)).toEqual(["handed", "cancel"]);
    expect(delivery[0].primary).toBe(true);
  });
  it("waiting for the customer: only cancel; closed orders: nothing", () => {
    expect(keys(order({ status: "change_proposed" }))).toEqual(["cancel"]);
    for (const status of ["handed", "declined", "cancelled", "expired", "no_show"]) {
      expect(keys(order({ status }))).toEqual([]);
    }
  });
});

describe("settings body", () => {
  const form = {
    enabled: true,
    auto_confirm: false,
    cap: "",
    cancel_cutoff_hours: 2,
    shabbat_observant: false,
    minimum: "",
    slot_minutes: 60,
    lead_time_hours: 2,
  };
  it("sends every field, an empty minimum as null", () => {
    expect(toBody(form).body).toEqual({
      enabled: true,
      auto_confirm: false,
      auto_confirm_slot_cap: null,
      cancel_cutoff_hours: 2,
      shabbat_observant: false,
      min_order_agorot: null,
      slot_minutes: 60,
      lead_time_hours: 2,
    });
  });
  it("auto-confirm without a cap, or a junk amount, is stopped before the request", () => {
    expect(toBody({ ...form, auto_confirm: true }).problem).toBe("cap_required");
    expect(toBody({ ...form, minimum: "abc" }).problem).toBe("bad_amount");
    expect(toBody({ ...form, minimum: "80" }).body.min_order_agorot).toBe(8000);
  });
});

describe("hand-over week prefill", () => {
  it("turns the order-acceptance hours into pickup rows, weekday 0 = Sunday", () => {
    const rows = prefillFrom({ sunday: [{ open: "09:00", close: "12:00" }], friday: { open: "08:00", close: "13:00" } });
    expect(rows).toEqual([
      { weekday: 0, start_time: "09:00", end_time: "12:00", fulfilment: "pickup" },
      { weekday: 5, start_time: "08:00", end_time: "13:00", fulfilment: "pickup" },
    ]);
    expect(prefillFrom(null)).toEqual([]);
  });
});
