// MEH-3932 — a product that must be ordered some days ahead: the line under
// it, the order sheet's slots (no rule / the boundary day / too soon for all),
// the Israel clock, and the owner's field in the orders tab.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator } from "next-intl";

import he from "@/messages/he.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(() => new Promise(() => {})), put: vi.fn() } }));

import OrderSheet from "@/components/public/OrderSheet";
import ProductWeekdaysLine from "@/components/public/ProductWeekdaysLine";
import LeadDaysField, { LEAD_DAY_CHOICES } from "@/components/dashboard/orders/LeadDaysField";
import OrderProductsCard from "@/components/dashboard/orders/OrderProductsCard";
import api from "@/lib/api";
import { availabilityLine, daysAhead, limitingProduct, slotsForProducts, takesSlot } from "@/lib/product-weekdays";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const JAM = "0d000000-0000-4000-8000-00000000000d";
const FRI_BIT = 1 << 5;

// Now: Wednesday 18/11/2026 10:00 Israel. Thursday is 1 day ahead, Friday 2.
const NOW = new Date("2026-11-18T08:00:00Z");
const THU_SLOT = { start: "2026-11-19T08:00:00Z", end: "2026-11-19T09:00:00Z", fulfilment: "pickup", alcohol_ok: true };
const FRI_SLOT = { start: "2026-11-20T08:00:00Z", end: "2026-11-20T09:00:00Z", fulfilment: "pickup", alcohol_ok: true };
const SLOTS = [THU_SLOT, FRI_SLOT];

const product = (id, name, over = {}) => ({
  id, name, image_url: null, price_min_agorot: 2800, price_max_agorot: 2800, price_unit: "unit",
  price_is_estimate: false, in_stock: true, contains_alcohol: false, available_weekdays: null, lead_days: null, ...over,
});
const tw = createTranslator({ locale: "he", messages: he, namespace: "product_weekdays" });

describe("the lead-days rule", () => {
  it("counts whole days on the Israel clock: 21:30Z Wednesday is Wednesday, 22:30Z is Thursday", () => {
    expect(daysAhead("2026-11-18", THU_SLOT.start)).toBe(1);
    expect(daysAhead("2026-11-18", "2026-11-18T21:30:00Z")).toBe(0);
    expect(daysAhead("2026-11-18", "2026-11-18T22:30:00Z")).toBe(1);
  });

  it("no rule takes every slot; the day exactly lead days off is in, a day sooner is out", () => {
    expect(slotsForProducts(SLOTS, [product(BREAD, "חלה")], NOW)).toEqual(SLOTS);
    expect(slotsForProducts(SLOTS, [product(BREAD, "חלה", { lead_days: 1 })], NOW)).toEqual(SLOTS);
    expect(slotsForProducts(SLOTS, [product(BREAD, "חלה", { lead_days: 2 })], NOW)).toEqual([FRI_SLOT]);
    expect(takesSlot(product(BREAD, "חלה", { lead_days: 2 }), THU_SLOT.start, "2026-11-18")).toBe(false);
  });

  it("works with the days a product is made: both must allow the slot", () => {
    const thuOnly = product(BREAD, "חלה", { available_weekdays: 1 << 4, lead_days: 2 });
    expect(slotsForProducts(SLOTS, [thuOnly], NOW)).toEqual([]);
    const friOnly = product(BREAD, "חלה", { available_weekdays: FRI_BIT, lead_days: 2 });
    expect(slotsForProducts(SLOTS, [friOnly], NOW)).toEqual([FRI_SLOT]);
  });

  it("when no slot is far enough, names the product that needs the lead", () => {
    const cart = [product(JAM, "ריבה"), product(BREAD, "חלה", { lead_days: 3 })];
    expect(slotsForProducts(SLOTS, cart, NOW)).toEqual([]);
    expect(limitingProduct(SLOTS, cart, NOW)?.name).toBe("חלה");
  });

  it("the line reads one day, two days, many days, and joins the days a product is made", () => {
    expect(availabilityLine(product(BREAD, "חלה"), tw)).toBeNull();
    expect(availabilityLine(product(BREAD, "חלה", { lead_days: 1 }), tw)).toBe("צריך להזמין יום אחד מראש");
    expect(availabilityLine(product(BREAD, "חלה", { lead_days: 2 }), tw)).toBe("צריך להזמין יומיים מראש");
    expect(availabilityLine(product(BREAD, "חלה", { lead_days: 5 }), tw)).toBe("צריך להזמין 5 ימים מראש");
    expect(availabilityLine(product(BREAD, "חלה", { available_weekdays: FRI_BIT, lead_days: 2 }), tw)).toBe("זמין בימי שישי · צריך להזמין יומיים מראש");
  });
});

