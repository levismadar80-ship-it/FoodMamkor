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
import OrderSettingsCard, { businessIdFromInput, toBody } from "@/components/dashboard/orders/OrderSettingsCard";
import OrderWindowsCard, { prefillFrom } from "@/components/dashboard/orders/OrderWindowsCard";
import api from "@/lib/api";
import {
  PAGE_LIMIT,
  agorotFromInput,
  groupOrders,
  isSetUp,
  israelDay,
  localPhone,
  loadOrders,
  rangeEnds,
  shekelsText,
  toPayAgorot,
} from "@/lib/product-orders";

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

  it("the slot's two times are one left-to-right run, so RTL does not swap them", () => {
    const start = "2026-11-19T19:08:00Z"; // 21:08 in Israel
    const end = "2026-11-19T20:08:00Z";
    expect(rangeEnds(start, end)).toEqual({ from: "\u206621:08", until: "22:08\u2069" });
    renderBoard([order({ slot_start: start, slot_end: end })]);
    expect(screen.getByTestId("order-slot").textContent).toContain("\u206621:08–22:08\u2069");
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
    const phone = within(card).getByRole("link", { name: "טלפון" });
    expect(phone).toHaveAttribute("href", "tel:+972501234567");
    expect(phone).toHaveTextContent("050-123-4567");
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
    businessId: "512345678",
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
      business_id_number: "512345678",
    });
  });
  it("auto-confirm without a cap, or a junk amount, is stopped before the request", () => {
    expect(toBody({ ...form, auto_confirm: true }).problem).toBe("cap_required");
    expect(toBody({ ...form, auto_confirm: true, cap: "0" }).problem).toBe("cap_required");
    expect(toBody({ ...form, cap: "0" }).body.auto_confirm_slot_cap).toBeNull();
    expect(toBody({ ...form, minimum: "abc" }).problem).toBe("bad_amount");
    expect(toBody({ ...form, minimum: "80" }).body.min_order_agorot).toBe(8000);
  });
  it("«מספר עוסק»: required while ordering is on, optional while it is off, 9 digits", () => {
    expect(toBody({ ...form, businessId: "" }).problem).toBe("business_id_required");
    expect(toBody({ ...form, enabled: false, businessId: "" }).body.business_id_number).toBeNull();
    expect(toBody({ ...form, businessId: "123" }).problem).toBe("business_id_format");
    expect(toBody({ ...form, enabled: false, businessId: "12a456789" }).problem).toBe("business_id_format");
  });
});

