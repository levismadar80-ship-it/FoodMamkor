/**
 * MEH-3216 gaps — four things a business needs to run on-site orders day to
 * day, added after the stage-4 review with Sapir (approved copy, 18/11):
 * the products' two switches, «מה להכין», «וואטסאפ ללקוח», and the per-slot
 * cap that now holds for manual confirmation too.
 *
 * 5-state rule: the products card and the prep list are each 0 / 1 / many,
 * and the products card is folded / open. Rendered with the real he.json.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import he from "../messages/he.json";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));

import OrderCard from "@/components/dashboard/orders/OrderCard";
import OrderPrepList from "@/components/dashboard/orders/OrderPrepList";
import OrderProductsCard from "@/components/dashboard/orders/OrderProductsCard";
import OrdersBoard from "@/components/dashboard/orders/OrdersBoard";
import OrderSettingsCard, { toBody } from "@/components/dashboard/orders/OrderSettingsCard";
import api from "@/lib/api";
import { prepList } from "@/lib/product-ordering";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

const wrap = (node) => (
  <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">
    {node}
  </NextIntlClientProvider>
);

function product(over = {}) {
  return {
    id: P1,
    name: "חלה",
    has_price: true,
    is_orderable: false,
    in_stock: true,
    price_unit: "unit",
    contains_alcohol: false,
    ...over,
  };
}

const line = (name, qty) => ({
  name,
  qty,
  unit_price_agorot: 2000,
  price_unit: "unit",
  price_is_estimate: false,
  contains_alcohol: false,
});

function order(over = {}) {
  const start = new Date(Date.now() + 3600 * 1000).toISOString();
  return {
    id: over.id ?? `o-${Math.random()}`,
    status: "confirmed",
    fulfilment: "pickup",
    slot_start: start,
    slot_end: start,
    items: [line("חלה", 2)],
    estimated_total_agorot: 4000,
    final_total_agorot: null,
    delivery_fee_agorot: 0,
    customer_name: "דנה לוי",
    customer_phone: "972501234567",
    delivery_address: null,
    note: null,
    expires_at: null,
    age_declared: false,
    has_estimate: false,
    ...over,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("«מה להכין» (prepList)", () => {
  it("0 orders, or only requests not yet confirmed: nothing to prepare", () => {
    expect(prepList([])).toEqual([]);
    expect(prepList([order({ status: "pending" }), order({ status: "change_proposed" })])).toEqual([]);
  });

  it("1 order: its own lines", () => {
    expect(prepList([order({ items: [line("חלה", 2), line("עוגה", 1)] })])).toEqual([
      { name: "חלה", count: 2 },
      { name: "עוגה", count: 1 },
    ]);
  });

  it("many orders: summed by product, confirmed and ready both count, the biggest first", () => {
    const todays = [
      order({ items: [line("עוגה", 1)] }),
      order({ status: "ready", items: [line("חלה", 2), line("עוגה", 3)] }),
      order({ status: "pending", items: [line("חלה", 9)] }),
    ];
    expect(prepList(todays)).toEqual([
      { name: "עוגה", count: 4 },
      { name: "חלה", count: 2 },
    ]);
  });

  it("renders nothing with nothing to prepare, and the approved title and lines otherwise", () => {
    const { container, rerender } = render(wrap(<OrderPrepList todays={[order({ status: "pending" })]} />));
    expect(container.querySelector('[data-testid="orders-prep"]')).toBeNull();
    rerender(wrap(<OrderPrepList todays={[order({ items: [line("חלה", 3)] })]} />));
    const box = screen.getByTestId("orders-prep");
    expect(within(box).getByRole("heading", { name: "מה להכין" })).toBeTruthy();
    expect(within(box).getByText("3 × חלה")).toBeTruthy();
  });

  it("shows on the «היום» tab only", () => {
    // «היום» is the Israel day of the clock: pin the clock (10:00 in Israel),
    // or this goes red when the suite runs after 21:00 UTC.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T08:00:00Z"));
    try {
      const slot = "2026-11-19T10:00:00Z";
      render(wrap(<OrdersBoard orders={[order({ slot_start: slot, slot_end: slot })]} onChanged={() => {}} />));
      expect(screen.queryByTestId("orders-prep")).toBeNull(); // opens on «מאושרות»
      fireEvent.click(screen.getByTestId("orders-tab-today"));
      expect(screen.getByTestId("orders-prep")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("«וואטסאפ ללקוח» on the card", () => {
  it("opens a chat with the buyer's number, next to the phone link", () => {
    render(wrap(<ul><OrderCard order={order()} onChanged={() => {}} /></ul>));
    const link = screen.getByTestId("order-whatsapp");
    expect(link.textContent).toBe("וואטסאפ ללקוח");
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/972501234567\?/);
    expect(link.getAttribute("rel")).toContain("noopener");
  });
});

describe("products card: 0 / 1 / many × folded / open", () => {
  it("0 products: renders nothing", () => {
    const { container } = render(wrap(<OrderProductsCard initial={[]} />));
    expect(container.innerHTML).toBe("");
  });

  it("1 product: both approved switches; «אזל כרגע» is on when not in stock", () => {
    render(wrap(<OrderProductsCard initial={[product({ in_stock: false })]} />));
    const row = screen.getByTestId("order-product");
    expect(within(row).getByText("פתוח להזמנה באתר")).toBeTruthy();
    expect(within(row).getByText("אזל כרגע")).toBeTruthy();
    expect(screen.getByTestId(`orderable-${P1}`).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByTestId(`sold-out-${P1}`).getAttribute("aria-checked")).toBe("true");
  });

  it("many products: one row each, in the order given", () => {
    render(wrap(<OrderProductsCard initial={[product(), product({ id: P2, name: "עוגה" })]} />));
    expect(screen.getAllByTestId("order-product").map((r) => r.querySelector("p").textContent)).toEqual(["חלה", "עוגה"]);
  });

  it("set up with a product open for ordering: starts folded", () => {
    render(wrap(<OrderProductsCard setUp initial={[product({ is_orderable: true })]} />));
    expect(screen.getByTestId("order-products").open).toBe(false);
  });

  it("set up but nothing open for ordering yet: starts open", () => {
    render(wrap(<OrderProductsCard setUp initial={[product({ is_orderable: false })]} />));
    expect(screen.getByTestId("order-products").open).toBe(true);
  });

  it("set up, nothing open yet: flipping the first product open does not snap the card shut", async () => {
    api.put.mockResolvedValue({ data: { id: P1, is_orderable: true, in_stock: true, price_unit: "unit", contains_alcohol: false } });
    render(wrap(<OrderProductsCard setUp initial={[product()]} />));
    await act(async () => fireEvent.click(screen.getByTestId(`orderable-${P1}`)));
    expect(screen.getByTestId(`orderable-${P1}`).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("order-products").open).toBe(true);
  });

  it("a tap sends the whole row with only that field changed, and the switch follows the answer", async () => {
    api.put.mockResolvedValue({ data: { id: P1, is_orderable: true, in_stock: true, price_unit: "kg", contains_alcohol: true } });
    render(wrap(<OrderProductsCard initial={[product({ price_unit: "kg", contains_alcohol: true })]} />));
    await act(async () => fireEvent.click(screen.getByTestId(`orderable-${P1}`)));
    expect(api.put).toHaveBeenCalledWith(`/producers/me/products/${P1}/ordering`, {
      is_orderable: true,
      in_stock: true,
      price_unit: "kg",
      contains_alcohol: true,
    });
    expect(screen.getByTestId(`orderable-${P1}`).getAttribute("aria-checked")).toBe("true");
  });

  it("«אזל כרגע» on sends in_stock false", async () => {
    api.put.mockResolvedValue({ data: { id: P1, is_orderable: false, in_stock: false, price_unit: "unit", contains_alcohol: false } });
    render(wrap(<OrderProductsCard initial={[product()]} />));
    await act(async () => fireEvent.click(screen.getByTestId(`sold-out-${P1}`)));
    expect(api.put.mock.calls[0][1].in_stock).toBe(false);
    expect(screen.getByTestId(`sold-out-${P1}`).getAttribute("aria-checked")).toBe("true");
  });

  it("a refusal shows the server's Hebrew reason and leaves the switch as it was", async () => {
    const detail = "כדי לאפשר הזמנה של המוצר צריך לקבוע לו מחיר";
    api.put.mockRejectedValue({ response: { status: 422, data: { detail } } });
    render(wrap(<OrderProductsCard initial={[product({ has_price: false })]} />));
    await act(async () => fireEvent.click(screen.getByTestId(`orderable-${P1}`)));
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.getByTestId(`orderable-${P1}`).getAttribute("aria-checked")).toBe("false");
  });

  it("reads the products itself when not given them", async () => {
    api.get.mockResolvedValue({ data: { products: [product()] } });
    await act(async () => {
      render(wrap(<OrderProductsCard />));
    });
    expect(api.get).toHaveBeenCalledWith("/producers/me/products/ordering");
    expect(screen.getByTestId("order-product")).toBeTruthy();
  });
});

describe("per-slot cap: also without auto-confirm", () => {
  const form = {
    enabled: true,
    auto_confirm: false,
    cap: "4",
    cancel_cutoff_hours: 24,
    shabbat_observant: true,
    minimum: "",
    slot_minutes: 60,
    lead_time_hours: 24,
  };

  it("a cap typed with auto-confirm off is sent, not dropped", () => {
    expect(toBody(form).body.auto_confirm_slot_cap).toBe(4);
    expect(toBody({ ...form, cap: "" }).body.auto_confirm_slot_cap).toBeNull();
  });

  it("auto-confirm on, then off again: the default it filled in does not stay behind as a cap", async () => {
    api.put.mockResolvedValue({ data: {} });
    const settings = { ...form, auto_confirm_slot_cap: null, min_order_agorot: null, alcohol_licensed: false, producer_id: P1 };
    render(wrap(<OrderSettingsCard settings={settings} onSaved={() => {}} />));
    const cap = screen.getByTestId("orders-slot-cap");
    fireEvent.click(screen.getByTestId("orders-auto"));
    expect(cap.value).toBe("3");
    fireEvent.click(screen.getByTestId("orders-auto"));
    expect(cap.value).toBe("");
    await act(async () => fireEvent.click(screen.getByTestId("orders-settings-save")));
    expect(api.put.mock.calls[0][1].auto_confirm_slot_cap).toBeNull();
  });
});
