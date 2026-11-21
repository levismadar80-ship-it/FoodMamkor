// MEH-3618 — a product made only on some days: the line, the editor, and the
// order sheet's slots (0 limited / 1 / many with a shared day / many without).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";

import he from "@/messages/he.json";

vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ default: { post: vi.fn(() => new Promise(() => {})) } }));

import OrderSheet from "@/components/public/OrderSheet";
import ProductWeekdaysLine from "@/components/public/ProductWeekdaysLine";
import ProductWeekdaysField from "@/components/dashboard/ProductWeekdaysField";
import { cartSlots, daysOf, israelWeekday, isOpen, limitingProduct, maskOf, slotsForProducts, weekdaysLine } from "@/lib/product-weekdays";
import { lineKey } from "@/lib/product-variants";

const PRODUCER = "7e57a6f0-0000-4000-8000-000000000007";
const BREAD = "0a000000-0000-4000-8000-00000000000a";
const CAKE = "0b000000-0000-4000-8000-00000000000b";
const JAM = "0d000000-0000-4000-8000-00000000000d";
const THU = 4;
const FRI = 5;
const SAT = 6;
const bit = (d) => 1 << d;
const tw = (key, values) => {
  const raw = he.product_weekdays[key];
  return raw.replace(/\{(\w+)\}/g, (_, k) => values[k]);
};

// Thursday 19/11 and Friday 20/11/2026, on the Israel clock (UTC+2).
const THU_SLOT = { start: "2026-11-19T08:00:00Z", end: "2026-11-19T09:00:00Z", fulfilment: "pickup", alcohol_ok: true };
const FRI_SLOT = { start: "2026-11-20T08:00:00Z", end: "2026-11-20T09:00:00Z", fulfilment: "pickup", alcohol_ok: true };
const SLOTS = [THU_SLOT, FRI_SLOT];

const product = (id, name, mask = null) => ({
  id, name, image_url: null, price_min_agorot: 2800, price_max_agorot: 2800, price_unit: "unit",
  price_is_estimate: false, in_stock: true, contains_alcohol: false, available_weekdays: mask,
});