const withIntl = (node) => <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>;

describe("the line under a product", () => {
  it("shows the lead, and nothing for a product with no rule", () => {
    const { rerender } = render(withIntl(<ProductWeekdaysLine product={product(BREAD, "חלה")} />));
    expect(screen.queryByTestId("product-weekdays-line")).toBeNull();
    rerender(withIntl(<ProductWeekdaysLine product={product(BREAD, "חלה", { lead_days: 2 })} />));
    expect(screen.getByTestId("product-weekdays-line").textContent).toBe("צריך להזמין יומיים מראש");
  });
});

describe("OrderSheet — lead days", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const renderSheet = (products, picks) => {
    const menu = {
      producer_id: PRODUCER, min_order_agorot: null, cancel_cutoff_hours: 12, lead_time_hours: 0,
      business_id_number: "512345678", products, slots: SLOTS,
    };
    return render(withIntl(<OrderSheet producer={{ id: PRODUCER }} menu={menu} picks={picks} onChange={() => {}} onClose={() => {}} />));
  };
  const offered = () => [...screen.getByTestId("order-sheet-slot").querySelectorAll("[role=radio]")].map((b) => b.getAttribute("data-value"));

  it("a two-day product offers only Friday", () => {
    renderSheet([product(BREAD, "חלה", { lead_days: 2 }), product(JAM, "ריבה")], { [BREAD]: 1, [JAM]: 1 });
    expect(offered()).toEqual([FRI_SLOT.start]);
  });

  it("too soon for every slot: names the product and its lead, offers to remove it", () => {
    renderSheet([product(BREAD, "חלה", { lead_days: 3 }), product(JAM, "ריבה")], { [BREAD]: 1, [JAM]: 1 });
    expect(screen.queryByTestId("order-sheet-slot")).toBeNull();
    expect(screen.getByTestId("order-sheet-day-conflict").textContent).toContain("«חלה» צריך להזמין 3 ימים מראש");
    expect(screen.getByTestId("order-sheet-day-conflict-remove")).toBeTruthy();
  });
});

describe("the owner's field", () => {
  it("offers «בלי» and the days up to 14, shows the saved value, and saves a change", () => {
    const onSave = vi.fn();
    render(withIntl(<LeadDaysField id="x" value={2} busy={false} onSave={onSave} />));
    const select = /** @type {HTMLSelectElement} */ (screen.getByTestId("lead-days-x"));
    expect(select.value).toBe("2");
    expect([...select.options].map((o) => o.textContent)).toEqual([
      "בלי, כל מועד פתוח", "יום אחד מראש", "יומיים מראש", "3 ימים מראש", "4 ימים מראש",
      "5 ימים מראש", "6 ימים מראש", "7 ימים מראש", "10 ימים מראש", "14 ימים מראש",
    ]);
    expect(Math.max(...LEAD_DAY_CHOICES)).toBe(14); // the server's cap
    fireEvent.change(select, { target: { value: "3" } });
    expect(onSave).toHaveBeenLastCalledWith(3);
    fireEvent.change(select, { target: { value: "" } });
    expect(onSave).toHaveBeenLastCalledWith(null);
  });

  it("the products card sends lead_days through the ordering route", async () => {
    api.put.mockResolvedValue({
      data: { id: BREAD, is_orderable: true, in_stock: true, price_unit: "unit", contains_alcohol: false, daily_limit: null, lead_days: 2, variants: [] },
    });
    const row = { id: BREAD, name: "חלה", has_price: true, is_orderable: true, in_stock: true, price_unit: "unit", contains_alcohol: false, daily_limit: null, lead_days: null, variants: [] };
    render(withIntl(<OrderProductsCard initial={[row]} />));
    const select = /** @type {HTMLSelectElement} */ (screen.getByTestId(`lead-days-lead-${BREAD}`));
    expect(select.value).toBe("");
    await act(async () => fireEvent.change(select, { target: { value: "2" } }));
    expect(api.put).toHaveBeenCalledWith(`/producers/me/products/${BREAD}/ordering`, expect.objectContaining({ lead_days: 2 }));
    expect(select.value).toBe("2");
  });
});