describe("businessIdFromInput", () => {
  it("strips spaces and dashes, pads an 8-digit number, refuses anything else", () => {
    expect(businessIdFromInput("51-234567-8")).toBe("512345678");
    expect(businessIdFromInput(" 512 345 678 ")).toBe("512345678");
    expect(businessIdFromInput("12345678")).toBe("012345678");
    expect(businessIdFromInput("")).toBeNull();
    expect(businessIdFromInput(undefined)).toBeNull();
    expect(businessIdFromInput("1234567")).toBeNaN();
    expect(businessIdFromInput("1234567890")).toBeNaN();
    expect(businessIdFromInput("51234567x")).toBeNaN();
    expect(businessIdFromInput("\u200f51\u2011234567\u00a08")).toBe("512345678"); // a paste from a Hebrew document
    expect(businessIdFromInput("١٢٣٤٥٦٧٨٩")).toBeNaN(); // non-ASCII digits: the server's CHECK is [0-9]
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

describe("loading the orders (server cap 50 a page)", () => {
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  it("pages every open status in full, takes the latest page of each closed one, never asks above the cap", async () => {
    const totals = { pending: 120, change_proposed: 0, confirmed: 3, ready: 0, handed: 70, declined: 0, cancelled: 0, expired: 0, no_show: 0 };
    api.get.mockImplementation((_url, { params }) => {
      const total = totals[params.status];
      const count = Math.max(0, Math.min(params.limit, total - (params.offset ?? 0)));
      const orders = Array.from({ length: count }, (_, i) =>
        order({ id: uuid((params.offset ?? 0) + i + 1), producer_id: uuid(999), status: params.status, created_at: NOW.toISOString() }),
      );
      return Promise.resolve({ data: { orders, total } });
    });
    const orders = await loadOrders();
    const limits = api.get.mock.calls.map(([, { params }]) => params.limit);
    expect(Math.max(...limits)).toBeLessThanOrEqual(PAGE_LIMIT);
    expect(PAGE_LIMIT).toBe(50);
    const count = (status) => orders.filter((o) => o.status === status).length;
    expect(count("pending")).toBe(120);
    expect(count("confirmed")).toBe(3);
    expect(count("handed")).toBe(50);
    const handedOffsets = api.get.mock.calls.filter(([, { params }]) => params.status === "handed" && params.limit > 1);
    expect(handedOffsets.map(([, { params }]) => params.offset)).toEqual([20]);
  });
});

describe("list tabs keyboard (RTL)", () => {
  it("ArrowLeft moves to the next tab and only the current tab is in the tab order", () => {
    renderBoard([order(), order({ status: "confirmed" })]);
    const waiting = screen.getByTestId("orders-tab-waiting");
    expect(waiting).toHaveAttribute("tabindex", "0");
    expect(screen.getByTestId("orders-tab-confirmed")).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(waiting, { key: "ArrowLeft" });
    expect(screen.getByTestId("orders-tab-confirmed")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "orders-tab-btn-confirmed");
  });
});

describe("phone as the business reads it", () => {
  it("an Israeli mobile prints in local form; anything else stays international", () => {
    expect(localPhone("972501234567")).toBe("050-123-4567");
    expect(localPhone("972541112233")).toBe("054-111-2233");
    expect(localPhone("447700900123")).toBe("+447700900123");
    expect(localPhone("97221234567")).toBe("+97221234567");
  });
});

describe("settings cards: open until ordering is set up, closed after", () => {
  const settings = {
    enabled: true, auto_confirm: false, auto_confirm_cap: null, cancel_cutoff_hours: 2,
    shabbat_observant: false, min_order_agorot: null, slot_minutes: 60, lead_time_hours: 2,
    business_id_number: "512345678",
  };
  const win = { weekday: 0, start_time: "09:00", end_time: "12:00", fulfilment: "pickup" };
  const wrap = (node) => render(<NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>);

  it("set up = on with at least one window: 0 windows no, 1 yes, many yes, off never", () => {
    expect(isSetUp(settings, [])).toBe(false);
    expect(isSetUp(settings, [win])).toBe(true);
    expect(isSetUp(settings, [win, win, win])).toBe(true);
    expect(isSetUp({ ...settings, enabled: false }, [win, win])).toBe(false);
    expect(isSetUp(null, [win])).toBe(false);
    expect(isSetUp({ ...settings, business_id_number: null }, [win])).toBe(false); // no «מספר עוסק», takes no orders
  });

  it("closed: the title shows, the fields are folded; a tap on the title opens them", () => {
    wrap(<><OrderSettingsCard settings={settings} onSaved={() => {}} collapsed /><OrderWindowsCard windows={[win]} orderWindow={null} collapsed /></>);
    for (const id of ["order-settings", "order-windows"]) {
      const card = screen.getByTestId(id);
      expect(card).not.toHaveAttribute("open");
      fireEvent.click(within(card).getByRole("heading"));
      expect(card).toHaveAttribute("open");
    }
  });

  it("open: both cards start unfolded", () => {
    wrap(<><OrderSettingsCard settings={settings} onSaved={() => {}} /><OrderWindowsCard windows={[]} orderWindow={null} /></>);
    expect(screen.getByTestId("order-settings")).toHaveAttribute("open");
    expect(screen.getByTestId("order-windows")).toHaveAttribute("open");
  });
});