describe("product-weekdays helpers", () => {
  it("null is every day; a mask is its days, Sunday first", () => {
    expect(daysOf(null)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(daysOf(bit(THU) | bit(FRI))).toEqual([THU, FRI]);
    expect(maskOf([0, 1, 2, 3, 4, 5, 6])).toBeNull();
    expect(maskOf([FRI])).toBe(32);
    expect(isOpen(null, 2)).toBe(true);
    expect(isOpen(bit(FRI), THU)).toBe(false);
  });

  it("the line: one day by name, a run with a dash, nothing for every day", () => {
    expect(weekdaysLine(null, tw)).toBeNull();
    expect(weekdaysLine(127, tw)).toBeNull();
    expect(weekdaysLine(bit(FRI), tw)).toBe("זמין בימי שישי");
    expect(weekdaysLine(bit(THU) | bit(FRI), tw)).toBe("זמין בימים ה׳–ו׳");
    expect(weekdaysLine(bit(0) | bit(2) | bit(3), tw)).toBe("זמין בימים א׳, ג׳–ד׳");
  });

  it("reads the day on the Israel clock: Thursday 23:30 is Thursday, Friday 00:30 is Friday", () => {
    expect(israelWeekday("2026-11-19T21:30:00Z")).toBe(THU);
    expect(israelWeekday("2026-11-19T22:30:00Z")).toBe(FRI); // a Thursday on the UTC calendar
  });

  it("0 limited products: every slot", () => {
    expect(slotsForProducts(SLOTS, [product(BREAD, "חלה")])).toEqual(SLOTS);
    expect(limitingProduct(SLOTS, [product(BREAD, "חלה")])).toBeNull();
  });

  it("1 limited product: only its days", () => {
    expect(slotsForProducts(SLOTS, [product(BREAD, "חלה", bit(FRI))])).toEqual([FRI_SLOT]);
  });

  it("many with a shared day: only the shared one", () => {
    const cart = [product(BREAD, "חלה", bit(THU) | bit(FRI)), product(CAKE, "עוגה", bit(FRI) | bit(SAT)), product(JAM, "ריבה")];
    expect(slotsForProducts(SLOTS, cart)).toEqual([FRI_SLOT]);
    expect(limitingProduct(SLOTS, cart)).toBeNull();
  });

  it("many with no shared day: none, and the product to name is the one whose removal frees a slot", () => {
    const bread = product(BREAD, "חלה", bit(FRI));
    const cake = product(CAKE, "עוגה", bit(THU) | bit(SAT));
    expect(slotsForProducts(SLOTS, [bread, cake])).toEqual([]);
    expect(limitingProduct(SLOTS, [bread, cake])).toBe(bread);
    // No slot at all is not a day conflict.
    expect(limitingProduct([], [bread])).toBeNull();
  });

  it("cartSlots reads the products of the picks, variant keys included", () => {
    const byId = new Map([[BREAD, product(BREAD, "חלה", bit(FRI))]]);
    expect(cartSlots(SLOTS, { [lineKey(BREAD, "v1")]: 1 }, byId).slots).toEqual([FRI_SLOT]);
  });
});

function withIntl(node) {
  return <NextIntlClientProvider locale="he" messages={he} timeZone="Asia/Jerusalem">{node}</NextIntlClientProvider>;
}

describe("ProductWeekdaysLine", () => {
  it("shows the line for a limited product and nothing otherwise", () => {
    const { rerender } = render(withIntl(<ProductWeekdaysLine product={{ available_weekdays: null }} />));
    expect(screen.queryByTestId("product-weekdays-line")).toBeNull();
    rerender(withIntl(<ProductWeekdaysLine product={{ available_weekdays: bit(FRI) }} />));
    expect(screen.getByTestId("product-weekdays-line").textContent).toBe("זמין בימי שישי");
  });
});

function Field({ initial = null, onMask = () => {} }) {
  const [mask, setMask] = useState(initial);
  return <ProductWeekdaysField idPrefix="p" value={mask} onChange={(m) => { setMask(m); onMask(m); }} />;
}

describe("ProductWeekdaysField", () => {
  it("starts on «כל הימים», picks days, refuses none, and back to every day", () => {
    const onMask = vi.fn();
    render(withIntl(<Field onMask={onMask} />));
    expect(screen.getByTestId("product-weekdays-every").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`));
    expect(onMask).toHaveBeenLastCalledWith(bit(FRI));
    expect(screen.getByTestId("product-weekdays-every").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByTestId(`product-weekday-${THU}`));
    expect(onMask).toHaveBeenLastCalledWith(bit(THU) | bit(FRI));
    fireEvent.click(screen.getByTestId(`product-weekday-${THU}`));
    fireEvent.click(screen.getByTestId(`product-weekday-${FRI}`));
    expect(onMask).toHaveBeenLastCalledWith(0);
    expect(screen.getByText(he.product_weekdays.none_picked)).toBeTruthy();
    fireEvent.click(screen.getByTestId("product-weekdays-every"));
    expect(onMask).toHaveBeenLastCalledWith(null);
    expect(screen.queryByText(he.product_weekdays.none_picked)).toBeNull();
  });

  it("names each day chip in full for a screen reader", () => {
    render(withIntl(<Field initial={bit(FRI)} />));
    expect(screen.getByRole("button", { name: "שישי" }).getAttribute("aria-pressed")).toBe("true");
  });
});

function renderSheet(products, picks, onChange = () => {}) {
  const menu = {
    producer_id: PRODUCER, min_order_agorot: null, cancel_cutoff_hours: 12, lead_time_hours: 0,
    business_id_number: "512345678", products, slots: SLOTS,
  };
  return render(withIntl(<OrderSheet producer={{ id: PRODUCER }} menu={menu} picks={picks} onChange={onChange} onClose={() => {}} />));
}

const slotOptions = () => [...screen.getByTestId("order-sheet-slot").querySelectorAll("option")].filter((o) => o.value);

describe("OrderSheet — days (MEH-3618)", () => {
  it("null masks: both slots, as before", () => {
    renderSheet([product(BREAD, "חלה")], { [BREAD]: 1 });
    expect(slotOptions().map((o) => o.value)).toEqual([THU_SLOT.start, FRI_SLOT.start]);
    expect(screen.queryByTestId("order-sheet-day-conflict")).toBeNull();
  });

  it("one limited product: only its day is offered", () => {
    renderSheet([product(BREAD, "חלה", bit(FRI)), product(JAM, "ריבה")], { [BREAD]: 1, [JAM]: 1 });
    expect(slotOptions().map((o) => o.value)).toEqual([FRI_SLOT.start]);
  });

  it("a picked slot the cart stops allowing is dropped, not kept hidden", () => {
    const products = [product(BREAD, "חלה"), product(CAKE, "עוגה", bit(FRI))];
    const { rerender } = renderSheet(products, { [BREAD]: 1 });
    fireEvent.change(screen.getByTestId("order-sheet-slot"), { target: { value: THU_SLOT.start } });
    expect(screen.getByTestId("order-sheet-slot").value).toBe(THU_SLOT.start);
    const menu = { producer_id: PRODUCER, min_order_agorot: null, cancel_cutoff_hours: 12, lead_time_hours: 0, business_id_number: "512345678", products, slots: SLOTS };
    rerender(withIntl(<OrderSheet producer={{ id: PRODUCER }} menu={menu} picks={{ [BREAD]: 1, [CAKE]: 1 }} onChange={() => {}} onClose={() => {}} />));
    expect(slotOptions().map((o) => o.value)).toEqual([FRI_SLOT.start]);
    expect(screen.getByTestId("order-sheet-slot").value).toBe("");
  });

  it("no shared day: names the product, offers to remove it, and sends nothing", () => {
    const onChange = vi.fn();
    renderSheet([product(BREAD, "חלה", bit(FRI)), product(CAKE, "עוגה", bit(THU) | bit(SAT))], { [BREAD]: 2, [CAKE]: 1 }, onChange);
    expect(screen.queryByTestId("order-sheet-slot")).toBeNull();
    expect(screen.getByTestId("order-sheet-day-conflict").textContent).toContain("«חלה» זמין בימי שישי");
    expect(screen.getByTestId("order-sheet-send").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByTestId("order-sheet-day-conflict-remove"));
    expect(onChange).toHaveBeenCalledWith(BREAD, 0);
  });
});
